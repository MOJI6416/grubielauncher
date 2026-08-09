import { CrashAnalysisPayload, CrashRule } from "@/types/CrashAnalysis";
import { IVersionConf } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import {
  BUILT_IN_CRASH_RULES,
  CrashMatch,
  CrashPattern,
  crashPatternKey,
  crashRuleCulpritPattern,
  crashRulePatterns,
  extractCrashSignature,
  MAX_CULPRITS,
  sanitizeCrashRules,
  selectCrashRule,
} from "./crashRules";
import { runCrashRegexJobs } from "./crashRegexWorker";
import { app } from "electron";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { getApiBaseUrl } from "./apiHost";

const CRASH_REPORT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SOURCE_BYTES = 256 * 1024;
const RULES_CACHE_TTL_MS = 60 * 60 * 1000;
const RULES_INCOMPLETE_RULE_ID = "rules_incomplete";
const MAX_PATTERN_RUN_ATTEMPTS = 3;

let cachedRemoteRules: CrashRule[] | null = null;
let cachedRemoteRulesAt = 0;
const stalledPatterns = new Set<string>();

async function getCrashRules(): Promise<CrashRule[]> {
  if (
    cachedRemoteRules &&
    Date.now() - cachedRemoteRulesAt < RULES_CACHE_TTL_MS
  ) {
    return [...cachedRemoteRules, ...BUILT_IN_CRASH_RULES];
  }

  stalledPatterns.clear();

  try {
    const response = await axios.get(`${getApiBaseUrl()}/crash-rules.json`, {
      timeout: 5000,
    });
    const remoteRules = sanitizeCrashRules(response.data);

    cachedRemoteRules = remoteRules;
    cachedRemoteRulesAt = Date.now();

    return [...remoteRules, ...BUILT_IN_CRASH_RULES];
  } catch {
    cachedRemoteRules = [];
    cachedRemoteRulesAt = Date.now();

    return BUILT_IN_CRASH_RULES;
  }
}

export async function readCrashSource(
  filePath: string,
): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;

    const start = Math.max(0, stats.size - MAX_SOURCE_BYTES);
    const stream = fs.createReadStream(filePath, { start });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }

    let buffer = Buffer.concat(chunks);
    if (start > 0) {
      const newlineIndex = buffer.indexOf(0x0a);
      if (newlineIndex !== -1) buffer = buffer.subarray(newlineIndex + 1);
    }

    return buffer.toString("utf-8");
  } catch {
    return null;
  }
}

export async function findRecentCrashReport(
  versionPath: string,
): Promise<string | null> {
  try {
    const crashReportsPath = path.join(versionPath, "crash-reports");
    const entries = await fs.readdir(crashReportsPath);

    let newest: { filePath: string; mtimeMs: number } | null = null;
    for (const entry of entries) {
      if (!entry.endsWith(".txt")) continue;

      const filePath = path.join(crashReportsPath, entry);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats?.isFile()) continue;

      if (!newest || stats.mtimeMs > newest.mtimeMs) {
        newest = { filePath, mtimeMs: stats.mtimeMs };
      }
    }

    if (!newest) return null;
    if (Date.now() - newest.mtimeMs > CRASH_REPORT_MAX_AGE_MS) return null;

    return newest.filePath;
  } catch {
    return null;
  }
}

interface CrashRunOutcome {
  match: CrashMatch | null;
  complete: boolean;
}

async function runPatternVerdicts(
  text: string,
  patterns: CrashPattern[],
): Promise<{ table: Map<string, boolean>; complete: boolean }> {
  const table = new Map<string, boolean>();
  let pending = patterns;
  let complete = true;

  for (
    let attempt = 0;
    attempt < MAX_PATTERN_RUN_ATTEMPTS && pending.length > 0;
    attempt += 1
  ) {
    const run = await runCrashRegexJobs(text, pending, MAX_CULPRITS);

    pending.forEach((entry, position) => {
      const value = run.results[position];
      if (value !== null) {
        table.set(crashPatternKey(entry.pattern, entry.flags), value === true);
      }
    });

    if (run.stalledAt === null) {
      if (run.results.some((value) => value === null)) complete = false;
      return { table, complete };
    }

    const stalled = pending[run.stalledAt];
    stalledPatterns.add(crashPatternKey(stalled.pattern, stalled.flags));
    pending = pending.slice(run.stalledAt + 1);
    complete = false;
  }

  return { table, complete: complete && pending.length === 0 };
}

async function matchCrashRulesOffThread(
  text: string,
  rules: CrashRule[],
  exitCode?: number,
): Promise<CrashRunOutcome> {
  const all = text ? crashRulePatterns(rules) : [];
  const patterns = all.filter(
    (entry) => !stalledPatterns.has(crashPatternKey(entry.pattern, entry.flags)),
  );

  const { table, complete: ran } = await runPatternVerdicts(text, patterns);
  const complete = ran && patterns.length === all.length;

  const best = selectCrashRule(
    rules,
    (pattern, flags) => table.get(crashPatternKey(pattern, flags)) === true,
    exitCode,
  );
  if (!best) return { match: null, complete };

  let culprits: string[] = [];
  const culpritPattern = text ? crashRuleCulpritPattern(best) : null;
  const culpritKey = culpritPattern
    ? crashPatternKey(culpritPattern.pattern, culpritPattern.flags)
    : null;
  if (culpritPattern && culpritKey && !stalledPatterns.has(culpritKey)) {
    const captured = await runCrashRegexJobs(
      text,
      [{ ...culpritPattern, capture: true }],
      MAX_CULPRITS,
    );
    const first = captured.results[0];
    if (Array.isArray(first)) culprits = first;
    if (captured.stalledAt !== null) stalledPatterns.add(culpritKey);
  }

  return {
    match: { ruleId: best.id, messages: best.messages, culprits },
    complete,
  };
}

export async function analyzeGameCrash(
  versionPath: string,
  exitCode?: number,
): Promise<CrashAnalysisPayload | null> {
  const reportPath = await findRecentCrashReport(versionPath);

  let text: string | null = null;
  if (reportPath) {
    text = await readCrashSource(reportPath);
  }

  if (!text) {
    text = await readCrashSource(path.join(versionPath, "logs", "latest.log"));
  }

  const rules = await getCrashRules();
  const { match, complete } = await matchCrashRulesOffThread(
    text || "",
    rules,
    exitCode,
  );

  if (!complete) {
    void reportCrashRuleHit(RULES_INCOMPLETE_RULE_ID, versionPath).catch(
      () => {},
    );
  } else if (match) {
    void reportCrashRuleHit(match.ruleId, versionPath).catch(() => {});
  } else {
    const sample = extractCrashSignature(text || "", exitCode);
    void reportCrashRuleHit("unknown", versionPath, sample).catch(() => {});
  }

  if (!match) return null;

  return {
    ruleId: match.ruleId,
    messages: match.messages,
    culprits: match.culprits,
    reportPath,
  };
}

async function reportCrashRuleHit(
  ruleId: string,
  versionPath: string,
  sample?: string,
): Promise<void> {
  try {
    const launcherPath = path.join(app.getPath("appData"), ".grubielauncher");
    const settings = (await fs
      .readJSON(path.join(launcherPath, "settings.json"))
      .catch(() => null)) as Partial<TSettings> | null;

    if (settings?.crashTelemetry === false) return;

    const versionConf = (await fs
      .readJSON(path.join(versionPath, "version.json"))
      .catch(() => null)) as IVersionConf | null;

    await axios.post(
      `${getApiBaseUrl()}/crash-analytics`,
      {
        ruleId,
        mcVersion: versionConf?.version?.id || undefined,
        loaderName: versionConf?.loader?.name || undefined,
        launcherVersion: app.getVersion(),
        sample: sample || undefined,
      },
      { timeout: 5000 },
    );
  } catch {}
}
