import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { gzip } from "zlib";
import { promisify } from "util";
import { randomUUID } from "crypto";
import {
  getJournalWriter,
  journal,
  journalSessionId,
  sanitizeJournalValue,
} from "./journal";
import { getDataRoot } from "../utilities/dataRoot";
import { getLauncherPaths } from "../utilities/other";
import { getFreeBytes } from "../utilities/diskSpace";
import { getApiBaseUrl } from "../utilities/apiHost";
import { getDownloadSource, getMojangReachable, isMirrorDisabled } from "../utilities/mirrorState";
import {
  getAccountKey,
  getSelectedAccount,
  readAccountsConfig,
} from "../utilities/accounts";
import { runConnectivityTests } from "../utilities/connectivityTest";
import { gameRuntime } from "../utilities/runtime";
import type { IVersionConf } from "@/types/IVersion";
import type { ILocalProject } from "@/types/ModManager";
import type { ConnectivityCheckResult } from "@/types/Connectivity";
import type {
  SupportBundle,
  SupportBundleAttachment,
  SupportBundleInstance,
  SupportReportPrepared,
  SupportReportRequest,
  SupportReportSection,
  SupportReportSectionId,
} from "@/types/Journal";

const gzipAsync = promisify(gzip);

const JOURNAL_MAX_BYTES = 6 * 1024 * 1024;
const JOURNAL_WINDOW_MS = 72 * 60 * 60 * 1000;
const MAX_INSTANCES = 120;
const MAX_MODS_LISTED = 1500;
const MAX_JAVA_RUNTIMES = 20;
const MAX_CRASH_DUMPS = 10;
const CONNECTIVITY_TIMEOUT_MS = 25_000;
const PREPARED_TTL_MS = 30 * 60 * 1000;
const MAX_PREPARED = 3;
const MAX_COMMENT_CHARS = 4000;

const ATTACHMENT_LIMITS = {
  latestLog: 1536 * 1024,
  debugLog: 1024 * 1024,
  crashReport: 400 * 1024,
  nativeDump: 300 * 1024,
};

interface PreparedReport {
  gz: Buffer;
  createdAt: number;
  summary: SupportReportPrepared;
  trigger: SupportReportRequest["trigger"];
}

const prepared = new Map<string, PreparedReport>();

export async function readFileTail(
  filePath: string,
  maxBytes: number,
): Promise<{ text: string; size: number; truncated: boolean } | null> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);

    let text = buffer.toString("utf8");
    if (size > maxBytes) {
      const firstBreak = text.indexOf("\n");
      if (firstBreak !== -1) text = text.slice(firstBreak + 1);
    }

    return { text, size, truncated: size > maxBytes };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function newestMatching(
  dir: string,
  pattern: RegExp,
  count: number,
): Promise<Array<{ path: string; name: string; mtimeMs: number; size: number }>> {
  const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
  const matches: Array<{
    path: string;
    name: string;
    mtimeMs: number;
    size: number;
  }> = [];

  for (const name of names) {
    if (!pattern.test(name)) continue;
    const filePath = path.join(dir, name);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (!stats?.isFile()) continue;
    matches.push({ path: filePath, name, mtimeMs: stats.mtimeMs, size: stats.size });
  }

  return matches.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, count);
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function summarizeMod(mod: ILocalProject): Record<string, unknown> {
  return {
    title: mod.title,
    type: mod.projectType,
    provider: mod.provider,
    id: mod.id,
    version: mod.version?.id,
    pinned: mod.pinned || undefined,
    files: mod.version?.files.map((file) => ({
      name: file.filename,
      size: file.size,
      disabled: file.disabled || undefined,
      server: file.isServer || undefined,
      client: file.isClient,
      local: file.localPath ? true : undefined,
    })),
  };
}

function summarizeInstance(conf: IVersionConf): SupportBundleInstance {
  return {
    name: conf.name,
    minecraft: conf.version?.id,
    loader: conf.loader?.name,
    loaderVersion: conf.loader?.version?.id,
    mods: conf.loader?.mods?.length ?? 0,
    shareCode: conf.shareCode,
    lastLaunch: conf.lastLaunch ? new Date(conf.lastLaunch).toISOString() : undefined,
    build: conf.build,
  };
}

async function readInstances(
  minecraftPath: string,
): Promise<Array<{ conf: IVersionConf; versionPath: string }>> {
  const versionsDir = path.join(minecraftPath, "versions");
  const names = await fs.promises.readdir(versionsDir).catch(() => [] as string[]);
  const instances: Array<{ conf: IVersionConf; versionPath: string }> = [];

  for (const name of names.slice(0, MAX_INSTANCES * 2)) {
    const versionPath = path.join(versionsDir, name);
    const conf = await readJson<IVersionConf>(path.join(versionPath, "version.json"));
    if (!conf?.name || !conf.version || !conf.loader) continue;
    instances.push({ conf, versionPath });
    if (instances.length >= MAX_INSTANCES) break;
  }

  return instances;
}

function pickTarget(
  instances: Array<{ conf: IVersionConf; versionPath: string }>,
  versionName: string | undefined,
): { conf: IVersionConf; versionPath: string } | null {
  if (versionName) {
    const named = instances.find((item) => item.conf.name === versionName);
    if (named) return named;
  }

  let newest: { conf: IVersionConf; versionPath: string } | null = null;
  let newestAt = 0;
  for (const item of instances) {
    const at = item.conf.lastLaunch ? new Date(item.conf.lastLaunch).getTime() : 0;
    if (at > newestAt) {
      newest = item;
      newestAt = at;
    }
  }
  return newest;
}

async function listFolder(
  dir: string,
  limit: number,
): Promise<Array<{ name: string; size: number }>> {
  const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
  const entries: Array<{ name: string; size: number }> = [];

  for (const name of names.slice(0, limit)) {
    const stats = await fs.promises.stat(path.join(dir, name)).catch(() => null);
    if (!stats) continue;
    entries.push({ name: stats.isDirectory() ? `${name}/` : name, size: stats.size });
  }

  return entries;
}

async function collectAttachments(
  versionPath: string,
  label: string,
): Promise<SupportBundleAttachment[]> {
  const attachments: SupportBundleAttachment[] = [];

  const add = async (filePath: string, name: string, limit: number) => {
    const tail = await readFileTail(filePath, limit);
    if (!tail) return;
    attachments.push({
      name: `${label}/${name}`,
      size: tail.size,
      truncated: tail.truncated,
      text: tail.text,
    });
  };

  await add(path.join(versionPath, "logs", "latest.log"), "logs/latest.log", ATTACHMENT_LIMITS.latestLog);
  await add(path.join(versionPath, "logs", "debug.log"), "logs/debug.log", ATTACHMENT_LIMITS.debugLog);

  for (const report of await newestMatching(
    path.join(versionPath, "crash-reports"),
    /^crash-.*\.txt$/i,
    2,
  )) {
    await add(report.path, `crash-reports/${report.name}`, ATTACHMENT_LIMITS.crashReport);
  }

  for (const dump of await newestMatching(versionPath, /^hs_err_pid\d+\.log$/i, 1)) {
    await add(dump.path, dump.name, ATTACHMENT_LIMITS.nativeDump);
  }

  return attachments;
}

async function collectTarget(
  target: { conf: IVersionConf; versionPath: string } | null,
): Promise<Record<string, unknown> | null> {
  if (!target) return null;

  const { conf, versionPath } = target;
  const mods = conf.loader?.mods ?? [];
  const manifestPath = path.join(versionPath, `${conf.version?.id}.json`);
  const manifest = await readJson<{ javaVersion?: { majorVersion?: number }; mainClass?: string }>(
    manifestPath,
  );

  return {
    name: conf.name,
    versionPath,
    instance: summarizeInstance(conf),
    description: conf.description,
    owner: conf.owner,
    downloadedVersion: conf.downloadedVersion,
    lastUpdate: conf.lastUpdate,
    quickServer: conf.quickServer,
    runArguments: conf.runArguments,
    overrides: conf.overrides,
    otherFiles: conf.loader?.other
      ? { paths: conf.loader.other.paths?.length, size: conf.loader.other.size }
      : undefined,
    manifest: manifest
      ? { present: true, mainClass: manifest.mainClass, javaMajor: manifest.javaVersion?.majorVersion }
      : { present: false },
    mods: mods.slice(0, MAX_MODS_LISTED).map(summarizeMod),
    modsTruncated: mods.length > MAX_MODS_LISTED || undefined,
    folders: {
      mods: await listFolder(path.join(versionPath, "mods"), MAX_MODS_LISTED),
      root: await listFolder(versionPath, 200),
    },
    running: [...gameRuntime.processes.values()]
      .filter((record) => record.versionName === conf.name)
      .map((record) => ({ instance: record.instance, pid: record.process.pid })),
  };
}

async function collectJava(javaDir: string): Promise<Array<Record<string, unknown>>> {
  const names = await fs.promises.readdir(javaDir).catch(() => [] as string[]);
  const runtimes: Array<Record<string, unknown>> = [];

  for (const name of names.slice(0, MAX_JAVA_RUNTIMES)) {
    const root = path.join(javaDir, name);
    const stats = await fs.promises.stat(root).catch(() => null);
    if (!stats?.isDirectory()) continue;

    const release = await fs.promises
      .readFile(path.join(root, "release"), "utf8")
      .catch(() => "");
    const version = /JAVA_VERSION="([^"]+)"/.exec(release)?.[1];
    const implementor = /IMPLEMENTOR="([^"]+)"/.exec(release)?.[1];
    const entries = await fs.promises.readdir(root).catch(() => [] as string[]);

    runtimes.push({ name, version, implementor, entries: entries.slice(0, 30) });
  }

  return runtimes;
}

async function collectConnectivity(): Promise<ConnectivityCheckResult[] | null> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CONNECTIVITY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([runConnectivityTests().catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function collectCrashDumps(): Promise<Array<{ name: string; size: number; modifiedAt: string }>> {
  let dir = "";
  try {
    dir = app.getPath("crashDumps");
  } catch {
    return [];
  }

  const found: Array<{ name: string; size: number; modifiedAt: string }> = [];
  for (const sub of ["", "reports", "completed", "pending"]) {
    for (const dump of await newestMatching(path.join(dir, sub), /\.dmp$/i, MAX_CRASH_DUMPS)) {
      found.push({
        name: sub ? `${sub}/${dump.name}` : dump.name,
        size: dump.size,
        modifiedAt: new Date(dump.mtimeMs).toISOString(),
      });
    }
  }

  return found
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1))
    .slice(0, MAX_CRASH_DUMPS);
}

async function collectAccounts(): Promise<Array<Record<string, unknown>>> {
  const config = await readAccountsConfig().catch(() => null);
  if (!config?.accounts) return [];

  const selected = await getSelectedAccount().catch(() => null);
  const selectedKey = selected ? selected.id || getAccountKey(selected) : null;

  return config.accounts.map((account) => ({
    type: account.type,
    nickname: account.nickname,
    id: account.id,
    selected: selectedKey !== null && (account.id || getAccountKey(account)) === selectedKey,
    hasAccessToken: Boolean(account.accessToken),
    hasRefreshToken: Boolean(account.refreshToken),
    friends: account.friends?.length ?? 0,
  }));
}

export async function buildSupportBundle(
  request: SupportReportRequest,
): Promise<SupportBundle> {
  const span = journal.span("support", "build report", {
    trigger: request.trigger,
    versionName: request.versionName,
    connectivity: request.runConnectivity !== false,
  });

  const paths = getLauncherPaths();
  const dataRoot = getDataRoot();
  const instances = await readInstances(paths.minecraft);
  const target = pickTarget(instances, request.versionName);

  const [settings, accounts, targetInfo, java, connectivity, crashDumps, freeBytes] =
    await Promise.all([
      readJson<Record<string, unknown>>(path.join(paths.launcher, "settings.json")),
      collectAccounts(),
      collectTarget(target),
      collectJava(paths.java),
      request.runConnectivity === false ? Promise.resolve(null) : collectConnectivity(),
      collectCrashDumps(),
      getFreeBytes(dataRoot),
    ]);

  const attachments = target
    ? await collectAttachments(target.versionPath, target.conf.name)
    : [];

  span.step("collected", {
    instances: instances.length,
    target: target?.conf.name,
    attachments: attachments.length,
    connectivity: connectivity?.length ?? null,
  });

  const tail = (await getJournalWriter()?.readTail({
    maxBytes: JOURNAL_MAX_BYTES,
    sinceMs: Date.now() - JOURNAL_WINDOW_MS,
  })) ?? { files: [], lines: [], truncated: false };

  let logsDir = "";
  let userData = "";
  try {
    logsDir = app.getPath("logs");
    userData = app.getPath("userData");
  } catch {}

  const memory = process.memoryUsage();
  const bundle: SupportBundle = {
    format: "grubie-support-report",
    version: 1,
    createdAt: new Date().toISOString(),
    sessionId: journalSessionId,
    trigger: request.trigger,
    comment: request.comment?.trim().slice(0, MAX_COMMENT_CHARS) || undefined,
    app: {
      version: app.getVersion(),
      packaged: app.isPackaged,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      locale: app.getLocale(),
      exe: process.execPath,
      dataRoot,
      userData,
      logsDir,
      verbose: journal.isVerbose(),
      uptimeSec: Math.round(process.uptime()),
      apiBase: getApiBaseUrl(),
      downloadSource: getDownloadSource(),
      mirrorDisabled: isMirrorDisabled(),
      mojangReachable: getMojangReachable(),
      runningGames: [...gameRuntime.processes.values()].map((record) => ({
        versionName: record.versionName,
        instance: record.instance,
        pid: record.process.pid,
      })),
      processMemoryMb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      },
    },
    system: {
      platform: process.platform,
      release: os.release(),
      osVersion: typeof os.version === "function" ? os.version() : undefined,
      arch: process.arch,
      cpu: os.cpus()[0]?.model?.trim(),
      cores: os.cpus().length,
      totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMb: Math.round(os.freemem() / 1024 / 1024),
      uptimeSec: Math.round(os.uptime()),
      dataRootFreeMb: freeBytes === null ? null : Math.round(freeBytes / 1024 / 1024),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    ui: request.ui,
    settings: settings ? (sanitizeJournalValue(settings) as Record<string, unknown>) : null,
    accounts,
    instances: instances.map((item) => summarizeInstance(item.conf)),
    target: targetInfo ? (sanitizeJournalValue(targetInfo) as Record<string, unknown>) : null,
    java,
    connectivity,
    journal: {
      files: tail.files,
      lines: tail.lines.length,
      truncated: tail.truncated,
      text: tail.lines.join("\n"),
    },
    attachments,
    crashDumps,
  };

  span.ok({ journalLines: tail.lines.length });
  return bundle;
}

function sectionBytes(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function describeBundleSections(bundle: SupportBundle): SupportReportSection[] {
  const sections: Array<[SupportReportSectionId, unknown, number | undefined]> = [
    ["system", { app: bundle.app, system: bundle.system, ui: bundle.ui }, undefined],
    ["settings", bundle.settings, undefined],
    ["accounts", bundle.accounts, bundle.accounts?.length],
    ["instances", bundle.instances, bundle.instances?.length],
    ["target", bundle.target, undefined],
    ["java", bundle.java, bundle.java?.length],
    ["connectivity", bundle.connectivity, bundle.connectivity?.length],
    ["journal", bundle.journal.text, bundle.journal.lines],
    ["attachments", bundle.attachments, bundle.attachments.length],
    ["crashDumps", bundle.crashDumps, bundle.crashDumps?.length],
  ];

  return sections
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([id, value, items]) => ({ id, bytes: sectionBytes(value), items }));
}

function prunePrepared(): void {
  const now = Date.now();
  for (const [id, entry] of prepared) {
    if (now - entry.createdAt > PREPARED_TTL_MS) prepared.delete(id);
  }
  while (prepared.size > MAX_PREPARED) {
    const oldest = prepared.keys().next().value;
    if (!oldest) break;
    prepared.delete(oldest);
  }
}

export async function prepareSupportReport(
  request: SupportReportRequest,
): Promise<SupportReportPrepared> {
  const bundle = await buildSupportBundle(request);
  const json = JSON.stringify(bundle);
  const gz = await gzipAsync(Buffer.from(json, "utf8"), { level: 9 });

  const summary: SupportReportPrepared = {
    id: randomUUID(),
    sections: describeBundleSections(bundle),
    totalBytes: Buffer.byteLength(json, "utf8"),
    compressedBytes: gz.byteLength,
    versionName:
      typeof bundle.target?.name === "string" ? bundle.target.name : undefined,
  };

  prunePrepared();
  prepared.set(summary.id, {
    gz,
    createdAt: Date.now(),
    summary,
    trigger: request.trigger,
  });
  prunePrepared();

  return summary;
}

export function takePreparedReport(id: string): PreparedReport | null {
  prunePrepared();
  return prepared.get(id) ?? null;
}

export function forgetPreparedReport(id: string): void {
  prepared.delete(id);
}
