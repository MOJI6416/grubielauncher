import { IWorld, WorldGameMode } from "@/types/World";

export type WorldSort = "recent" | "name" | "size" | "playtime";

export type WorldFilter = "all" | "hardcore" | WorldGameMode;

export const WORLD_SORTS: WorldSort[] = ["recent", "name", "size", "playtime"];

export interface WorldListItem {
  world: IWorld;
  sizeBytes: number | null;
  playTimeTicks: number;
  backups: number;
}

export interface WorldListInput {
  worlds: IWorld[];
  sizes: Record<string, number>;
  backups: Record<string, number>;
  playTime: Record<string, number>;
}

export function toWorldItems({
  worlds,
  sizes,
  backups,
  playTime,
}: WorldListInput): WorldListItem[] {
  return worlds.map((world) => ({
    world,
    sizeBytes:
      typeof sizes[world.folderName] === "number"
        ? sizes[world.folderName]
        : null,
    playTimeTicks: playTime[world.folderName] ?? 0,
    backups: backups[world.folderName] ?? 0,
  }));
}

export function matchesWorldQuery(world: IWorld, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    world.name.toLowerCase().includes(needle) ||
    world.folderName.toLowerCase().includes(needle) ||
    world.seed.toLowerCase().includes(needle) ||
    (world.versionName ?? "").toLowerCase().includes(needle)
  );
}

export function matchesWorldFilter(world: IWorld, filter: WorldFilter): boolean {
  if (filter === "all") return true;
  if (filter === "hardcore") return world.hardcore === true;

  return world.gameMode === filter;
}

export function countWorldFilters(
  worlds: IWorld[],
): Record<WorldFilter, number> {
  const counts: Record<WorldFilter, number> = {
    all: worlds.length,
    hardcore: 0,
    survival: 0,
    creative: 0,
    adventure: 0,
    spectator: 0,
  };

  for (const world of worlds) {
    if (world.hardcore) counts.hardcore += 1;
    if (world.gameMode) counts[world.gameMode] += 1;
  }

  return counts;
}

export function availableWorldFilters(worlds: IWorld[]): WorldFilter[] {
  const counts = countWorldFilters(worlds);

  return (
    ["all", "hardcore", "survival", "creative", "adventure", "spectator"] as const
  ).filter((filter) => filter === "all" || counts[filter] > 0);
}

function compareByName(a: WorldListItem, b: WorldListItem): number {
  return a.world.name.localeCompare(b.world.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

export function sortWorldItems(
  items: WorldListItem[],
  sort: WorldSort,
): WorldListItem[] {
  const sorted = [...items];

  sorted.sort((a, b) => {
    if (sort === "name") return compareByName(a, b);

    if (sort === "size") {
      const delta = (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1);
      return delta || compareByName(a, b);
    }

    if (sort === "playtime") {
      const delta = b.playTimeTicks - a.playTimeTicks;
      return delta || compareByName(a, b);
    }

    const delta = (b.world.lastPlayed ?? 0) - (a.world.lastPlayed ?? 0);
    return delta || compareByName(a, b);
  });

  return sorted;
}

export function buildWorldList(
  input: WorldListInput & { query: string; filter: WorldFilter; sort: WorldSort },
): WorldListItem[] {
  const items = toWorldItems(input).filter(
    (item) =>
      matchesWorldQuery(item.world, input.query) &&
      matchesWorldFilter(item.world, input.filter),
  );

  return sortWorldItems(items, input.sort);
}

export function pickSelectedFolder(
  items: WorldListItem[],
  current: string | null,
): string | null {
  if (current && items.some((item) => item.world.folderName === current)) {
    return current;
  }

  return items[0]?.world.folderName ?? null;
}

export function duplicateWorldNames(worlds: IWorld[]): Set<string> {
  const counts = new Map<string, number>();

  for (const world of worlds) {
    counts.set(world.name, (counts.get(world.name) ?? 0) + 1);
  }

  const duplicates = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) duplicates.add(name);
  }

  return duplicates;
}
