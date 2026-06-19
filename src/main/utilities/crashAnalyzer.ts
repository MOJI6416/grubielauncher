import { BACKEND_URL } from "@/shared/config";
import { CrashAnalysisPayload, CrashRule } from "@/types/CrashAnalysis";
import { IVersionConf } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import {
  BUILT_IN_CRASH_RULES,
  extractCrashSignature,
  matchCrashRules,
  sanitizeCrashRules,
} from "./crashRules";
import { app } from "electron";
import axios from "axios";
import fs from "fs-extra";
import path from "path";

const CRASH_REPORT_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_SOURCE_BYTES = 256 * 1024;
const RULES_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedRemoteRules: CrashRule[] | null = null;
let cachedRemoteRulesAt = 0;

async function getCrashRules(): Promise<CrashRule[]> {
  if (
    cachedRemoteRules &&
    Date.now() - cachedRemoteRulesAt < RULES_CACHE_TTL_MS
  ) {
    return [...cachedRemoteRules, ...BUILT_IN_CRASH_RULES];
  }

  try {
    const response = await axios.get(`${BACKEND_URL}/crash-rules.json`, {
      timeout: 5000,
    });
    const remoteRules = sanitizeCrashRules(response.data);

    cachedRemoteRules = remoteRules;
    cachedRemoteRulesAt = Date.now();

    return [...remoteRules, ...BUILT_IN_CRASH_RULES];
  } catch {
    return BUILT_IN_CRASH_RULES;
  }
}

async function readFileTail(filePath: string): Promise<string | null> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;

    const start = Math.max(0, stats.size - MAX_SOURCE_BYTES);
    const stream = fs.createReadStream(filePath, {
      start,
      encoding: "utf-8",
    });

    let content = "";
    for await (const chunk of stream) {
      content += chunk;
    }

    return content;
  } catch {
    return null;
  }
}

async function findRecentCrashReport(
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

export async function analyzeGameCrash(
  versionPath: string,
  exitCode?: number,
): Promise<CrashAnalysisPayload | null> {
  const reportPath = await findRecentCrashReport(versionPath);

  let text: string | null = null;
  if (reportPath) {
    text = await readFileTail(reportPath);
  }

  if (!text) {
    text = await readFileTail(path.join(versionPath, "logs", "latest.log"));
  }

  const rules = await getCrashRules();
  const match = matchCrashRules(text || "", rules, exitCode);

  if (!match) {
    const sample = extractCrashSignature(text || "", exitCode);
    void reportCrashRuleHit("unknown", versionPath, sample).catch(() => {});
    return null;
  }

  void reportCrashRuleHit(match.ruleId, versionPath).catch(() => {});

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
      `${BACKEND_URL}/crash-analytics`,
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
