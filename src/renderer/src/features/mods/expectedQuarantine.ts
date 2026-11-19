import type { ILocalProject } from "@/types/ModManager";

const DISABLED_SUFFIX = ".disabled";

const expected = new Map<string, Map<string, number>>();

function normalize(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith(DISABLED_SUFFIX)
    ? lower.slice(0, -DISABLED_SUFFIX.length)
    : lower;
}

export function fileNamesOf(items: readonly ILocalProject[]): string[] {
  return items.flatMap((item) =>
    (item.version?.files ?? [])
      .map((file) => file.filename)
      .filter((name): name is string => Boolean(name)),
  );
}

export function expectQuarantine(
  versionName: string,
  names: readonly string[],
): () => void {
  if (names.length === 0) return () => undefined;

  const bucket = expected.get(versionName) ?? new Map<string, number>();
  expected.set(versionName, bucket);
  const keys = names.map(normalize);
  for (const key of keys) bucket.set(key, (bucket.get(key) ?? 0) + 1);

  return () => {
    for (const key of keys) {
      const left = (bucket.get(key) ?? 0) - 1;
      if (left > 0) bucket.set(key, left);
      else bucket.delete(key);
    }
    if (bucket.size === 0) expected.delete(versionName);
  };
}

export function unexpectedQuarantine(
  versionName: string | undefined,
  entries: readonly string[],
): string[] {
  const bucket = versionName ? expected.get(versionName) : undefined;
  if (!bucket) return [...entries];
  return entries.filter((entry) => !bucket.has(normalize(entry)));
}
