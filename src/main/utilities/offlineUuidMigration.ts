import path from "path";
import fs from "fs-extra";
import {
  generateCanonicalOfflineUUID,
  generateOfflineUUID,
  toUUID,
} from "./other";

const MIGRATION_MARKER_FILE = "offline-uuid-migration.json";
const SCAN_SKIP_DIRECTORIES = new Set([
  "region",
  "entities",
  "poi",
  "datapacks",
  "generated",
  "resources",
]);
const SCAN_MAX_DEPTH = 6;

export interface OfflineUuidMigrationMarker {
  version: 1;
  nicknames: Record<
    string,
    {
      uuid: string;
      worlds: Record<string, number>;
    }
  >;
}

export interface UuidFileCopy {
  from: string;
  to: string;
}

export function getOfflineUuidCandidates(nickname: string) {
  return {
    legacy: generateOfflineUUID(nickname),
    canonical: generateCanonicalOfflineUUID(nickname),
  };
}

export function planUuidFileCopies(
  fileNames: string[],
  oldUuid: string,
  newUuid: string,
): UuidFileCopy[] {
  const oldDashed = toUUID(oldUuid).toLowerCase();
  const newDashed = toUUID(newUuid).toLowerCase();
  const oldPlain = oldUuid.toLowerCase();
  const newPlain = newUuid.toLowerCase();

  const existing = new Set(fileNames.map((name) => name.toLowerCase()));
  const copies: UuidFileCopy[] = [];

  for (const name of fileNames) {
    const lower = name.toLowerCase();

    let target: string | null = null;
    if (lower === oldDashed || lower.startsWith(`${oldDashed}.`)) {
      target = newDashed + name.slice(oldDashed.length);
    } else if (lower === oldPlain || lower.startsWith(`${oldPlain}.`)) {
      target = newPlain + name.slice(oldPlain.length);
    }

    if (!target) continue;
    if (existing.has(target.toLowerCase())) continue;

    copies.push({ from: name, to: target });
  }

  return copies;
}

async function scanWorldForUuidCopies(
  worldPath: string,
  oldUuid: string,
  newUuid: string,
): Promise<UuidFileCopy[]> {
  const copies: UuidFileCopy[] = [];

  async function walk(directory: string, depth: number) {
    if (depth > SCAN_MAX_DEPTH) return;

    const entries = await fs
      .readdir(directory, { withFileTypes: true })
      .catch(() => []);

    const fileNames: string[] = [];
    for (const entry of entries) {
      if (entry.isFile()) fileNames.push(entry.name);
    }

    for (const copy of planUuidFileCopies(fileNames, oldUuid, newUuid)) {
      copies.push({
        from: path.join(directory, copy.from),
        to: path.join(directory, copy.to),
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SCAN_SKIP_DIRECTORIES.has(entry.name.toLowerCase())) continue;

      await walk(path.join(directory, entry.name), depth + 1);
    }
  }

  await walk(worldPath, 0);
  return copies;
}

function getMarkerPath(versionPath: string) {
  return path.join(versionPath, "storage", MIGRATION_MARKER_FILE);
}

async function readMarker(
  versionPath: string,
): Promise<OfflineUuidMigrationMarker> {
  const fallback: OfflineUuidMigrationMarker = { version: 1, nicknames: {} };

  try {
    const marker = await fs.readJSON(getMarkerPath(versionPath));
    if (
      marker &&
      typeof marker === "object" &&
      marker.version === 1 &&
      marker.nicknames &&
      typeof marker.nicknames === "object"
    ) {
      return marker as OfflineUuidMigrationMarker;
    }
  } catch {}

  return fallback;
}

async function writeMarker(
  versionPath: string,
  marker: OfflineUuidMigrationMarker,
) {
  const markerPath = getMarkerPath(versionPath);
  await fs.ensureDir(path.dirname(markerPath));
  await fs.writeJSON(markerPath, marker, { spaces: 2 });
}

async function listWorldDirs(savesPath: string): Promise<string[]> {
  const entries = await fs
    .readdir(savesPath, { withFileTypes: true })
    .catch(() => []);

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function migrateWorld(
  savesPath: string,
  world: string,
  oldUuid: string,
  newUuid: string,
) {
  const copies = await scanWorldForUuidCopies(
    path.join(savesPath, world),
    oldUuid,
    newUuid,
  );

  for (const copy of copies) {
    await fs.copy(copy.from, copy.to, {
      overwrite: false,
      errorOnExist: false,
    });
  }
}

export async function resolveOfflineUuid(
  versionPath: string,
  nickname: string,
): Promise<string> {
  const { legacy, canonical } = getOfflineUuidCandidates(nickname);
  if (legacy === canonical) return canonical;
  if (!versionPath) return legacy;

  const savesPath = path.join(versionPath, "saves");
  const marker = await readMarker(versionPath);
  const entry = marker.nicknames[nickname];
  const worlds = await listWorldDirs(savesPath);

  if (entry) {
    let markerChanged = false;

    for (const world of worlds) {
      if (entry.worlds[world]) continue;

      try {
        await migrateWorld(savesPath, world, legacy, canonical);
        entry.worlds[world] = Date.now();
        markerChanged = true;
      } catch (error) {
        console.error(
          `[offline-uuid] failed to migrate world "${world}", will retry on next launch:`,
          error,
        );
      }
    }

    if (markerChanged) {
      await writeMarker(versionPath, marker).catch(() => {});
    }

    return canonical;
  }

  try {
    const migratedWorlds: Record<string, number> = {};

    for (const world of worlds) {
      await migrateWorld(savesPath, world, legacy, canonical);
      migratedWorlds[world] = Date.now();
    }

    marker.nicknames[nickname] = { uuid: canonical, worlds: migratedWorlds };
    await writeMarker(versionPath, marker);

    return canonical;
  } catch (error) {
    console.error(
      "[offline-uuid] migration failed, keeping legacy uuid:",
      error,
    );
    return legacy;
  }
}
