import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import pLimit from "p-limit";
import type { IVersionConf } from "@/types/IVersion";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  modTranslationLocale,
  supportsModTranslation,
  ModTranslationPackInfo,
  ModTranslationStage,
  ModTranslationStatus,
} from "@/types/ModTranslations";
import { mainWindow } from "../../windows/mainWindow";
import { isVersionRunning } from "../../utilities/worldBackups";
import { getLauncherPaths } from "../../utilities/other";
import { writeJsonAtomic } from "../../utilities/atomicJson";
import {
  createZipArchive,
  readJSONFromArchive,
} from "../../utilities/archiver";
import { Downloader } from "../../utilities/downloader";
import { journal } from "../../journal/journal";
import { NamespaceLang, scanJarLang, scanPackKeys } from "./jarScan";
import { langFormatFor } from "./langFiles";
import {
  applyTranslationOptions,
  gameResourceFormat,
  isManagedPackFile,
  legacyPackFormat,
  MANAGED_PACK_PREFIX,
  packMcmeta,
  packSupportsGame,
  readOptionList,
} from "./optionsTxt";
import {
  chunkBySize,
  modNamespaces,
  planUnits,
  PlannedUnit,
  translationPackFiles,
} from "./plan";
import {
  isUnauthorized,
  RemotePack,
  TranslationApi,
  TranslationApiUnavailable,
} from "./translationApi";
import type { LangEntries } from "./unitHash";

const PROTOCOL = 1;
const SCAN_VERSION = 1;
const LOOKUP_BATCH = 100;
const SUBMIT_BATCH_UNITS = 40;
const SUBMIT_BATCH_CHARS = 400_000;
const SCAN_CONCURRENCY = 4;
const POLL_INTERVAL_MS = 90_000;
const WATCHED_POLL_INTERVAL_MS = 10_000;
const WATCH_WINDOW_MS = 30_000;
const MAX_POLLS = 120;
const PROGRESS_EMIT_MS = 250;

const PACK_DESCRIPTIONS: Record<string, string> = {
  ru_ru: "Grubie: ИИ-перевод модов, которых нет в готовых паках",
  uk_ua: "Grubie: ШІ-переклад модів, яких немає в готових паках",
};

export type SyncReason = "toggle" | "launch" | "refresh" | "poll";

export interface TranslationContext {
  launcherLang: string;
  token?: string;
}

interface InstalledPack extends ModTranslationPackInfo {
  fileName: string;
  sha1: string;
  source: string;
  projectId: string;
}

interface StoredUnit {
  hash: string;
  namespace: string;
  keys: number;
}

interface TranslationState {
  version: number;
  enabled: boolean;
  locale: string | null;
  fingerprint: string | null;
  packs: InstalledPack[];
  units: StoredUnit[];
  failed: string[];
  aiFile: string | null;
  aiDigest: string | null;
  mods: number;
  needsAccount: boolean;
  error: string | null;
  updatedAt: number | null;
}

interface ScanCache {
  version: number;
  locale: string;
  jars: Record<
    string,
    { size: number; mtimeMs: number; namespaces: NamespaceLang[] }
  >;
}

interface JarFile {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
}

interface Runtime {
  stage: ModTranslationStage | null;
  progress: { done: number; total: number } | null;
  running: Promise<void> | null;
  again: SyncReason | null;
  context: TranslationContext | null;
  pollTimer: NodeJS.Timeout | null;
  polls: number;
  lastEmit: number;
  watchedUntil: number;
}

const runtimes = new Map<string, Runtime>();
const packKeyCache = new Map<string, Set<string>>();

function emptyState(): TranslationState {
  return {
    version: 1,
    enabled: false,
    locale: null,
    fingerprint: null,
    packs: [],
    units: [],
    failed: [],
    aiFile: null,
    aiDigest: null,
    mods: 0,
    needsAccount: false,
    error: null,
    updatedAt: null,
  };
}

function runtimeOf(versionPath: string): Runtime {
  const key = path.resolve(versionPath);
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = {
      stage: null,
      progress: null,
      running: null,
      again: null,
      context: null,
      pollTimer: null,
      polls: 0,
      lastEmit: 0,
      watchedUntil: 0,
    };
    runtimes.set(key, runtime);
  }
  return runtime;
}

function storageDir(versionPath: string): string {
  return path.join(versionPath, "storage", "mod-translations");
}

function packsDir(versionPath: string): string {
  return path.join(versionPath, "resourcepacks");
}

function unitCacheDir(locale: string): string {
  return path.join(getLauncherPaths().cache, "mod-translations", locale);
}

function unitCachePath(locale: string, hash: string): string {
  return path.join(unitCacheDir(locale), `${hash}.json`);
}

async function readState(versionPath: string): Promise<TranslationState> {
  const stored = await fs
    .readJSON(path.join(storageDir(versionPath), "state.json"))
    .catch(() => null);
  return stored && typeof stored === "object"
    ? { ...emptyState(), ...stored }
    : emptyState();
}

async function writeState(
  versionPath: string,
  state: TranslationState,
): Promise<void> {
  await fs.ensureDir(storageDir(versionPath));
  await writeJsonAtomic(path.join(storageDir(versionPath), "state.json"), {
    ...state,
    updatedAt: Date.now(),
  });
}

async function readConf(versionPath: string): Promise<IVersionConf | null> {
  return (await fs
    .readJSON(path.join(versionPath, "version.json"))
    .catch(() => null)) as IVersionConf | null;
}

function statusFrom(
  versionPath: string,
  state: TranslationState,
  runtime: Runtime,
  launcherLang: string | undefined,
): ModTranslationStatus {
  const locale = modTranslationLocale(launcherLang ?? runtime.context?.launcherLang);
  const stage: ModTranslationStage = !state.enabled
    ? "off"
    : !locale
      ? "unsupported"
      : (runtime.stage ??
        (state.error
          ? "error"
          : state.units.length > state.failed.length + cachedCount(state)
            ? "waiting"
            : "ready"));
  return {
    versionPath,
    enabled: state.enabled,
    locale,
    stage,
    progress: runtime.progress,
    mods: state.mods,
    packs: state.packs.map(({ key, title, author, license, url }) => ({
      key,
      title,
      author,
      license,
      url,
    })),
    translated: cachedCount(state),
    pending: Math.max(
      0,
      state.units.length - cachedCount(state) - state.failed.length,
    ),
    failed: state.failed.length,
    needsAccount: state.needsAccount,
    error: state.error,
    updatedAt: state.updatedAt,
  };
}

const cachedUnits = new Map<string, Set<string>>();

function cachedCount(state: TranslationState): number {
  const known = state.locale ? cachedUnits.get(state.locale) : undefined;
  if (!known) return 0;
  return state.units.filter((unit) => known.has(unit.hash)).length;
}

async function loadCachedHashes(locale: string): Promise<Set<string>> {
  let known = cachedUnits.get(locale);
  if (known) return known;
  const names = await fs.readdir(unitCacheDir(locale)).catch(() => []);
  known = new Set(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5)),
  );
  cachedUnits.set(locale, known);
  return known;
}

async function readCachedUnit(
  locale: string,
  hash: string,
): Promise<LangEntries | null> {
  return (await fs
    .readJSON(unitCachePath(locale, hash))
    .catch(() => null)) as LangEntries | null;
}

async function writeCachedUnit(
  locale: string,
  hash: string,
  entries: LangEntries,
): Promise<void> {
  await fs.ensureDir(unitCacheDir(locale));
  await writeJsonAtomic(unitCachePath(locale, hash), entries);
  (await loadCachedHashes(locale)).add(hash);
}

async function emit(versionPath: string, force = false): Promise<void> {
  const runtime = runtimeOf(versionPath);
  const now = Date.now();
  if (!force && now - runtime.lastEmit < PROGRESS_EMIT_MS) return;
  runtime.lastEmit = now;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.webContents.isDestroyed()) return;
  const state = await readState(versionPath);
  if (state.locale) await loadCachedHashes(state.locale);
  try {
    mainWindow.webContents.send(
      "modTranslations:status",
      statusFrom(versionPath, state, runtime, undefined),
    );
  } catch {
    return;
  }
}

function setStage(
  versionPath: string,
  stage: ModTranslationStage | null,
  progress: { done: number; total: number } | null = null,
): void {
  const runtime = runtimeOf(versionPath);
  runtime.stage = stage;
  runtime.progress = progress;
  void emit(versionPath, progress === null);
}

async function listJars(versionPath: string): Promise<JarFile[]> {
  const folder = path.join(versionPath, "mods");
  const names = await fs.readdir(folder).catch(() => [] as string[]);
  const jars: JarFile[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".jar")) continue;
    const filePath = path.join(folder, name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) continue;
    jars.push({ name, path: filePath, size: stat.size, mtimeMs: stat.mtimeMs });
  }
  return jars.sort((a, b) => a.name.localeCompare(b.name));
}

function userPackProjects(conf: IVersionConf): string[] {
  return (conf.loader?.mods ?? [])
    .filter(
      (mod) =>
        mod.projectType === ProjectType.RESOURCEPACK &&
        (mod.provider === Provider.MODRINTH ||
          mod.provider === Provider.CURSEFORGE),
    )
    .map((mod) => `${mod.provider}:${mod.id}`)
    .sort();
}

function digest(value: unknown): string {
  return createHash("sha1").update(JSON.stringify(value)).digest("hex");
}

async function scanJars(
  versionPath: string,
  jars: JarFile[],
  locale: string,
): Promise<NamespaceLang[][]> {
  const cachePath = path.join(storageDir(versionPath), "scan.json");
  const stored = (await fs.readJSON(cachePath).catch(() => null)) as
    | ScanCache
    | null;
  const previous =
    stored?.version === SCAN_VERSION && stored.locale === locale
      ? stored.jars
      : {};
  const next: ScanCache = { version: SCAN_VERSION, locale, jars: {} };
  const limit = pLimit(SCAN_CONCURRENCY);
  let done = 0;
  let failed = 0;

  const results = await Promise.all(
    jars.map((jar) =>
      limit(async () => {
        const cached = previous[jar.name];
        let namespaces: NamespaceLang[];
        if (
          cached &&
          cached.size === jar.size &&
          cached.mtimeMs === jar.mtimeMs
        ) {
          namespaces = cached.namespaces;
        } else {
          try {
            namespaces = await scanJarLang(jar.path, locale);
          } catch {
            failed++;
            namespaces = [];
          }
        }
        next.jars[jar.name] = {
          size: jar.size,
          mtimeMs: jar.mtimeMs,
          namespaces,
        };
        done++;
        setStage(versionPath, "scanning", { done, total: jars.length });
        return namespaces;
      }),
    ),
  );

  await fs.ensureDir(storageDir(versionPath));
  await writeJsonAtomic(cachePath, next);
  if (failed > 0) {
    journal.warn("translations", "some mods could not be read", {
      failed,
      total: jars.length,
    });
  }
  return results;
}

async function installPacks(
  versionPath: string,
  remote: RemotePack[],
  previous: InstalledPack[],
): Promise<InstalledPack[]> {
  const folder = packsDir(versionPath);
  await fs.ensureDir(folder);
  const installed: InstalledPack[] = [];
  const downloads: Array<{ pack: RemotePack; fileName: string }> = [];

  for (const pack of remote) {
    const fileName = `${MANAGED_PACK_PREFIX}${pack.key}.zip`;
    const known = previous.find((entry) => entry.key === pack.key);
    const present = await fs.pathExists(path.join(folder, fileName));
    if (!present || known?.sha1 !== pack.sha1) {
      downloads.push({ pack, fileName });
    }
  }

  if (downloads.length > 0) {
    setStage(versionPath, "packs");
    const downloader = new Downloader(2);
    for (const { pack, fileName } of downloads) {
      try {
        await downloader.downloadFiles([
          {
            url: pack.url,
            destination: path.join(folder, fileName),
            group: "packs",
            sha1: pack.sha1,
            size: pack.size,
            options: { silent: true },
          },
        ]);
      } catch (error) {
        journal.warn("translations", "translation pack download failed", {
          pack: pack.key,
          error: String(error),
        });
      }
    }
  }

  for (const pack of remote) {
    const fileName = `${MANAGED_PACK_PREFIX}${pack.key}.zip`;
    if (!(await fs.pathExists(path.join(folder, fileName)))) continue;
    installed.push({
      key: pack.key,
      title: pack.title,
      author: pack.author,
      license: pack.license,
      url: pack.projectUrl,
      fileName,
      sha1: pack.sha1,
      source: pack.source,
      projectId: pack.projectId,
    });
  }
  return installed;
}

async function removeStaleManaged(
  versionPath: string,
  keep: ReadonlySet<string>,
): Promise<void> {
  const folder = packsDir(versionPath);
  const names = await fs.readdir(folder).catch(() => [] as string[]);
  for (const name of names) {
    if (!isManagedPackFile(name) || keep.has(name)) continue;
    await fs.remove(path.join(folder, name)).catch(() => undefined);
  }
}

async function packKeys(
  filePath: string,
  locale: string,
  identity: string,
): Promise<Set<string>> {
  const cacheKey = `${identity}:${locale}`;
  const cached = packKeyCache.get(cacheKey);
  if (cached) return cached;
  const keys = await scanPackKeys(filePath, locale).catch(() => new Set<string>());
  if (packKeyCache.size >= 8) {
    const oldest = packKeyCache.keys().next().value;
    if (oldest) packKeyCache.delete(oldest);
  }
  packKeyCache.set(cacheKey, keys);
  return keys;
}

interface PackSource {
  file: string;
  identity: string;
}

async function playerPacks(versionPath: string): Promise<PackSource[]> {
  const folder = packsDir(versionPath);
  const options = await fs
    .readFile(path.join(versionPath, "options.txt"), "utf8")
    .catch(() => "");
  const sources: PackSource[] = [];
  for (const entry of readOptionList(options, "resourcePacks") ?? []) {
    const fileName = entry.startsWith("file/") ? entry.slice(5) : entry;
    if (!fileName.toLowerCase().endsWith(".zip")) continue;
    if (isManagedPackFile(fileName)) continue;
    if (fileName.includes("/") || fileName.includes("\\")) continue;
    const file = path.join(folder, fileName);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) continue;
    sources.push({ file, identity: `${fileName}:${stat.size}:${stat.mtimeMs}` });
  }
  return sources;
}

async function coveredKeys(
  locale: string,
  folder: string,
  packs: InstalledPack[],
  player: PackSource[],
): Promise<Set<string>> {
  const covered = new Set<string>();
  const sources: PackSource[] = [
    ...packs.map((pack) => ({
      file: path.join(folder, pack.fileName),
      identity: pack.sha1,
    })),
    ...player,
  ];
  for (const source of sources) {
    for (const key of await packKeys(source.file, locale, source.identity)) {
      covered.add(key);
    }
  }
  return covered;
}

async function resolveUnits(
  api: TranslationApi,
  locale: string,
  hashes: string[],
): Promise<{ missing: string[]; failed: string[] }> {
  const known = await loadCachedHashes(locale);
  const unknown = hashes.filter((hash) => !known.has(hash));
  const missing: string[] = [];
  const failed: string[] = [];

  for (let i = 0; i < unknown.length; i += LOOKUP_BATCH) {
    const units = await api.lookup(locale, unknown.slice(i, i + LOOKUP_BATCH));
    for (const unit of units) {
      if (unit.status === "done" && unit.entries) {
        await writeCachedUnit(locale, unit.hash, unit.entries);
      } else if (unit.status === "missing") {
        missing.push(unit.hash);
      } else if (unit.status === "failed") {
        failed.push(unit.hash);
      }
    }
  }
  return { missing, failed };
}

async function submitUnits(
  api: TranslationApi,
  locale: string,
  units: PlannedUnit[],
): Promise<{ needsAccount: boolean; quota: boolean }> {
  if (units.length === 0) return { needsAccount: false, quota: false };
  if (!api.hasToken()) return { needsAccount: true, quota: false };

  const size = (unit: PlannedUnit) =>
    Object.values(unit.entries).reduce((sum, value) => sum + value.length, 0);
  let quota = false;
  for (const batch of chunkBySize(
    units,
    SUBMIT_BATCH_UNITS,
    SUBMIT_BATCH_CHARS,
    size,
  )) {
    try {
      const result = await api.submit(
        locale,
        batch.map(({ hash, namespace, entries }) => ({
          hash,
          namespace,
          entries,
        })),
      );
      if (result.rejected?.some((entry) => entry.reason === "quota")) {
        quota = true;
        break;
      }
    } catch (error) {
      if (isUnauthorized(error)) return { needsAccount: true, quota };
      throw error;
    }
  }
  return { needsAccount: false, quota };
}

async function buildAiPack(
  versionPath: string,
  state: TranslationState,
  locale: string,
  mcVersion: string,
): Promise<{ file: string | null; digest: string | null }> {
  const known = await loadCachedHashes(locale);
  const units: Array<{ namespace: string; entries: LangEntries }> = [];
  for (const unit of state.units) {
    if (!known.has(unit.hash)) continue;
    const entries = await readCachedUnit(locale, unit.hash);
    if (entries && Object.keys(entries).length > 0) {
      units.push({ namespace: unit.namespace, entries });
    }
  }

  const fileName = `${MANAGED_PACK_PREFIX}ai-${locale}.zip`;
  const target = path.join(packsDir(versionPath), fileName);
  if (units.length === 0) {
    await fs.remove(target).catch(() => undefined);
    return { file: null, digest: null };
  }

  const files = translationPackFiles(
    units,
    locale,
    mcVersion,
    langFormatFor(mcVersion),
  );
  const description = PACK_DESCRIPTIONS[locale] ?? "Grubie: AI translation of mods";
  files.unshift({
    name: "pack.mcmeta",
    data: Buffer.from(packMcmeta(mcVersion, description), "utf8"),
  });
  const contentDigest = createHash("sha1");
  for (const file of files) contentDigest.update(file.name).update(file.data);
  const value = contentDigest.digest("hex");

  if (value === state.aiDigest && (await fs.pathExists(target))) {
    return { file: fileName, digest: value };
  }

  setStage(versionPath, "building");
  const temp = path.join(storageDir(versionPath), `${fileName}.tmp`);
  await fs.ensureDir(storageDir(versionPath));
  await createZipArchive([], temp, undefined, 9, undefined, files);
  await fs.ensureDir(packsDir(versionPath));
  await fs.move(temp, target, { overwrite: true });
  return { file: fileName, digest: value };
}

async function readGameResourceFormat(
  versionPath: string,
  mcVersion: string,
): Promise<number | null> {
  if (legacyPackFormat(mcVersion) !== null) {
    return gameResourceFormat(null, mcVersion);
  }
  const versionJson = await readJSONFromArchive<unknown>(
    path.join(versionPath, `${mcVersion}.jar`),
    "version.json",
  ).catch(() => null);
  return gameResourceFormat(versionJson, mcVersion);
}

async function incompatiblePackFiles(
  versionPath: string,
  mcVersion: string,
  packFiles: string[],
): Promise<string[]> {
  if (packFiles.length === 0) return [];
  const gameFormat = await readGameResourceFormat(versionPath, mcVersion);
  if (gameFormat === null) return [];
  const incompatible: string[] = [];
  for (const file of packFiles) {
    const mcmeta = await readJSONFromArchive<unknown>(
      path.join(packsDir(versionPath), file),
      "pack.mcmeta",
    ).catch(() => null);
    if (!packSupportsGame(mcmeta, gameFormat, mcVersion)) {
      incompatible.push(file);
    }
  }
  return incompatible;
}

async function applyOptions(
  versionPath: string,
  mcVersion: string,
  packFiles: string[],
  locale: string | null,
): Promise<void> {
  const file = path.join(versionPath, "options.txt");
  const current = await fs.readFile(file, "utf8").catch(() => null);
  const result = applyTranslationOptions(current, {
    mcVersion,
    packFiles,
    incompatibleFiles: await incompatiblePackFiles(
      versionPath,
      mcVersion,
      packFiles,
    ),
    locale,
  });
  if (!result.changed) return;
  const temp = `${file}.grubie-tmp`;
  await fs.writeFile(temp, result.text, "utf8");
  await fs.move(temp, file, { overwrite: true });
}

async function cleanup(
  versionPath: string,
  state: TranslationState,
  mcVersion: string | undefined,
): Promise<void> {
  const hadAnything =
    state.packs.length > 0 || state.aiFile || state.units.length > 0;
  if (!hadAnything) return;
  if (isVersionRunning(versionPath)) return;
  await removeStaleManaged(versionPath, new Set());
  if (mcVersion) await applyOptions(versionPath, mcVersion, [], null);
  await writeState(versionPath, {
    ...emptyState(),
    enabled: state.enabled,
  });
}

function ourPackFiles(state: TranslationState): string[] {
  return [
    ...(state.aiFile ? [state.aiFile] : []),
    ...state.packs.map((pack) => pack.fileName),
  ];
}

async function syncOnce(versionPath: string, reason: SyncReason): Promise<void> {
  const runtime = runtimeOf(versionPath);
  const state = await readState(versionPath);
  const conf = await readConf(versionPath);
  const locale = modTranslationLocale(runtime.context?.launcherLang);
  const mcVersion = conf?.version?.id;

  if (!state.enabled || !conf || !mcVersion) {
    await cleanup(versionPath, state, mcVersion);
    return;
  }
  if (!locale || !supportsModTranslation(mcVersion)) {
    await cleanup(versionPath, state, mcVersion);
    return;
  }
  if (isVersionRunning(versionPath)) {
    setStage(versionPath, "deferred");
    return;
  }

  const api = new TranslationApi(runtime.context?.token);
  const jars = await listJars(versionPath);
  const skipProjects = userPackProjects(conf);
  const player = await playerPacks(versionPath);
  const fingerprint = digest([
    PROTOCOL,
    locale,
    mcVersion,
    jars.map((jar) => [jar.name, jar.size, jar.mtimeMs]),
    skipProjects,
    player.map((pack) => pack.identity),
  ]);
  await loadCachedHashes(locale);

  let next: TranslationState = { ...state, locale, error: null };
  let fullPass =
    state.fingerprint !== fingerprint ||
    state.locale !== locale ||
    reason === "toggle";

  if (!fullPass) {
    for (const pack of state.packs) {
      if (!(await fs.pathExists(path.join(packsDir(versionPath), pack.fileName)))) {
        fullPass = true;
      }
    }
  }

  try {
    if (!fullPass) {
      setStage(versionPath, "translating");
      const { missing, failed } = await resolveUnits(
        api,
        locale,
        state.units.map((unit) => unit.hash),
      );
      next.failed = failed;
      if (missing.length > 0 && api.hasToken()) fullPass = true;
      else next.needsAccount = missing.length > 0;
    }

    if (fullPass) {
      setStage(versionPath, "scanning", { done: 0, total: jars.length });
      const scanned = await scanJars(versionPath, jars, locale);
      const namespaces = modNamespaces(scanned);

      setStage(versionPath, "packs");
      let packs = state.packs;
      try {
        const remote = await api.matchPacks({
          lang: locale,
          mcVersion,
          namespaces,
          skipProjects,
        });
        packs = await installPacks(versionPath, remote, state.packs);
        next.packs = packs;
      } catch (error) {
        if (error instanceof TranslationApiUnavailable) throw error;
        journal.warn("translations", "pack matching failed, keeping the installed packs", {
          error: String(error),
        });
        next.error = "network";
      }

      const keep = new Set([
        ...packs.map((pack) => pack.fileName),
        `${MANAGED_PACK_PREFIX}ai-${locale}.zip`,
      ]);
      await removeStaleManaged(versionPath, keep);

      setStage(versionPath, "translating");
      const covered = await coveredKeys(
        locale,
        packsDir(versionPath),
        packs,
        player,
      );
      const units = planUnits(scanned, covered);
      const { missing, failed } = await resolveUnits(
        api,
        locale,
        units.map((unit) => unit.hash),
      );
      const missingSet = new Set(missing);
      const submitted = await submitUnits(
        api,
        locale,
        units.filter((unit) => missingSet.has(unit.hash)),
      );

      next = {
        ...next,
        fingerprint,
        packs,
        units: units.map((unit) => ({
          hash: unit.hash,
          namespace: unit.namespace,
          keys: Object.keys(unit.entries).length,
        })),
        failed,
        mods: jars.length,
        needsAccount: submitted.needsAccount,
        error: next.error ?? (submitted.quota ? "quota" : null),
      };
    }
  } catch (error) {
    next.error =
      error instanceof TranslationApiUnavailable ? "unavailable" : "network";
    journal.warn("translations", "translation sync failed", {
      reason,
      error: String(error),
    });
  }

  if (isVersionRunning(versionPath)) {
    await writeState(versionPath, { ...next, fingerprint: null });
    setStage(versionPath, "deferred");
    return;
  }

  const ai = await buildAiPack(versionPath, next, locale, mcVersion);
  next.aiFile = ai.file;
  next.aiDigest = ai.digest;
  await applyOptions(versionPath, mcVersion, ourPackFiles(next), locale);
  await writeState(versionPath, next);
  schedulePoll(versionPath, next);
}

function hasPending(state: TranslationState): boolean {
  const known = state.locale ? cachedUnits.get(state.locale) : undefined;
  const failed = new Set(state.failed);
  return state.units.some(
    (unit) => !known?.has(unit.hash) && !failed.has(unit.hash),
  );
}

function schedulePoll(versionPath: string, state: TranslationState): void {
  const runtime = runtimeOf(versionPath);
  if (runtime.pollTimer) clearTimeout(runtime.pollTimer);
  runtime.pollTimer = null;
  if (!state.enabled || state.needsAccount || !hasPending(state)) {
    runtime.polls = 0;
    return;
  }
  if (runtime.polls >= MAX_POLLS) return;
  runtime.polls++;
  const interval =
    Date.now() < runtime.watchedUntil
      ? WATCHED_POLL_INTERVAL_MS
      : POLL_INTERVAL_MS;
  runtime.pollTimer = setTimeout(() => {
    runtime.pollTimer = null;
    void runSync(versionPath, "poll");
  }, interval);
  runtime.pollTimer.unref?.();
}

export function runSync(versionPath: string, reason: SyncReason): Promise<void> {
  const runtime = runtimeOf(versionPath);
  if (runtime.running) {
    runtime.again = reason === "toggle" ? "toggle" : (runtime.again ?? reason);
    return runtime.running;
  }

  runtime.running = (async () => {
    try {
      await syncOnce(versionPath, reason);
    } catch (error) {
      journal.error("translations", "translation sync crashed", {
        reason,
        error: String(error),
      });
    } finally {
      runtime.stage = runtime.stage === "deferred" ? "deferred" : null;
      runtime.progress = null;
      runtime.running = null;
      await emit(versionPath, true);
      const again = runtime.again;
      runtime.again = null;
      if (again) void runSync(versionPath, again);
    }
  })();
  return runtime.running;
}

function remember(versionPath: string, context: TranslationContext): void {
  const runtime = runtimeOf(versionPath);
  runtime.context = {
    launcherLang: context.launcherLang,
    token: context.token || runtime.context?.token,
  };
}

function watch(versionPath: string, state: TranslationState): void {
  const runtime = runtimeOf(versionPath);
  const wasWatched = Date.now() < runtime.watchedUntil;
  runtime.watchedUntil = Date.now() + WATCH_WINDOW_MS;
  if (wasWatched || runtime.running || !runtime.pollTimer) return;
  runtime.polls = Math.max(0, runtime.polls - 1);
  schedulePoll(versionPath, state);
}

export async function getModTranslationStatus(
  versionPath: string,
  context: TranslationContext,
): Promise<ModTranslationStatus> {
  remember(versionPath, context);
  const state = await readState(versionPath);
  if (state.locale) await loadCachedHashes(state.locale);
  watch(versionPath, state);
  return statusFrom(
    versionPath,
    state,
    runtimeOf(versionPath),
    context.launcherLang,
  );
}

export async function setModTranslationEnabled(
  versionPath: string,
  enabled: boolean,
  context: TranslationContext,
): Promise<ModTranslationStatus> {
  remember(versionPath, context);
  const state = await readState(versionPath);
  await writeState(versionPath, { ...state, enabled });
  runtimeOf(versionPath).polls = 0;
  void runSync(versionPath, enabled ? "toggle" : "refresh");
  return getModTranslationStatus(versionPath, context);
}

export async function refreshModTranslations(
  versionPath: string,
  context: TranslationContext,
): Promise<ModTranslationStatus> {
  remember(versionPath, context);
  const state = await readState(versionPath);
  if (state.enabled && !runtimeOf(versionPath).running) {
    void runSync(versionPath, "refresh");
  }
  return getModTranslationStatus(versionPath, context);
}

export async function prepareModTranslationsForLaunch(
  versionPath: string,
  context: TranslationContext,
  budgetMs = 15_000,
): Promise<void> {
  const state = await readState(versionPath);
  const hasLeftovers =
    state.packs.length > 0 || !!state.aiFile || state.units.length > 0;
  if (!state.enabled && !hasLeftovers) return;

  remember(versionPath, context);
  let timer: NodeJS.Timeout | null = null;
  await Promise.race([
    runSync(versionPath, "launch"),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}
