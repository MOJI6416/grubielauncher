import {
  isScreenshotFile,
  screenshotLabel,
} from "@renderer/features/instances/instanceOverview";

export interface FeedInstance {
  key: string;
  name: string;
  folder: string;
}

export interface FeedShot {
  path: string;
  name: string;
  folder: string;
  instanceKey: string;
  instanceName: string;
  takenAt: number | null;
}

export type FeedSort = "newest" | "oldest" | "instance";

export const FEED_SORTS: FeedSort[] = ["newest", "oldest", "instance"];

const SHOT_TIME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})[.:-](\d{2})[.:-](\d{2})/;

export function shotTime(name: string): number | null {
  const match = name.match(SHOT_TIME);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const value = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isNaN(value) ? null : value;
}

export function buildFeed(
  sources: { instance: FeedInstance; names: string[] }[],
  join: (folder: string, name: string) => string,
): FeedShot[] {
  return sources.flatMap(({ instance, names }) =>
    names.filter(isScreenshotFile).map((name) => ({
      path: join(instance.folder, name),
      name,
      folder: instance.folder,
      instanceKey: instance.key,
      instanceName: instance.name,
      takenAt: shotTime(name),
    })),
  );
}

function newestFirst(a: FeedShot, b: FeedShot): number {
  const byTime = (b.takenAt ?? 0) - (a.takenAt ?? 0);
  if (byTime !== 0) return byTime;
  return b.name.localeCompare(a.name, "en", { numeric: true });
}

export function sortFeed(shots: FeedShot[], sort: FeedSort): FeedShot[] {
  const list = [...shots];

  if (sort === "oldest") return list.sort((a, b) => newestFirst(b, a));
  if (sort === "instance") {
    return list.sort(
      (a, b) =>
        a.instanceName.localeCompare(b.instanceName, undefined, {
          sensitivity: "base",
          numeric: true,
        }) || newestFirst(a, b),
    );
  }
  return list.sort(newestFirst);
}

export function filterFeed(
  shots: FeedShot[],
  { query, instanceKey }: { query: string; instanceKey: string },
): FeedShot[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return shots.filter((shot) => {
    if (instanceKey && shot.instanceKey !== instanceKey) return false;
    if (words.length === 0) return true;

    const haystack =
      `${shot.instanceName} ${shot.name} ${screenshotLabel(shot.name)}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function feedInstances(
  shots: FeedShot[],
): { key: string; name: string; count: number }[] {
  const counts = new Map<string, { key: string; name: string; count: number }>();
  for (const shot of shots) {
    const entry = counts.get(shot.instanceKey);
    if (entry) entry.count += 1;
    else
      counts.set(shot.instanceKey, {
        key: shot.instanceKey,
        name: shot.instanceName,
        count: 1,
      });
  }
  return [...counts.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
