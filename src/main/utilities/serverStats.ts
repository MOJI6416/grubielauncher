import path from "path";
import fs from "fs-extra";
import type { IWorldStatistics } from "@/types/World";
import {
  isTrackedServerAddress,
  normalizeServerAddress,
} from "@/shared/companion";

const MAX_SNAPSHOT_FILES = 500;
const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

export interface ServerStatsSnapshot {
  server: string;
  uuid: string;
  name: string;
  time: number;
  data: IWorldStatistics;
}

function normalizeUuid(value: string): string {
  return value.replace(/-/g, "").toLowerCase();
}

export function parseServerSnapshot(value: unknown): ServerStatsSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.format !== 1 || typeof record.server !== "string") return null;

  const player = record.player as Record<string, unknown> | undefined;
  if (!player || typeof player.uuid !== "string") return null;

  const time = typeof record.time === "string" ? Date.parse(record.time) : NaN;
  if (Number.isNaN(time)) return null;

  const raw = record.stats;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const stats: Record<string, Record<string, number>> = {};
  for (const [type, values] of Object.entries(raw as Record<string, unknown>)) {
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    const category: Record<string, number> = {};
    for (const [key, amount] of Object.entries(values as Record<string, unknown>)) {
      if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
        category[key] = amount;
      }
    }
    stats[type] = category;
  }

  return {
    server: normalizeServerAddress(record.server),
    uuid: normalizeUuid(player.uuid),
    name: typeof player.name === "string" ? player.name : "",
    time,
    data: { stats },
  };
}

export function pickServerSnapshots(
  snapshots: ServerStatsSnapshot[],
  accountUuids: string[],
): ServerStatsSnapshot[] {
  const mine = new Set(accountUuids.map(normalizeUuid));
  const latest = new Map<string, ServerStatsSnapshot>();
  for (const snapshot of snapshots) {
    if (!mine.has(snapshot.uuid) || !isTrackedServerAddress(snapshot.server)) continue;
    const key = `${snapshot.server}|${snapshot.uuid}`;
    const previous = latest.get(key);
    if (!previous || snapshot.time > previous.time) latest.set(key, snapshot);
  }
  return [...latest.values()];
}

export async function loadServerSnapshots(
  directory: string,
  accountUuids: string[],
): Promise<{ snapshots: ServerStatsSnapshot[]; partial: boolean }> {
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return { snapshots: [], partial: code !== "ENOENT" };
  }

  let partial = false;
  const parsed: ServerStatsSnapshot[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).slice(0, MAX_SNAPSHOT_FILES)) {
    const file = path.join(directory, name);
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile() || stat.size > MAX_SNAPSHOT_BYTES) continue;
      const snapshot = parseServerSnapshot(await fs.readJson(file));
      if (snapshot) parsed.push(snapshot);
    } catch {
      partial = true;
    }
  }

  return { snapshots: pickServerSnapshots(parsed, accountUuids), partial };
}
