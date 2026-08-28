import fs from "fs-extra";
import path from "path";
import { randomUUID } from "crypto";
import { app } from "electron";
import { IAiLogContext, IAiLogRequest } from "@/types/AiAnalysis";
import { IVersionConf } from "@/types/IVersion";
import { TSettings } from "@/types/Settings";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";
import { findRecentCrashReport, readCrashSource } from "./crashAnalyzer";
import { getConsoleOutput } from "./consoleBuffer";
import { prepareLogForAnalysis } from "@/shared/logSanitizer";
import { getLauncherPaths } from "./other";

const MAX_LOG_CHARS = 40000;
const MAX_DEBUG_CHARS = 12000;
const MAX_DUMP_CHARS = 8000;
const RECENT_SOURCE_MAX_AGE_MS = 10 * 60 * 1000;
const MAX_MODS = 400;
const MOD_EXTENSIONS = [".jar", ".jar.disabled", ".disabled"];

const PREPARED_TTL_MS = 30 * 60 * 1000;
const MAX_PREPARED = 5;

const preparedRequests = new Map<
  string,
  { request: IAiLogRequest; createdAt: number }
>();

function prunePrepared() {
  const now = Date.now();

  for (const [id, entry] of preparedRequests) {
    if (now - entry.createdAt > PREPARED_TTL_MS) preparedRequests.delete(id);
  }

  while (preparedRequests.size > MAX_PREPARED) {
    const oldest = preparedRequests.keys().next().value;
    if (!oldest) break;
    preparedRequests.delete(oldest);
  }
}

export function getPreparedRequest(id: string): IAiLogRequest | null {
  prunePrepared();

  return preparedRequests.get(id)?.request ?? null;
}

async function readSettings(): Promise<Partial<TSettings> | null> {
  const { launcher } = getLauncherPaths();

  return (await fs
    .readJSON(path.join(launcher, "settings.json"))
    .catch(() => null)) as Partial<TSettings> | null;
}

async function readVersionConf(
  versionPath: string,
): Promise<IVersionConf | null> {
  return (await fs
    .readJSON(path.join(versionPath, "version.json"))
    .catch(() => null)) as IVersionConf | null;
}

async function resolveJavaMajor(mcVersion?: string): Promise<number | null> {
  if (!mcVersion) return null;

  const { minecraft } = getLauncherPaths();
  const manifest = (await fs
    .readJSON(path.join(minecraft, "versions", mcVersion, `${mcVersion}.json`))
    .catch(() => null)) as { javaVersion?: { majorVersion?: number } } | null;

  const major = manifest?.javaVersion?.majorVersion;
  if (typeof major === "number" && major > 0) return major;

  return mcVersionToJavaMajor(mcVersion);
}

async function listMods(versionPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(versionPath, "mods"));

    return entries
      .filter((entry) =>
        MOD_EXTENSIONS.some((extension) =>
          entry.toLowerCase().endsWith(extension),
        ),
      )
      .slice(0, MAX_MODS);
  } catch {
    return [];
  }
}

function resolveMemoryMb(
  settings: Partial<TSettings> | null,
  conf: IVersionConf | null,
): number | undefined {
  const override = conf?.overrides?.xmx;
  if (typeof override === "number" && override > 0) return Math.round(override);

  return typeof settings?.xmx === "number" && settings.xmx > 0
    ? settings.xmx
    : undefined;
}

async function findRecentJvmDump(versionPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(versionPath);

    let newest: { filePath: string; mtimeMs: number } | null = null;
    for (const entry of entries) {
      if (!/^hs_err_pid\d+\.log$/i.test(entry)) continue;

      const filePath = path.join(versionPath, entry);
      const stats = await fs.stat(filePath).catch(() => null);
      if (!stats?.isFile()) continue;

      if (!newest || stats.mtimeMs > newest.mtimeMs) {
        newest = { filePath, mtimeMs: stats.mtimeMs };
      }
    }

    if (!newest) return null;
    if (Date.now() - newest.mtimeMs > RECENT_SOURCE_MAX_AGE_MS) return null;

    return newest.filePath;
  } catch {
    return null;
  }
}

const DUMP_CUT_MARKERS = [
  /^-+\s*S\s*Y\s*S\s*T\s*E\s*M\s*-+$/im,
  /^Environment Variables:/im,
  /^\s*\/proc\/meminfo/im,
];

function trimJvmDump(dump: string) {
  let cut = dump.length;

  for (const marker of DUMP_CUT_MARKERS) {
    const match = marker.exec(dump);
    if (match && match.index < cut) cut = match.index;
  }

  return dump.slice(0, cut);
}

const TRUNCATION_TAIL_LINES = 50;
const SHUTDOWN_MARKER =
  /stopping!|shutting down|game closed|\bhalt(?:ing|ed)?\b/i;

function endsWithoutEvidence(text: string) {
  const tail = text.split(/\r?\n/).slice(-TRUNCATION_TAIL_LINES).join("\n");

  if (SHUTDOWN_MARKER.test(tail)) return false;

  return !/exception|caused by|\bat [\w$.]+\(|fatal error/i.test(tail);
}

export async function buildLogAnalysisRequest(
  versionPath: string,
  options: {
    exitCode?: number;
    nickname?: string;
    versionName?: string;
    instance?: number;
  } = {},
): Promise<IAiLogRequest | null> {
  const reportPath = await findRecentCrashReport(versionPath);

  const latest = await readCrashSource(
    path.join(versionPath, "logs", "latest.log"),
  );
  const report = reportPath ? await readCrashSource(reportPath) : null;

  const dumpPath = await findRecentJvmDump(versionPath);
  const rawDump = dumpPath ? await readCrashSource(dumpPath) : null;
  const dump = rawDump ? trimJvmDump(rawDump) : null;

  const consoleOutput =
    options.versionName !== undefined && options.instance !== undefined
      ? getConsoleOutput(options.versionName, options.instance)
      : "";

  const truncated =
    !report &&
    !dump &&
    endsWithoutEvidence([latest, consoleOutput].filter(Boolean).join("\n"));

  const debugTail = truncated
    ? await readCrashSource(path.join(versionPath, "logs", "debug.log"))
    : null;

  const parts = [
    latest,
    debugTail ? debugTail.slice(-MAX_DEBUG_CHARS) : null,
    consoleOutput ? `--- Launcher console output ---\n${consoleOutput}` : null,
    dump ? dump.slice(0, MAX_DUMP_CHARS) : null,
    report,
  ];

  const source = parts.filter(Boolean).join("\n");
  if (!source.trim()) return null;

  const [conf, mods, settings] = await Promise.all([
    readVersionConf(versionPath),
    listMods(versionPath),
    readSettings(),
  ]);

  const mcVersion = conf?.version?.id || undefined;
  const javaMajor = await resolveJavaMajor(mcVersion);

  const context: IAiLogContext = {
    mcVersion,
    loaderName: conf?.loader?.name || undefined,
    loaderVersion: conf?.loader?.version?.id || undefined,
    javaVersion: javaMajor ? String(javaMajor) : undefined,
    javaArch: process.arch,
    memoryMb: resolveMemoryMb(settings, conf),
    os: `${process.platform} ${process.arch}`,
    exitCode: options.exitCode,
    mods,
  };

  const request: IAiLogRequest = {
    id: randomUUID(),
    log: prepareLogForAnalysis(source, {
      maxChars: MAX_LOG_CHARS,
      nickname: options.nickname,
    }),
    context,
    reportPath,
  };

  preparedRequests.set(request.id, { request, createdAt: Date.now() });
  prunePrepared();

  return request;
}

export function getLauncherVersion(): string {
  return app.getVersion();
}
