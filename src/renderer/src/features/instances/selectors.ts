export interface InstanceLike {
  versionPath?: string;
  version: {
    name: string;
    loader: { name: string };
    version?: { id?: string };
    lastLaunch?: unknown;
    lastUpdate?: unknown;
  };
}

export function instanceKey(instance: InstanceLike): string {
  return instance.versionPath || instance.version.name;
}

export function timeValue(value: unknown): number {
  const time = new Date(
    (value as string | number | Date | undefined) || 0,
  ).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function activityTime(instance: InstanceLike): number {
  return Math.max(
    timeValue(instance.version.lastLaunch),
    timeValue(instance.version.lastUpdate),
  );
}

export function reorderKeys(
  keys: string[],
  fromKey: string,
  toKey: string,
): string[] | null {
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);

  if (from === -1 || to === -1 || from === to) return null;

  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);

  return next;
}

export function availableLoaders(instances: InstanceLike[]): string[] {
  return Array.from(
    new Set(instances.map((instance) => instance.version.loader.name)),
  ).sort();
}

export function nextGroupId(existingIds: string[]): string {
  const used = new Set(existingIds);

  let index = existingIds.length + 1;
  while (used.has(`g_${index}`)) index += 1;

  return `g_${index}`;
}

export function allTags(
  tags: Record<string, string[]>,
  keys?: string[],
): string[] {
  const lists = keys
    ? keys.map((key) => tags[key] ?? [])
    : Object.values(tags);

  const seen = new Map<string, string>();
  for (const tag of lists.flat()) {
    const id = tag.toLowerCase();
    if (!seen.has(id)) seen.set(id, tag);
  }

  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}
