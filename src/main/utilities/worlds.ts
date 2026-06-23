import {
  IWorld,
  IWorldStatistics,
  IWorldStatsAggregate,
} from "@/types/World";
import { IAchievementStats, EMPTY_ACHIEVEMENT_STATS } from "@/types/Achievements";
import { app } from "electron";
import { generateOfflineUUID, toUUID } from "./other";
import { IAuth, ILocalAccount } from "@/types/Account";
import { jwtDecode } from "jwt-decode";
import { deserialize, serialize } from "@xmcl/nbt";
import path from "path";
import fs from "fs-extra";
import zlib from "zlib";
import zip from "adm-zip";
import { pathToFileURL } from "url";
import { extractZip } from "./archiver";

function getAccountUuid(account: ILocalAccount): string {
  if (
    account.accessToken &&
    typeof account.accessToken === "string" &&
    account.accessToken.trim()
  ) {
    try {
      const decode = jwtDecode<IAuth>(account.accessToken);
      const rawUuid: string | undefined = decode?.uuid;

      if (typeof rawUuid === "string" && rawUuid) {
        return rawUuid.includes("-") ? rawUuid : toUUID(rawUuid);
      }
    } catch {}
  }

  return toUUID(generateOfflineUUID(account.nickname));
}

async function resolveStatsFile(
  worldPath: string,
  accountUUID: string,
): Promise<string | null> {
  const candidates = [
    path.join(worldPath, "players", "stats", `${accountUUID}.json`),
    path.join(worldPath, "stats", `${accountUUID}.json`),
  ];
  for (const candidate of candidates) {
    if (await fs.pathExists(candidate)) return candidate;
  }
  return null;
}

export async function loadStatistics(
  worldPath: string,
  account: ILocalAccount,
): Promise<IWorldStatistics | null> {
  const accountUUID = getAccountUuid(account);

  const statisticsPath = await resolveStatsFile(worldPath, accountUUID);
  if (!statisticsPath) return null;

  try {
    const stats: IWorldStatistics = await fs.readJSON(statisticsPath);
    return stats;
  } catch (error) {
    console.error("Failed to load world statistics:", error);
    return null;
  }
}

function stringifyNbtValue(value: any): string {
  if (value === null || value === undefined) return "";

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value) && value.length === 2) {
    const [low, high] = value;
    if (typeof low === "number" && typeof high === "number") {
      let result = (BigInt(high) << 32n) | (BigInt(low) & 0xffffffffn);
      if (result >= 0x8000000000000000n) {
        result -= 0x10000000000000000n;
      }
      return result.toString();
    }
  }

  if (typeof value === "object") {
    if (typeof value.low === "number" && typeof value.high === "number") {
      let result =
        (BigInt(value.high) << 32n) | (BigInt(value.low) & 0xffffffffn);
      if (result >= 0x8000000000000000n) {
        result -= 0x10000000000000000n;
      }
      return result.toString();
    }

    if ("value" in value) {
      return stringifyNbtValue(value.value);
    }

    const result = value.toString?.();
    if (typeof result === "string" && result !== "[object Object]") {
      return result;
    }
  }

  return "";
}

function findNbtValueByKey(source: any, keys: string[]): any {
  if (!source || typeof source !== "object") return undefined;

  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = key.toLowerCase();
    if (keys.includes(normalizedKey)) return value;
  }

  for (const value of Object.values(source)) {
    const result = findNbtValueByKey(value, keys);
    if (result !== undefined) return result;
  }

  return undefined;
}

function getWorldSeed(nbtData: any): string {
  const data = nbtData?.Data ?? nbtData?.data ?? nbtData;

  const exactSeed =
    data?.WorldGenSettings?.seed ??
    data?.WorldGenSettings?.Seed ??
    data?.worldGenSettings?.seed ??
    data?.RandomSeed;

  const seed = stringifyNbtValue(exactSeed);
  if (seed) return seed;

  return stringifyNbtValue(findNbtValueByKey(data, ["seed", "randomseed"]));
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

    try {
      const levelData = await fs.readFile(levelDatPath);
      const u = new Uint8Array(levelData);

      const decompressed = zlib.gunzipSync(u);
      const nbtData: any = await deserialize(decompressed);

      if (
        typeof nbtData?.Data?.LevelName === "string" &&
        nbtData.Data.LevelName.trim()
      ) {
        name = nbtData.Data.LevelName;
      }

      seed = getWorldSeed(nbtData);
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
          const wgsNbt: any = await deserialize(
            zlib.gunzipSync(new Uint8Array(wgsRaw)),
          );
          seed = getWorldSeed(wgsNbt);
        }
      } catch (err) {
        console.warn(
          "Failed to read world_gen_settings.dat:",
          worldPath,
          err,
        );
      }
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
    };
  } catch (err) {
    console.error("Error reading world:", err);
    return null;
  }
}

export async function writeWorldName(
  worldPath: string,
  newName: string,
): Promise<string | null> {
  try {
    const levelDatPath = path.join(worldPath, "level.dat");
    const fileData = await fs.readFile(levelDatPath);
    const u = new Uint8Array(fileData);

    const decompressed = zlib.gunzipSync(u);
    const nbtData: any = await deserialize(decompressed);

    if (nbtData?.Data) {
      nbtData.Data.LevelName = newName;
    } else {
      console.error("Data section not found in level.dat");
      return null;
    }

    const modifiedBuffer = await serialize(nbtData);
    const compressed = zlib.gzipSync(new Uint8Array(modifiedBuffer));

    await fs.writeFile(levelDatPath, compressed);

    const sanitized = newName.replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
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
    if (key.endsWith("_one_cm")) total += toFiniteNumber(value);
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

  const accountUUID = getAccountUuid(account);
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
      accountUUID,
    );
    if (!statsFile) continue;
    let data: IWorldStatistics | null = null;
    try {
      data = await fs.readJSON(statsFile);
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

export async function loadGlobalAchievementStats(
  account: ILocalAccount,
): Promise<IAchievementStats> {
  const stats: IAchievementStats = { ...EMPTY_ACHIEVEMENT_STATS };
  const accountUUID = getAccountUuid(account);

  const versionsPath = path.join(
    app.getPath("appData"),
    ".grubielauncher",
    "minecraft",
    "versions",
  );

  let versions: string[] = [];
  try {
    if (!(await fs.pathExists(versionsPath))) return stats;
    versions = await fs.readdir(versionsPath);
  } catch {
    return stats;
  }

  for (const version of versions) {
    const savesPath = path.join(versionsPath, version, "saves");

    let worldEntries: string[] = [];
    try {
      if (!(await fs.pathExists(savesPath))) continue;
      worldEntries = await fs.readdir(savesPath);
    } catch {
      continue;
    }

    for (const world of worldEntries) {
      const statsFile = await resolveStatsFile(
        path.join(savesPath, world),
        accountUUID,
      );
      if (!statsFile) continue;

      try {
        const data: IWorldStatistics = await fs.readJSON(statsFile);
        if (data?.stats) accumulateWorldStats(stats, data);
      } catch {
        continue;
      }
    }
  }

  return stats;
}

function getArchiveEntryPath(entry: any) {
  return String(entry?.entryName || "").replace(/\\/g, "/");
}

function sanitizeWorldFolderName(name: string) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim();
}

async function getWorldArchiveInfo(zipPath: string) {
  const archive = new zip(zipPath);
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

  const destination = archiveInfo.hasRootFolder
    ? savesPath
    : path.join(savesPath, archiveInfo.worldName);

  await extractZip(zipPath, destination);

  return path.join(savesPath, archiveInfo.worldName);
}
