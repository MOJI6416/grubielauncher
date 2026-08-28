import {
  IWorldMeta,
  WorldDifficulty,
  WorldGameMode,
} from "@/types/World";

const GAME_MODES: WorldGameMode[] = [
  "survival",
  "creative",
  "adventure",
  "spectator",
];

const DIFFICULTIES: WorldDifficulty[] = ["peaceful", "easy", "normal", "hard"];

export function stringifyNbtValue(value: any): string {
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

export function findNbtValueByKey(source: any, keys: string[]): any {
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

export function getWorldSeed(nbtData: any): string {
  const data = nbtData?.Data ?? nbtData?.data ?? nbtData;

  const exactSeed =
    data?.WorldGenSettings?.seed ??
    data?.WorldGenSettings?.Seed ??
    data?.worldGenSettings?.seed ??
    data?.RandomSeed;

  const seed = stringifyNbtValue(exactSeed);
  if (seed) return seed;

  const genSettings = data?.WorldGenSettings ?? data?.worldGenSettings;
  const searchRoot = genSettings ?? data;
  return stringifyNbtValue(
    findNbtValueByKey(searchRoot, ["seed", "randomseed"]),
  );
}

function nbtNumber(value: unknown): number {
  const text = stringifyNbtValue(value);
  if (!text) return Number.NaN;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function nbtBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value;

  const parsed = nbtNumber(value);
  if (Number.isNaN(parsed)) return undefined;

  return parsed !== 0;
}

function readDifficulty(data: any): WorldDifficulty | undefined {
  const legacy = DIFFICULTIES[nbtNumber(data?.Difficulty)];
  if (legacy) return legacy;

  const modern = stringifyNbtValue(
    data?.difficulty_settings?.difficulty ?? data?.DifficultySettings?.difficulty,
  ).toLowerCase();

  return DIFFICULTIES.find((entry) => entry === modern);
}

function readHardcore(data: any): boolean | undefined {
  return (
    nbtBoolean(data?.hardcore) ??
    nbtBoolean(data?.difficulty_settings?.hardcore) ??
    nbtBoolean(data?.DifficultySettings?.hardcore)
  );
}

function readSpawn(data: any): IWorldMeta["spawn"] {
  const position = data?.spawn?.pos;

  if (Array.isArray(position) && position.length >= 3) {
    const [x, y, z] = position.map((value) => nbtNumber(value));
    if ([x, y, z].every((value) => Number.isFinite(value))) return { x, y, z };
  }

  const x = nbtNumber(data?.SpawnX);
  const y = nbtNumber(data?.SpawnY);
  const z = nbtNumber(data?.SpawnZ);

  if ([x, y, z].every((value) => Number.isFinite(value))) return { x, y, z };

  return undefined;
}

function readStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const list = value
    .map((entry) => stringifyNbtValue(entry))
    .filter((entry) => entry.length > 0);

  return list.length ? list : undefined;
}

export function readWorldMeta(nbtData: any): IWorldMeta {
  const data = nbtData?.Data ?? nbtData?.data;
  if (!data || typeof data !== "object") return {};

  const lastPlayed = nbtNumber(data.LastPlayed);
  const worldAgeTicks = nbtNumber(data.Time);
  const dataVersion = nbtNumber(data.DataVersion);
  const versionName = stringifyNbtValue(data.Version?.Name);

  return {
    gameMode: GAME_MODES[nbtNumber(data.GameType)],
    difficulty: readDifficulty(data),
    hardcore: readHardcore(data) || undefined,
    cheats: nbtBoolean(data.allowCommands) || undefined,
    versionName: versionName || undefined,
    dataVersion: Number.isFinite(dataVersion) ? dataVersion : undefined,
    lastPlayed:
      Number.isFinite(lastPlayed) && lastPlayed > 0 ? lastPlayed : undefined,
    worldAgeTicks:
      Number.isFinite(worldAgeTicks) && worldAgeTicks > 0
        ? worldAgeTicks
        : undefined,
    spawn: readSpawn(data),
    enabledDatapacks: readStringList(data.DataPacks?.Enabled),
    disabledDatapacks: readStringList(data.DataPacks?.Disabled),
  };
}
