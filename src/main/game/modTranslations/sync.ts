import path from "path";
import fs from "fs-extra";
import { createHash } from "crypto";
import pLimit from "p-limit";
import type { IVersionConf } from "@/types/IVersion";
import { ProjectType, Provider } from "@/types/ModManager";
import {
  modTranslationLocale,
  supportsModTranslation,
  ModTranslationFormat,
  ModTranslationGroup,
  ModTranslationItem,
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
import {
  BookGroup,
  bookPackFiles,
  collectBookGroups,
  installedBookFormats,
  planBookUnits,
} from "./books";
import {
  FTB_QUESTS_BOOK,
  FTB_QUESTS_LANG_DIR,
  planQuestUnits,
  renderQuestLang,
} from "./ftbQuests";
import {
  PackCoverage,
  scanExternalPatchouli,
  scanPackCoverage,
  scanSource,
  SourceScan,
} from "./jarScan";
import { langFormatFor } from "./langFiles";
import type { ModContext } from "./modContext";
import {
  ContentSource,
  listModpackPacks,
  PLAYER_PACK_FOLDER,
} from "./packSources";
import {
  applyQuestzRewrite,
  QUESTZ_KEY_PREFIX,
  questzNamespace,
  readQuestzChapters,
  restoreQuestz,
  RewrittenChapter,
} from "./questz";
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
  preferPackEnglish,
  translationPackFiles,
} from "./plan";
import {
  isUnauthorized,
  RemotePack,
  SubmitUnit,
  TranslationApi,
  TranslationApiUnavailable,
  UNSUPPORTED_REASON,
} from "./translationApi";
import type { LangEntries } from "./unitHash";

const PROTOCOL = 2;
const SCAN_VERSION = 2;
const BOOKS_VERSION = 1;
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
  kind?: "book";
  book?: string;
  group?: Exclude<ModTranslationGroup, "mods">;
  title?: string;
  done?: number;
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
  questFile: string | null;
  questDigest: string | null;
  questzFiles: RewrittenChapter[];
  externalFiles: Array<{ file: string; digest: string }>;
  forcedLocale: string | null;
  quotaUntil: number | null;
  mods: number;
  needsAccount: boolean;
  error: string | null;
  updatedAt: number | null;
}

interface ScanCache {
  version: number;
  locale: string;
  sources: Record<string, { identity: string; scan: SourceScan }>;
}

interface BooksFile {
  version: number;
  locale: string;
  groups: BookGroup[];
  quests?: string | null;
}

interface JarFile {
  name: string;
  path: string;
  size: number;
  mtimeMs: number;
}

type PendingUnit = SubmitUnit & {
  keys: number;
  book?: string;
  group?: Exclude<ModTranslationGroup, "mods">;
};

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
const packCoverageCache = new Map<string, PackCoverage>();

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
    questFile: null,
    questDigest: null,
    questzFiles: [],
    externalFiles: [],
    forcedLocale: null,
    quotaUntil: null,
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

function booksPath(versionPath: string): string {
  return path.join(storageDir(versionPath), "books.json");
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
    items: statusItems(state),
    retryAt:
      state.error === "quota" && state.quotaUntil && state.quotaUntil > Date.now()
        ? state.quotaUntil
        : null,
    needsAccount: state.needsAccount,
    error: state.error,
    updatedAt: state.updatedAt,
  };
}

function unitFormat(unit: StoredUnit): ModTranslationFormat | null {
  if (unit.book === FTB_QUESTS_BOOK) return "ftbquests";
  if (unit.book?.startsWith("lavender:")) return "lavender";
  if (unit.book?.startsWith("patchouli:")) return "patchouli";
  return unit.group === "quests" ? "questz" : null;
}

function statusItems(state: TranslationState): ModTranslationItem[] {
  const known = state.locale ? cachedUnits.get(state.locale) : undefined;
  const failed = new Set(state.failed);
  const items = new Map<string, ModTranslationItem>();
  const seen = new Set<string>();
  for (const unit of state.units) {
    if (seen.has(unit.hash)) continue;
    seen.add(unit.hash);
    const group: ModTranslationGroup = unit.group ?? "mods";
    const format = unitFormat(unit);
    const title = unit.title ?? unit.namespace;
    const id = `${group}\u0000${format}\u0000${title}`;
    const item = items.get(id) ?? {
      group,
      title,
      format,
      strings: 0,
      translated: 0,
      pending: 0,
      failed: 0,
    };
    item.strings += unit.keys;
    if (known?.has(unit.hash)) {
      const done = Math.min(unit.done ?? unit.keys, unit.keys);
      item.translated += done;
      item.failed += unit.keys - done;
    } else if (failed.has(unit.hash)) item.failed += unit.keys;
    else item.pending += unit.keys;
    items.set(id, item);
  }
  return [...items.values()].sort((a, b) => a.title.localeCompare(b.title));
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

function jarSources(jars: JarFile[]): ContentSource[] {
  return jars.map((jar) => ({
    id: jar.name,
    path: jar.path,
    identity: `${jar.size}:${jar.mtimeMs}`,
    label: jar.name,
  }));
}

function emptyScan(): SourceScan {
  return {
    context: null,
    namespaces: [],
    books: [],
    translatedDocs: [],
    patchouliI18n: [],
  };
}

function withFallbackContext(scan: SourceScan, label: string): SourceScan {
  if (scan.context) return scan;
  const context: ModContext = { name: label };
  return {
    ...scan,
    context,
    namespaces: scan.namespaces.map((lang) =>
      lang.context ? lang : { ...lang, context },
    ),
  };
}

async function scanSources(
  versionPath: string,
  sources: ContentSource[],
  packIds: ReadonlySet<string>,
  locale: string,
): Promise<SourceScan[]> {
  const cachePath = path.join(storageDir(versionPath), "scan.json");
  const stored = (await fs.readJSON(cachePath).catch(() => null)) as
    | ScanCache
    | null;
  const previous =
    stored?.version === SCAN_VERSION && stored.locale === locale
      ? stored.sources
      : {};
  const next: ScanCache = { version: SCAN_VERSION, locale, sources: {} };
  const limit = pLimit(SCAN_CONCURRENCY);
  let done = 0;
  let failed = 0;

  const results = await Promise.all(
    sources.map((source) =>
      limit(async () => {
        const cached = previous[source.id];
        let scan: SourceScan;
        if (cached && cached.identity === source.identity) {
          scan = cached.scan;
        } else {
          try {
            scan = await scanSource(source.path, locale, source.assetsRoot);
            if (packIds.has(source.id)) {
              scan = withFallbackContext(scan, source.label);
            }
          } catch {
            failed++;
            scan = emptyScan();
          }
        }
        next.sources[source.id] = { identity: source.identity, scan };
        done++;
        setStage(versionPath, "scanning", { done, total: sources.length });
        return scan;
      }),
    ),
  );

  await fs.ensureDir(storageDir(versionPath));
  await writeJsonAtomic(cachePath, next);
  if (failed > 0) {
    journal.warn("translations", "some mods could not be read", {
      failed,
      total: sources.length,
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

async function packCoverage(
  filePath: string,
  locale: string,
  identity: string,
): Promise<PackCoverage> {
  const cacheKey = `${identity}:${locale}`;
  const cached = packCoverageCache.get(cacheKey);
  if (cached) return cached;
  const coverage = await scanPackCoverage(filePath, locale).catch(() => ({
    keys: new Set<string>(),
    docs: new Set<string>(),
  }));
  if (packCoverageCache.size >= 8) {
    const oldest = packCoverageCache.keys().next().value;
    if (oldest) packCoverageCache.delete(oldest);
  }
  packCoverageCache.set(cacheKey, coverage);
  return coverage;
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

async function covered(
  locale: string,
  folder: string,
  packs: InstalledPack[],
  player: PackSource[],
): Promise<PackCoverage> {
  const result: PackCoverage = { keys: new Set(), docs: new Set() };
  const sources: PackSource[] = [
    ...packs.map((pack) => ({
      file: path.join(folder, pack.fileName),
      identity: pack.sha1,
    })),
    ...player,
  ];
  for (const source of sources) {
    const coverage = await packCoverage(source.file, locale, source.identity);
    for (const key of coverage.keys) result.keys.add(key);
    for (const id of coverage.docs) result.docs.add(id);
  }
  return result;
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

interface SubmitOutcome {
  needsAccount: boolean;
  quota: boolean;
  unsupported: string[];
}

export function nextQuotaReset(now = Date.now()): number {
  const reset = new Date(now);
  reset.setUTCHours(24, 5, 0, 0);
  return reset.getTime();
}

async function submitUnits(
  api: TranslationApi,
  locale: string,
  units: PendingUnit[],
  quotaUntil: number | null,
): Promise<SubmitOutcome> {
  const unsupported: string[] = [];
  if (units.length === 0) return { needsAccount: false, quota: false, unsupported };
  if (!api.hasToken()) return { needsAccount: true, quota: false, unsupported };
  if (quotaUntil && Date.now() < quotaUntil) {
    return { needsAccount: false, quota: true, unsupported };
  }

  const size = (unit: PendingUnit) =>
    Object.values(unit.entries).reduce((sum, value) => sum + value.length, 0);
  let quota = false;
  const priority = (unit: PendingUnit) =>
    unit.group === "quests" ? 0 : unit.kind === "book" ? 1 : 2;
  const ordered = [...units].sort((a, b) => priority(a) - priority(b));
  for (const batch of chunkBySize(
    ordered,
    SUBMIT_BATCH_UNITS,
    SUBMIT_BATCH_CHARS,
    size,
  )) {
    try {
      const result = await api.submit(
        locale,
        batch.map(({ hash, namespace, entries, kind, context }) => ({
          hash,
          namespace,
          entries,
          ...(kind ? { kind } : {}),
          ...(context ? { context } : {}),
        })),
      );
      for (const entry of result.rejected ?? []) {
        if (entry.reason === UNSUPPORTED_REASON) unsupported.push(entry.hash);
      }
      if (result.rejected?.some((entry) => entry.reason === "quota")) {
        quota = true;
        break;
      }
    } catch (error) {
      if (isUnauthorized(error)) return { needsAccount: true, quota, unsupported };
      throw error;
    }
  }
  return { needsAccount: false, quota, unsupported };
}

async function readBooks(
  versionPath: string,
  locale: string,
): Promise<{ groups: BookGroup[]; quests: string | null }> {
  const stored = (await fs.readJSON(booksPath(versionPath)).catch(() => null)) as
    | BooksFile
    | null;
  if (stored?.version !== BOOKS_VERSION || stored.locale !== locale) {
    return { groups: [], quests: null };
  }
  return {
    groups: Array.isArray(stored.groups) ? stored.groups : [],
    quests: typeof stored.quests === "string" ? stored.quests : null,
  };
}

async function writeBooks(
  versionPath: string,
  locale: string,
  groups: BookGroup[],
  quests: string | null,
): Promise<void> {
  await fs.ensureDir(storageDir(versionPath));
  await writeJsonAtomic(booksPath(versionPath), {
    version: BOOKS_VERSION,
    locale,
    groups,
    quests,
  } satisfies BooksFile);
}

function questLangPath(versionPath: string, locale: string): string {
  return path.join(versionPath, ...FTB_QUESTS_LANG_DIR, `${locale}.snbt`);
}

async function fileDigest(file: string): Promise<string | null> {
  const data = await fs.readFile(file).catch(() => null);
  return data ? createHash("sha1").update(data).digest("hex") : null;
}

async function ownsQuestFile(
  versionPath: string,
  state: TranslationState,
  file: string,
): Promise<boolean> {
  if (!state.questFile || !state.questDigest) return false;
  if (path.resolve(versionPath, state.questFile) !== path.resolve(file)) return false;
  return (await fileDigest(file)) === state.questDigest;
}

async function questSource(
  versionPath: string,
  state: TranslationState,
  locale: string,
): Promise<string | null> {
  const target = questLangPath(versionPath, locale);
  if ((await fs.pathExists(target)) && !(await ownsQuestFile(versionPath, state, target))) {
    return null;
  }
  return fs.readFile(questLangPath(versionPath, "en_us"), "utf8").catch(() => null);
}

async function removeOwnQuestFile(
  versionPath: string,
  state: TranslationState,
): Promise<void> {
  if (!state.questFile) return;
  const file = path.resolve(versionPath, state.questFile);
  if (await ownsQuestFile(versionPath, state, file)) {
    await fs.remove(file).catch(() => undefined);
  }
}

async function applyQuestLang(
  versionPath: string,
  state: TranslationState,
  locale: string,
  translations: LangEntries,
): Promise<{ questFile: string | null; questDigest: string | null }> {
  const target = questLangPath(versionPath, locale);
  const relative = path.relative(versionPath, target).split(path.sep).join("/");
  const previous = state.questFile ? path.resolve(versionPath, state.questFile) : null;
  if (previous && previous !== path.resolve(target)) {
    await removeOwnQuestFile(versionPath, state);
  }
  const owned = await ownsQuestFile(versionPath, state, target);
  if ((await fs.pathExists(target)) && !owned) {
    return { questFile: null, questDigest: null };
  }
  const { quests } = await readBooks(versionPath, locale);
  const text =
    quests && Object.keys(translations).length > 0
      ? renderQuestLang(quests, translations)
      : null;
  if (!text) {
    if (owned) await fs.remove(target).catch(() => undefined);
    return { questFile: null, questDigest: null };
  }
  const digest = createHash("sha1").update(text, "utf8").digest("hex");
  if (!(owned && digest === state.questDigest)) {
    const temp = `${target}.grubie-tmp`;
    await fs.ensureDir(path.dirname(target));
    await fs.writeFile(temp, text, "utf8");
    await fs.move(temp, target, { overwrite: true });
  }
  return { questFile: relative, questDigest: digest };
}

async function buildAiPack(
  versionPath: string,
  state: TranslationState,
  locale: string,
  mcVersion: string,
): Promise<{
  file: string | null;
  digest: string | null;
  quests: LangEntries;
  questz: boolean;
  books: Map<string, LangEntries>;
  done: Map<string, number>;
}> {
  const known = await loadCachedHashes(locale);
  const units: Array<{ namespace: string; entries: LangEntries }> = [];
  const bookTranslations = new Map<string, LangEntries>();
  const done = new Map<string, number>();
  for (const unit of state.units) {
    if (!known.has(unit.hash)) continue;
    const entries = await readCachedUnit(locale, unit.hash);
    done.set(unit.hash, entries ? Object.keys(entries).length : 0);
    if (!entries || Object.keys(entries).length === 0) continue;
    if (unit.kind === "book" && unit.book) {
      bookTranslations.set(unit.book, {
        ...(bookTranslations.get(unit.book) ?? {}),
        ...entries,
      });
    } else if (!unit.kind) {
      units.push({ namespace: unit.namespace, entries });
    }
  }

  const fileName = `${MANAGED_PACK_PREFIX}ai-${locale}.zip`;
  const target = path.join(packsDir(versionPath), fileName);
  const quests = bookTranslations.get(FTB_QUESTS_BOOK) ?? {};
  bookTranslations.delete(FTB_QUESTS_BOOK);
  const questz = units.some((unit) =>
    Object.keys(unit.entries).some((key) => key.startsWith(QUESTZ_KEY_PREFIX)),
  );
  const files = [
    ...translationPackFiles(units, locale, mcVersion, langFormatFor(mcVersion)),
    ...(bookTranslations.size > 0
      ? bookPackFiles(
          (await readBooks(versionPath, locale)).groups,
          bookTranslations,
          locale,
        )
      : []),
  ];
  if (files.length === 0) {
    await fs.remove(target).catch(() => undefined);
    return { file: null, digest: null, quests, questz, books: bookTranslations, done };
  }

  const description = PACK_DESCRIPTIONS[locale] ?? "Grubie: AI translation of mods";
  files.unshift({
    name: "pack.mcmeta",
    data: Buffer.from(packMcmeta(mcVersion, description), "utf8"),
  });
  const contentDigest = createHash("sha1");
  for (const file of files) contentDigest.update(file.name).update(file.data);
  const value = contentDigest.digest("hex");

  if (value === state.aiDigest && (await fs.pathExists(target))) {
    return { file: fileName, digest: value, quests, questz, books: bookTranslations, done };
  }

  setStage(versionPath, "building");
  const temp = path.join(storageDir(versionPath), `${fileName}.tmp`);
  await fs.ensureDir(storageDir(versionPath));
  await createZipArchive([], temp, undefined, 9, undefined, files);
  await fs.ensureDir(packsDir(versionPath));
  await fs.move(temp, target, { overwrite: true });
  return { file: fileName, digest: value, quests, questz, books: bookTranslations, done };
}

async function applyExternalBooks(
  versionPath: string,
  state: TranslationState,
  locale: string,
  translations: Map<string, LangEntries>,
): Promise<Array<{ file: string; digest: string }>> {
  const owned = new Map(state.externalFiles.map((entry) => [entry.file, entry.digest]));
  const files =
    translations.size > 0
      ? bookPackFiles((await readBooks(versionPath, locale)).groups, translations, locale, true)
      : [];
  const result: Array<{ file: string; digest: string }> = [];
  const keep = new Set<string>();
  for (const file of files) {
    const target = path.join(versionPath, ...file.name.split("/"));
    const current = await fileDigest(target);
    const digest = createHash("sha1").update(file.data).digest("hex");
    if (current !== null && current !== owned.get(file.name)) continue;
    if (current !== digest) {
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(`${target}.grubie-tmp`, file.data);
      await fs.move(`${target}.grubie-tmp`, target, { overwrite: true });
    }
    keep.add(file.name);
    result.push({ file: file.name, digest });
  }
  for (const [file, digest] of owned) {
    if (keep.has(file)) continue;
    const target = path.join(versionPath, ...file.split("/"));
    if ((await fileDigest(target)) === digest) await fs.remove(target).catch(() => undefined);
  }
  return result;
}

async function removeExternalBooks(
  versionPath: string,
  state: TranslationState,
): Promise<void> {
  for (const { file, digest } of state.externalFiles) {
    const target = path.join(versionPath, ...file.split("/"));
    if ((await fileDigest(target)) === digest) await fs.remove(target).catch(() => undefined);
  }
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
  forceLocale = false,
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
    forceLocale,
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
    state.packs.length > 0 ||
    state.aiFile ||
    state.units.length > 0 ||
    state.questFile ||
    state.questzFiles.length > 0 ||
    state.externalFiles.length > 0;
  if (!hadAnything) return;
  if (isVersionRunning(versionPath)) return;
  await removeStaleManaged(versionPath, new Set());
  await removeOwnQuestFile(versionPath, state);
  await restoreQuestz(versionPath, storageDir(versionPath), state.questzFiles);
  await removeExternalBooks(versionPath, state);
  await fs.remove(booksPath(versionPath)).catch(() => undefined);
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
  const modpackPacks = await listModpackPacks(versionPath);
  const questzLang = questzNamespace(await readQuestzChapters(versionPath));
  const skipProjects = userPackProjects(conf);
  const player = await playerPacks(versionPath);
  const fingerprint = digest([
    PROTOCOL,
    locale,
    mcVersion,
    jars.map((jar) => [jar.name, jar.size, jar.mtimeMs]),
    modpackPacks.map((pack) => [pack.id, pack.identity]),
    questzLang ? digest(questzLang.english) : null,
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
      const sources = [...jarSources(jars), ...modpackPacks];
      setStage(versionPath, "scanning", { done: 0, total: sources.length });
      const packIds = new Set(modpackPacks.map((pack) => pack.id));
      const raw = [
        ...(await scanSources(versionPath, sources, packIds, locale)),
        await scanExternalPatchouli(versionPath, locale),
      ];
      const installed = new Set(
        raw
          .filter((_scan, index) => !sources[index] || !packIds.has(sources[index].id))
          .flatMap((scan) => [
            ...scan.namespaces.map((lang) => lang.namespace),
            ...scan.books.map((doc) => doc.namespace),
          ]),
      );
      const scanned = raw.map((scan, index) =>
        !sources[index] || !packIds.has(sources[index].id)
          ? scan
          : sources[index].id.startsWith(`pack:${PLAYER_PACK_FOLDER}/`)
            ? {
                ...scan,
                translatedDocs: [],
                books: scan.books.filter((doc) => installed.has(doc.namespace)),
                namespaces: scan.namespaces
                  .filter((lang) => installed.has(lang.namespace))
                  .map((lang) => ({
                    ...lang,
                    translatedKeys: [],
                    origin: "pack" as const,
                  })),
              }
            : {
                ...scan,
                namespaces: scan.namespaces.map((lang) => ({
                  ...lang,
                  origin: "pack" as const,
                })),
              },
      );
      const langs = preferPackEnglish([
        ...scanned.map((scan) => scan.namespaces),
        ...(questzLang ? [[questzLang]] : []),
      ]);
      const namespaces = modNamespaces(langs);

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
      const coverage = await covered(
        locale,
        packsDir(versionPath),
        packs,
        player,
      );
      const groups = collectBookGroups(
        scanned,
        coverage.docs,
        installedBookFormats(langs.flat().map((lang) => lang.namespace)),
      );
      const quests = await questSource(versionPath, state, locale);
      const questUnits = quests ? planQuestUnits(quests) : [];
      const units: PendingUnit[] = [
        ...planUnits(langs, coverage.keys).map((unit) => ({
          hash: unit.hash,
          namespace: unit.namespace,
          entries: unit.entries,
          keys: Object.keys(unit.entries).length,
          ...(unit.context ? { context: unit.context } : {}),
          ...(unit.origin ? { group: unit.origin === "pack" ? ("packs" as const) : ("quests" as const) } : {}),
        })),
        ...[...planBookUnits(groups), ...questUnits].map((unit) => ({
          hash: unit.hash,
          namespace: unit.namespace,
          entries: unit.entries,
          keys: Object.keys(unit.entries).length,
          kind: "book" as const,
          book: unit.book,
          group: unit.book === FTB_QUESTS_BOOK ? ("quests" as const) : ("books" as const),
          ...(unit.context ? { context: unit.context } : {}),
        })),
      ];
      await writeBooks(
        versionPath,
        locale,
        groups.filter((group) => units.some((unit) => unit.book === group.key)),
        questUnits.length > 0 ? quests : null,
      );
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
        state.quotaUntil,
      );

      next = {
        ...next,
        fingerprint,
        packs,
        units: units.map((unit) => ({
          hash: unit.hash,
          namespace: unit.namespace,
          keys: unit.keys,
          ...(unit.kind ? { kind: unit.kind, book: unit.book } : {}),
          ...(unit.group ? { group: unit.group } : {}),
          ...(unit.context
            ? { title: unit.context.name }
            : unit.book
              ? { title: unit.book.split(":").pop() }
              : {}),
        })),
        failed: [...new Set([...failed, ...submitted.unsupported])],
        mods: jars.length,
        needsAccount: submitted.needsAccount,
        error: next.error ?? (submitted.quota ? "quota" : null),
        quotaUntil: submitted.quota
          ? state.quotaUntil && state.quotaUntil > Date.now()
            ? state.quotaUntil
            : nextQuotaReset()
          : null,
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
  next.units = next.units.map((unit) =>
    ai.done.has(unit.hash) ? { ...unit, done: ai.done.get(unit.hash) } : unit,
  );
  Object.assign(next, await applyQuestLang(versionPath, next, locale, ai.quests));
  next.externalFiles = await applyExternalBooks(versionPath, next, locale, ai.books);
  if (ai.questz) {
    next.questzFiles = await applyQuestzRewrite(
      versionPath,
      storageDir(versionPath),
      state.questzFiles,
    );
  }
  await applyOptions(
    versionPath,
    mcVersion,
    ourPackFiles(next),
    locale,
    next.forcedLocale !== locale,
  );
  next.forcedLocale = locale;
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
