import type { IVersionManifest } from "@/types/IVersionManifest";

type Library = IVersionManifest["libraries"][number];

function splitName(name: string) {
  const [group = "", artifact = "", version = "", classifier = ""] = name
    .split("@")[0]
    .split(":");
  return { key: `${group}:${artifact}:${classifier}`, version };
}

export function mergeLoaderLibraries(
  loader: Library[],
  base: Library[],
): Library[] {
  const baseByKey = new Map(base.map((lib) => [splitName(lib.name).key, lib]));
  const added = loader.filter((lib) => {
    if (lib.natives) return false;
    const { key, version } = splitName(lib.name);
    const existing = baseByKey.get(key);
    if (!existing) return true;
    return !existing.natives && splitName(existing.name).version !== version;
  });
  const replaced = new Set(added.map((lib) => splitName(lib.name).key));
  return [
    ...added,
    ...base.filter((lib) => !replaced.has(splitName(lib.name).key)),
  ];
}
