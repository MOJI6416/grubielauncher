import os from "os";
import path from "path";
import fs from "fs-extra";
import { randomUUID } from "crypto";
import {
  type ForeignInstance,
  isDirectory,
  loaderFromName,
  positiveMegabytes,
  stripMinecraftVersion,
  timestampOf,
} from "../common";

interface ModrinthRow {
  path: string;
  name: string;
  iconPath: string | null;
  gameVersion: string;
  loader: string;
  loaderVersion: string | null;
  lastPlayed: number | null;
  memoryMb: number | null;
  launchArgs: string | null;
}

interface SqliteStatement {
  all(...params: unknown[]): unknown[];
}

interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

const INSTANCES_QUERY = `
SELECT
  i.path AS path,
  i.name AS name,
  i.icon_path AS iconPath,
  c.game_version AS gameVersion,
  c.loader AS loader,
  c.loader_version AS loaderVersion,
  i.last_played AS lastPlayed,
  json_extract(json(o.overrides), '$.memory.maximum') AS memoryMb,
  json_extract(json(o.overrides), '$.extra_launch_args') AS launchArgs
FROM instances i
JOIN instance_content_sets c ON c.id = i.applied_content_set_id
LEFT JOIN instance_launch_overrides o ON o.instance_id = i.id`;

const PROFILES_QUERY = `
SELECT
  path,
  name,
  icon_path AS iconPath,
  game_version AS gameVersion,
  mod_loader AS loader,
  mod_loader_version AS loaderVersion,
  last_played AS lastPlayed,
  override_mc_memory_max AS memoryMb,
  json(override_extra_launch_args) AS launchArgs
FROM profiles`;

const GLOBAL_QUERY = `
SELECT
  mc_memory_max AS memoryMb,
  json(extra_launch_args) AS launchArgs
FROM settings
LIMIT 1`;

async function openDatabase(file: string): Promise<{ db: SqliteDatabase; cleanup: () => Promise<void> } | null> {
  const { DatabaseSync } = await import("node:sqlite");
  let direct: SqliteDatabase | null = null;
  try {
    direct = new DatabaseSync(file, { readOnly: true }) as unknown as SqliteDatabase;
    direct.prepare("SELECT count(*) FROM sqlite_master").all();
    return { db: direct, cleanup: async () => undefined };
  } catch {
    try {
      direct?.close();
    } catch {}
    const copyDir = path.join(os.tmpdir(), `grubie-modrinth-${randomUUID()}`);
    try {
      await fs.ensureDir(copyDir);
      for (const suffix of ["", "-wal"]) {
        const source = `${file}${suffix}`;
        if (await fs.pathExists(source)) {
          await fs.copyFile(source, path.join(copyDir, `app.db${suffix}`));
        }
      }
      const db = new DatabaseSync(path.join(copyDir, "app.db")) as unknown as SqliteDatabase;
      return {
        db,
        cleanup: async () => {
          await fs.remove(copyDir).catch(() => undefined);
        },
      };
    } catch {
      await fs.remove(copyDir).catch(() => undefined);
      return null;
    }
  }
}

function tableNames(db: SqliteDatabase): Set<string> {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function stringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json) as unknown;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function safeQuery<T>(db: SqliteDatabase, sql: string): T[] {
  try {
    return db.prepare(sql).all() as T[];
  } catch {
    return [];
  }
}

export async function readModrinthRows(
  file: string,
): Promise<{ rows: ModrinthRow[]; global: { memoryMb?: number; launchArgs: string[] } } | null> {
  const opened = await openDatabase(file);
  if (!opened) return null;
  const { db, cleanup } = opened;

  try {
    const tables = tableNames(db);
    const rows = tables.has("instances")
      ? safeQuery<ModrinthRow>(db, INSTANCES_QUERY)
      : tables.has("profiles")
        ? safeQuery<ModrinthRow>(db, PROFILES_QUERY)
        : [];
    const settings = tables.has("settings")
      ? safeQuery<{ memoryMb: number | null; launchArgs: string | null }>(db, GLOBAL_QUERY)[0]
      : undefined;

    return {
      rows,
      global: {
        memoryMb: positiveMegabytes(settings?.memoryMb),
        launchArgs: stringArray(settings?.launchArgs),
      },
    };
  } catch {
    return null;
  } finally {
    db.close();
    await cleanup();
  }
}

export async function scanModrinthRoot(root: string): Promise<ForeignInstance[]> {
  const data = await readModrinthRows(path.join(root, "app.db"));
  if (!data) return [];

  const result: ForeignInstance[] = [];
  for (const row of data.rows) {
    if (!row.path || /[\\/]/.test(row.path) || row.path.startsWith(".")) continue;
    const instanceDir = path.join(root, "profiles", row.path);
    if (!(await isDirectory(instanceDir))) continue;

    const loader = loaderFromName(row.loader) ?? "vanilla";
    const launchArgs = stringArray(row.launchArgs);

    result.push({
      launcher: "modrinth",
      root,
      name: row.name?.trim() || row.path,
      minecraftVersion: row.gameVersion,
      loader,
      loaderVersion:
        loader === "vanilla"
          ? undefined
          : stripMinecraftVersion(row.loaderVersion ?? undefined, row.gameVersion),
      gameDir: instanceDir,
      instanceDir,
      iconPath: row.iconPath && path.isAbsolute(row.iconPath) ? row.iconPath : undefined,
      memoryMb: positiveMegabytes(row.memoryMb) ?? data.global.memoryMb,
      jvmArgs: launchArgs.length > 0 ? launchArgs : data.global.launchArgs,
      lastPlayed: timestampOf(row.lastPlayed),
      sharedGameDir: false,
      skipEntries: ["profile.json"],
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}
