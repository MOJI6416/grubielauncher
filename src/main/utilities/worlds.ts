import {
  IWorld,
  IWorldStatistics,
  IWorldStatsAggregate,
  WorldDuplicateResult,
  WorldExportResult,
  WorldImportResult,
} from "@/types/World";
import { getWorldSeed, readWorldMeta } from "./worldMeta";
import {
  IAchievementStats,
  IAchievementStatsResult,
  EMPTY_ACHIEVEMENT_STATS,
  addAchievementStats,
} from "@/types/Achievements";
import { getLauncherPaths, toUUID } from "./other";
import { getOfflineUuidCandidates } from "./offlineUuidMigration";
import { IAuth, ILocalAccount } from "@/types/Account";
import { jwtDecode } from "jwt-decode";
import { deserialize } from "@xmcl/nbt";
import { patchNbtString, readNbtString } from "./nbtPatch";
import { randomUUID } from "crypto";
import path from "path";
import fs from "fs-extra";
import zlib from "zlib";
import { promisify } from "util";
import { pathToFileURL } from "url";

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const gzipAsync = promisify(zlib.gzip);
const deflateAsync = promisify(zlib.deflate);

type NbtCompression = "gzip" | "deflate" | "none";

function getAccountUuids(account: ILocalAccount): string[] {
  if (
    account.accessToken &&
    typeof account.accessToken === "string" &&
    account.accessToken.trim()
  ) {
    try {
      const decode = jwtDecode<IAuth>(account.accessToken);
      const rawUuid: string | undefined = decode?.uuid;

      if (typeof rawUuid === "string" && rawUuid) {
        return [rawUuid.includes("-") ? rawUuid : toUUID(rawUuid)];
      }
    } catch {}
  }

  const { legacy, canonical } = getOfflineUuidCandidates(account.nickname);
  const uuids = [toUUID(canonical)];
  if (legacy !== canonical) uuids.push(toUUID(legacy));

  return uuids;
}

type StatsFileRef = { path: string; mtimeMs: number; size: number };

async function resolveStatsFile(
  worldPath: string,
  accountUUIDs: string[],
): Promise<StatsFileRef | null> {
  const candidates = accountUUIDs.flatMap((accountUUID) => [
    path.join(worldPath, "players", "stats", `${accountUUID}.json`),
    path.join(worldPath, "stats", `${accountUUID}.json`),
  ]);

  let freshest: StatsFileRef | null = null;

  for (const candidate of candidates) {
    const stats = await fs.stat(candidate).catch(() => null);
    if (!stats?.isFile()) continue;

    if (!freshest || stats.mtimeMs > freshest.mtimeMs) {
      freshest = {
        path: candidate,
        mtimeMs: stats.mtimeMs,
        size: stats.size,
      };
    }
  }

  return freshest;
}

export async function loadStatistics(
  worldPath: string,
  account: ILocalAccount,
): Promise<IWorldStatistics | null> {
  const accountUUIDs = getAccountUuids(account);

  const statisticsPath = await resolveStatsFile(worldPath, accountUUIDs);
  if (!statisticsPath) return null;

  try {
    const stats: IWorldStatistics = await fs.readJSON(statisticsPath.path);
    return stats;
  } catch (error) {
    console.error("Failed to load world statistics:", error);
    return null;
  }
}

async function decompressNbtFile(
  fileData: Buffer,
): Promise<{ data: Buffer; compression: NbtCompression }> {
  const input = new Uint8Array(fileData);

  try {
    return {
      data: Buffer.from(await gunzipAsync(input)),
      compression: "gzip",
    };
  } catch {}

  try {
    return {
      data: Buffer.from(await inflateAsync(input)),
      compression: "deflate",
    };
  } catch {}

  return { data: Buffer.from(input), compression: "none" };
}

async function decompressNbt(fileData: Buffer): Promise<Buffer> {
  return (await decompressNbtFile(fileData)).data;
}

async function compressNbt(
  data: Buffer,
  compression: NbtCompression,
): Promise<Buffer> {
  const input = new Uint8Array(data);

  if (compression === "none") return Buffer.from(input);
  if (compression === "deflate") return Buffer.from(await deflateAsync(input));

  return Buffer.from(await gzipAsync(input));
}

export async function readWorldDisplayName(worldPath: string): Promise<string> {
  const fallback = path.basename(worldPath);

  try {
    const levelData = await fs.readFile(path.join(worldPath, "level.dat"));
    const nbtData: any = await deserialize(await decompressNbt(levelData));
    const name = nbtData?.Data?.LevelName;

    return typeof name === "string" && name.trim() ? name : fallback;
  } catch {
    return fallback;
  }
}

export async function readWorld(
  worldPath: string,
  account: ILocalAccount,
): Promise<IWorld | null> {
  try {
    const levelDatPath = path.join(worldPath, "level.dat");
    const datapacksPath = path.join(worldPath, "datapacks");
    const iconPath = path.join(worldPath, "icon.png");

    if (!(await fs.pathExists(levelDatPath))) {
      return null;
    }

    let name = path.basename(worldPath);
    let seed = "";
    let meta: ReturnType<typeof readWorldMeta> = {};

    try {
      const levelData = await fs.readFile(levelDatPath);

      const nbtData: any = await deserialize(await decompressNbt(levelData));

      if (
        typeof nbtData?.Data?.LevelName === "string" &&
        nbtData.Data.LevelName.trim()
      ) {
        name = nbtData.Data.LevelName;
      }

      seed = getWorldSeed(nbtData);
      meta = readWorldMeta(nbtData);
    } catch (err) {
      console.warn(
        "Failed to read world level data, using folder fallback:",
        worldPath,
        err,
      );
    }

    if (!seed) {
      try {
        const wgsPath = path.join(
          worldPath,
          "data",
          "minecraft",
          "world_gen_settings.dat",
        );
        if (await fs.pathExists(wgsPath)) {
          const wgsRaw = await fs.readFile(wgsPath);
          const wgsNbt: any = await deserialize(await decompressNbt(wgsRaw));
          seed = getWorldSeed(wgsNbt);
        }
      } catch (err) {
        console.warn("Failed to read world_gen_settings.dat:", worldPath, err);
      }
    }

    if (!meta.lastPlayed) {
      const levelStats = await fs.stat(levelDatPath).catch(() => null);
      if (levelStats?.mtimeMs) meta.lastPlayed = Math.round(levelStats.mtimeMs);
    }

    let icon: string | undefined;
    if (await fs.pathExists(iconPath)) {
      icon = pathToFileURL(iconPath).href;
    }

    let datapacks: string[] = [];
    try {
      if (await fs.pathExists(datapacksPath)) {
        datapacks = await fs.readdir(datapacksPath);
      }
    } catch {
      datapacks = [];
    }

    return {
      name,
      seed,
      icon,
      datapacks,
      statistics: (await loadStatistics(worldPath, account)) || undefined,
      isDownloaded: await fs.pathExists(path.join(worldPath, ".downloaded")),
      path: worldPath,
      folderName: path.basename(worldPath),
      ...meta,
    };
  } catch (err) {
    console.error("Error reading world:", err);
    return null;
  }
}

async function isLevelNameWritten(
  levelDatPath: string,
  expectedName: string,
): Promise<boolean> {
  try {
    const written = await fs.readFile(levelDatPath);
    const decompressed = await decompressNbt(written);

    await deserialize(decompressed);

    return readNbtString(decompressed, "LevelName") === expectedName;
  } catch {
    return false;
  }
}

export async function writeWorldName(
  worldPath: string,
  newName: string,
): Promise<string | null> {
  try {
    const levelDatPath = path.join(worldPath, "level.dat");
    const fileData = await fs.readFile(levelDatPath);

    const { data: decompressed, compression } =
      await decompressNbtFile(fileData);
    const patched = patchNbtString(decompressed, "LevelName", newName);

    if (!patched) {
      console.error("LevelName tag not found in level.dat");
      return null;
    }

    await deserialize(patched);

    const compressed = await compressNbt(patched, compression);
    const backupPath = path.join(worldPath, "level.dat_grubie.bak");
    const tempPath = path.join(worldPath, `level.dat.${randomUUID()}.tmp`);

    await fs.copy(levelDatPath, backupPath, { overwrite: true });
    await fs.writeFile(tempPath, compressed);
    await fs.move(tempPath, levelDatPath, { overwrite: true });

    if (!(await isLevelNameWritten(levelDatPath, newName))) {
      console.error("level.dat verification failed, restoring backup");
      await fs.copy(backupPath, levelDatPath, { overwrite: true });
      return null;
    }

    await fs.remove(backupPath).catch(() => {});

    const sanitized = sanitizeWorldFolderName(newName);
    const newFolderName = sanitized || path.basename(worldPath);

    const newWorldPath = path.join(path.dirname(worldPath), newFolderName);

    if (await fs.pathExists(newWorldPath)) return worldPath;

    if (newWorldPath !== worldPath) {
      await fs.rename(worldPath, newWorldPath);
    }

    return newWorldPath;
  } catch (err) {
    console.error("Error changing world name:", err);
    return null;
  }
}

function toFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumCategory(category: Record<string, number> | undefined): number {
  if (!category) return 0;
  let total = 0;
  for (const value of Object.values(category)) total += toFiniteNumber(value);
  return total;
}

function sumDistance(custom: Record<string, number> | undefined): number {
  if (!custom) return 0;
  let total = 0;
  for (const [key, value] of Object.entries(custom)) {
    if (!key.endsWith("_one_cm")) continue;
    if (key.endsWith("aviate_one_cm") || key.endsWith("fall_one_cm")) continue;
    total += toFiniteNumber(value);
  }
  return total;
}

export async function loadVersionWorldStatistics(
  versionPath: string,
  account: ILocalAccount,
): Promise<IWorldStatsAggregate> {
  const aggregate: IWorldStatsAggregate = {
    worlds: 0,
    playTimeTicks: 0,
    deaths: 0,
    mobKills: 0,
    distanceCm: 0,
    blocksMined: 0,
    jumps: 0,
  };

  const accountUUIDs = getAccountUuids(account);
  const savesPath = path.join(versionPath, "saves");

  let entries: string[] = [];
  try {
    if (!(await fs.pathExists(savesPath))) return aggregate;
    entries = await fs.readdir(savesPath);
  } catch {
    return aggregate;
  }

  for (const entry of entries) {
    const statsFile = await resolveStatsFile(
      path.join(savesPath, entry),
      accountUUIDs,
    );
    if (!statsFile) continue;
    let data: IWorldStatistics | null = null;
    try {
      data = await fs.readJSON(statsFile.path);
    } catch {
      continue;
    }
    if (!data?.stats) continue;

    const custom = data.stats["minecraft:custom"];
    const mined = data.stats["minecraft:mined"];

    aggregate.worlds += 1;
    aggregate.playTimeTicks += toFiniteNumber(custom?.["minecraft:play_time"]);
    aggregate.deaths += toFiniteNumber(custom?.["minecraft:deaths"]);
    aggregate.mobKills += toFiniteNumber(custom?.["minecraft:mob_kills"]);
    aggregate.jumps += toFiniteNumber(custom?.["minecraft:jump"]);
    aggregate.distanceCm += sumDistance(custom);
    aggregate.blocksMined += sumCategory(mined);
  }

  return aggregate;
}

function statValue(
  category: Record<string, number> | undefined,
  key: string,
): number {
  return toFiniteNumber(category?.[`minecraft:${key}`]);
}

function accumulateWorldStats(
  acc: IAchievementStats,
  data: IWorldStatistics,
): void {
  const custom = data.stats["minecraft:custom"];
  const mined = data.stats["minecraft:mined"];
  const crafted = data.stats["minecraft:crafted"];
  const killed = data.stats["minecraft:killed"];

  acc.worlds += 1;
  acc.playTimeTicks += statValue(custom, "play_time");
  acc.deaths += statValue(custom, "deaths");
  acc.mobKills += statValue(custom, "mob_kills");
  acc.jumps += statValue(custom, "jump");
  acc.distanceCm += sumDistance(custom);
  acc.elytraCm += statValue(custom, "aviate_one_cm");
  acc.fishCaught += statValue(custom, "fish_caught");
  acc.animalsBred += statValue(custom, "animals_bred");
  acc.itemsEnchanted += statValue(custom, "enchant_item");
  acc.villagerTrades += statValue(custom, "traded_with_villager");
  acc.timesSlept += statValue(custom, "sleep_in_bed");
  acc.raidsWon += statValue(custom, "raid_win");

  acc.blocksMined += sumCategory(mined);
  acc.diamondsMined +=
    statValue(mined, "diamond_ore") + statValue(mined, "deepslate_diamond_ore");
  acc.ancientDebrisMined += statValue(mined, "ancient_debris");

  acc.itemsCrafted += sumCategory(crafted);

  acc.enderDragonKills += statValue(killed, "ender_dragon");
  acc.witherKills += statValue(killed, "wither");
  acc.wardenKills += statValue(killed, "warden");
}

const WORLD_ID_MARKER = ".grubie-world-id";
const WORLD_KEY_PATTERN = /^[a-f0-9-]{32,36}$/;

export async function readWorldKey(worldPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(
      path.join(worldPath, WORLD_ID_MARKER),
      "utf-8",
    );
    const id = raw.trim().toLowerCase();
    return WORLD_KEY_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}

export async function ensureWorldKey(
  worldPath: string,
): Promise<string | null> {
  const existing = await readWorldKey(worldPath);
  if (existing) return existing;

  try {
    const id = randomUUID();
    await fs.writeFile(path.join(worldPath, WORLD_ID_MARKER), id, "utf-8");
    return id;
  } catch {
    return null;
  }
}

export function reduceStatsToAchievementStats(
  data: IWorldStatistics,
): IAchievementStats {
  const stats: IAchievementStats = { ...EMPTY_ACHIEVEMENT_STATS };
  if (data?.stats) accumulateWorldStats(stats, data);
  return stats;
}

type CachedWorldStats = {
  mtimeMs: number;
  size: number;
  stats: IAchievementStats | null;
  worldKey: string | null;
  unreadable: boolean;
};

const MAX_CACHED_WORLD_STATS = 500;
const worldStatsCache = new Map<string, CachedWorldStats>();

async function getCachedWorldStats(
  worldPath: string,
  statsFile: StatsFileRef,
): Promise<CachedWorldStats> {
  const cached = worldStatsCache.get(statsFile.path);

  if (
    cached &&
    cached.mtimeMs === statsFile.mtimeMs &&
    cached.size === statsFile.size
  ) {
    if (cached.stats && !cached.worldKey) {
      cached.worldKey = await readWorldKey(worldPath);
    }

    worldStatsCache.delete(statsFile.path);
    worldStatsCache.set(statsFile.path, cached);

    return cached;
  }

  const entry: CachedWorldStats = {
    mtimeMs: statsFile.mtimeMs,
    size: statsFile.size,
    stats: null,
    worldKey: null,
    unreadable: false,
  };

  try {
    const data: IWorldStatistics = await fs.readJSON(statsFile.path);
    if (data?.stats) {
      entry.stats = reduceStatsToAchievementStats(data);
      entry.worldKey = await readWorldKey(worldPath);
    }
  } catch {
    entry.unreadable = true;
  }

  worldStatsCache.set(statsFile.path, entry);

  while (worldStatsCache.size > MAX_CACHED_WORLD_STATS) {
    const oldest = worldStatsCache.keys().next().value;
    if (!oldest) break;
    worldStatsCache.delete(oldest);
  }

  return entry;
}

export async function loadGlobalAchievementStats(
  account: ILocalAccount,
): Promise<IAchievementStatsResult> {
  let stats: IAchievementStats = { ...EMPTY_ACHIEVEMENT_STATS };
  const worldKeys = new Set<string>();
  const accountUUIDs = getAccountUuids(account);
  let partial = false;

  const versionsPath = path.join(getLauncherPaths().minecraft, "versions");

  let versions: string[] = [];
  try {
    if (!(await fs.pathExists(versionsPath))) {
      return { stats, worldKeys: [], partial: false };
    }
    versions = await fs.readdir(versionsPath);
  } catch {
    return { stats, worldKeys: [], partial: true };
  }

  for (const version of versions) {
    const savesPath = path.join(versionsPath, version, "saves");

    let worldEntries: string[] = [];
    try {
      if (!(await fs.pathExists(savesPath))) continue;
      worldEntries = await fs.readdir(savesPath);
    } catch {
      partial = true;
      continue;
    }

    for (const world of worldEntries) {
      const worldPath = path.join(savesPath, world);
      const statsFile = await resolveStatsFile(worldPath, accountUUIDs);
      if (!statsFile) continue;

      const cached = await getCachedWorldStats(worldPath, statsFile);
      if (!cached.stats) {
        if (cached.unreadable) partial = true;
        continue;
      }

      stats = addAchievementStats(stats, cached.stats);
      if (cached.worldKey) worldKeys.add(cached.worldKey);
    }
  }

  return { stats, worldKeys: [...worldKeys], partial };
}

function getArchiveEntryPath(entry: any) {
  return String(entry?.entryName || "").replace(/\\/g, "/");
}

function sanitizeWorldFolderName(name: string) {
  const forbidden = '<>:"/\\|?*';
  return [...name]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && !forbidden.includes(character);
    })
    .join("")
    .trim();
}

async function getWorldArchiveInfo(zipPath: string) {
  const { openArchive } = await import("./archiver");
  const archive = await openArchive(zipPath);
  const entries = archive.getEntries();

  const entryNames = entries
    .map(getArchiveEntryPath)
    .filter((entryName) => entryName && entryName !== "/" && entryName !== ".");

  const hasRootLevelDat = entryNames.some(
    (entryName) => entryName.toLowerCase() === "level.dat",
  );

  if (hasRootLevelDat) {
    const fallbackName = sanitizeWorldFolderName(
      path.basename(zipPath, path.extname(zipPath)),
    );

    return fallbackName
      ? {
          worldName: fallbackName,
          hasRootFolder: false,
        }
      : null;
  }

  const rootsWithLevelDat = new Set<string>();
  for (const entryName of entryNames) {
    const parts = entryName.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[1].toLowerCase() === "level.dat") {
      rootsWithLevelDat.add(parts[0]);
    }
  }

  if (rootsWithLevelDat.size === 1) {
    return {
      worldName: [...rootsWithLevelDat][0],
      hasRootFolder: true,
    };
  }

  const rootFolders = new Set<string>();

  for (const entryName of entryNames) {
    const parts = entryName.split("/");
    if (parts.length > 1 && parts[0]) {
      rootFolders.add(parts[0]);
    }
  }

  if (rootFolders.size === 1) {
    return {
      worldName: [...rootFolders][0],
      hasRootFolder: true,
    };
  }

  return null;
}

export async function getWorldName(zipPath: string) {
  const archiveInfo = await getWorldArchiveInfo(zipPath);
  return archiveInfo?.worldName || null;
}

export async function extractWorldArchive(
  zipPath: string,
  savesPath: string,
): Promise<string | null> {
  const archiveInfo = await getWorldArchiveInfo(zipPath);
  if (!archiveInfo) return null;

  const destination = path.join(savesPath, archiveInfo.worldName);
  const prefix = archiveInfo.hasRootFolder ? `${archiveInfo.worldName}/` : "";

  const { openArchive, extractEntries, getSafeExtractPath } = await import(
    "./archiver"
  );
  const archive = await openArchive(zipPath);

  const entries = archive
    .getEntries()
    .filter(
      (entry) =>
        getArchiveEntryPath(entry).startsWith(prefix) &&
        getArchiveEntryPath(entry).slice(prefix.length).length > 0,
    );

  if (!entries.length) return null;

  await fs.ensureDir(destination);
  await extractEntries(entries, (entryName) =>
    getSafeExtractPath(
      destination,
      entryName.split("\\").join("/").slice(prefix.length),
    ),
  );

  return destination;
}

const VOLATILE_WORLD_FILES = new Set([
  "session.lock",
  ".downloaded",
  WORLD_ID_MARKER,
]);
const MAX_IMPORT_ARCHIVE_BYTES = 512 * 1024 * 1024;

async function directorySize(target: string): Promise<number> {
  let entries: import("fs-extra").Dirent[];
  try {
    entries = await fs.readdir(target, { withFileTypes: true });
  } catch {
    return 0;
  }

  let total = 0;

  for (const entry of entries) {
    const full = path.join(target, entry.name);

    if (entry.isDirectory()) {
      total += await directorySize(full);
      continue;
    }

    const stats = await fs.lstat(full).catch(() => null);
    if (stats?.isFile()) total += stats.size;
  }

  return total;
}

export async function listWorldFolders(
  versionPath: string,
): Promise<string[]> {
  const savesPath = path.join(path.resolve(versionPath), "saves");

  let entries: import("fs-extra").Dirent[];
  try {
    entries = await fs.readdir(savesPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const folders: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (!(await fs.pathExists(path.join(savesPath, entry.name, "level.dat")))) {
      continue;
    }

    folders.push(entry.name);
  }

  return folders;
}

export async function countWorlds(versionPath: string): Promise<number> {
  return (await listWorldFolders(versionPath)).length;
}

export async function getWorldFolderSizes(
  versionPath: string,
): Promise<Record<string, number>> {
  const savesPath = path.join(path.resolve(versionPath), "saves");
  const sizes: Record<string, number> = {};

  let entries: import("fs-extra").Dirent[];
  try {
    entries = await fs.readdir(savesPath, { withFileTypes: true });
  } catch {
    return sizes;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    sizes[entry.name] = await directorySize(path.join(savesPath, entry.name));
  }

  return sizes;
}

export async function duplicateWorld(
  worldPath: string,
  newName: string,
): Promise<WorldDuplicateResult> {
  const resolvedWorldPath = path.resolve(worldPath);

  if (!(await fs.pathExists(path.join(resolvedWorldPath, "level.dat")))) {
    return { ok: false, error: "worldMissing" };
  }

  const savesPath = path.dirname(resolvedWorldPath);
  const folderName =
    sanitizeWorldFolderName(newName) ||
    `${path.basename(resolvedWorldPath)}-copy`;
  const targetPath = path.join(savesPath, folderName);

  if (await fs.pathExists(targetPath)) return { ok: false, error: "nameTaken" };

  const stagingPath = path.join(savesPath, `.grubie-copy-${randomUUID()}`);

  try {
    await fs.copy(resolvedWorldPath, stagingPath, {
      filter: (source) => !VOLATILE_WORLD_FILES.has(path.basename(source)),
    });
    await fs.move(stagingPath, targetPath);
  } catch (error) {
    console.error("Failed to duplicate a world:", error);
    await fs.remove(stagingPath).catch(() => {});
    return { ok: false, error: "failed" };
  }

  const renamed = await writeWorldName(targetPath, newName);

  return { ok: true, path: renamed || targetPath };
}

async function pickFreeArchivePath(
  destinationDir: string,
  baseName: string,
): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? "" : ` (${attempt + 1})`;
    const candidate = path.join(destinationDir, `${baseName}${suffix}.zip`);
    if (!(await fs.pathExists(candidate))) return candidate;
  }

  return path.join(destinationDir, `${baseName}-${Date.now()}.zip`);
}

export async function exportWorld(
  worldPath: string,
  destinationDir: string,
): Promise<WorldExportResult> {
  const resolvedWorldPath = path.resolve(worldPath);

  if (!(await fs.pathExists(path.join(resolvedWorldPath, "level.dat")))) {
    return { ok: false, error: "worldMissing" };
  }

  const baseName =
    sanitizeWorldFolderName(await readWorldDisplayName(resolvedWorldPath)) ||
    path.basename(resolvedWorldPath);

  const targetPath = await pickFreeArchivePath(
    path.resolve(destinationDir),
    baseName,
  );

  try {
    await fs.ensureDir(path.resolve(destinationDir));

    const { createZipArchive } = await import("./archiver");
    await createZipArchive(
      [resolvedWorldPath],
      targetPath,
      path.dirname(resolvedWorldPath),
      6,
    );

    const stats = await fs.stat(targetPath).catch(() => null);
    if (!stats?.isFile()) return { ok: false, error: "failed" };

    return { ok: true, path: targetPath, size: stats.size };
  } catch (error) {
    console.error("Failed to export a world:", error);
    await fs.remove(targetPath).catch(() => {});
    return { ok: false, error: "failed" };
  }
}

export async function importWorldArchive(
  zipPath: string,
  versionPath: string,
): Promise<WorldImportResult> {
  const resolvedZipPath = path.resolve(zipPath);
  const savesPath = path.join(path.resolve(versionPath), "saves");

  const archiveStats = await fs.stat(resolvedZipPath).catch(() => null);
  if (!archiveStats?.isFile()) return { ok: false, error: "archiveInvalid" };
  if (archiveStats.size > MAX_IMPORT_ARCHIVE_BYTES) {
    return { ok: false, error: "archiveTooLarge" };
  }

  try {
    const worldName = await getWorldName(resolvedZipPath);
    if (!worldName) return { ok: false, error: "archiveInvalid" };

    await fs.ensureDir(savesPath);

    if (await fs.pathExists(path.join(savesPath, worldName))) {
      return { ok: false, error: "nameTaken" };
    }

    const imported = await extractWorldArchive(resolvedZipPath, savesPath);
    if (!imported) return { ok: false, error: "archiveInvalid" };

    if (!(await fs.pathExists(path.join(imported, "level.dat")))) {
      await fs.remove(imported).catch(() => {});
      return { ok: false, error: "archiveInvalid" };
    }

    return {
      ok: true,
      path: imported,
      name: await readWorldDisplayName(imported),
    };
  } catch (error) {
    console.error("Failed to import a world archive:", error);
    return { ok: false, error: "archiveInvalid" };
  }
}
