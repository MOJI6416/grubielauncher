import {
  ProjectType,
  type ILocalProject,
  type LocalModDependencyIndex,
} from "@/types/ModManager";
import { buildDependencyGraph, modGraphKey } from "@renderer/utilities/mod";
import { localTitle } from "@renderer/features/mods/entries";

export interface BisectCandidate {
  file: string;
  label: string;
  iconUrl: string | null;
  entryKey: string | null;
}

function baseName(file: string): string {
  return file.replace(/\.disabled$/i, "");
}

function filesOf(mod: ILocalProject): string[] {
  return (mod.version?.files ?? [])
    .map((file) => baseName(String(file.filename ?? "")))
    .filter(Boolean);
}

export function bisectCandidates(
  listing: Iterable<string>,
  mods: readonly ILocalProject[],
): BisectCandidate[] {
  const owners = new Map<string, ILocalProject>();
  for (const mod of mods) {
    if (mod.projectType !== ProjectType.MOD) continue;
    for (const file of filesOf(mod))
      if (!owners.has(file.toLowerCase())) owners.set(file.toLowerCase(), mod);
  }
  const candidates: BisectCandidate[] = [];
  for (const file of new Set(listing)) {
    if (!/\.jar$/i.test(file)) continue;
    const owner = owners.get(file.toLowerCase());
    candidates.push({
      file,
      label: owner ? localTitle(owner) || file : file.replace(/\.jar$/i, ""),
      iconUrl: owner?.iconUrl ?? null,
      entryKey: owner ? `${owner.provider}:${owner.id}` : null,
    });
  }
  const repeated = new Map<string, number>();
  for (const item of candidates)
    repeated.set(item.label, (repeated.get(item.label) ?? 0) + 1);
  for (const item of candidates)
    if ((repeated.get(item.label) ?? 0) > 1) item.label = `${item.label} (${item.file})`;
  return candidates.sort(
    (a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) ||
      a.file.localeCompare(b.file),
  );
}

export function fileDependencies(
  files: readonly string[],
  mods: readonly ILocalProject[],
  index: LocalModDependencyIndex | undefined,
): Record<string, string[]> {
  const byLower = new Map(files.map((file) => [file.toLowerCase(), file]));
  const ordered = [...files].sort((a, b) => a.localeCompare(b));
  const own = new Map<string, string[]>();
  const any = new Map<string, string[]>();
  const push = (map: Map<string, string[]>, id: string, file: string) => {
    const list = map.get(id) ?? [];
    list.push(file);
    map.set(id, list);
  };
  for (const file of ordered) {
    const info = index?.[file.toLowerCase()];
    if (!info) continue;
    const embedded = new Set(info.embedded ?? []);
    for (const id of info.provides) {
      push(any, id, file);
      if (!embedded.has(id)) push(own, id, file);
    }
  }

  const edges = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    if (from === to) return;
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };

  for (const file of ordered) {
    const info = index?.[file.toLowerCase()];
    if (!info) continue;
    for (const id of info.requires) {
      const providers = own.get(id) ?? any.get(id) ?? [];
      if (providers.includes(file)) continue;
      if (providers[0]) link(file, providers[0]);
    }
  }

  const modList = mods.filter((mod) => mod.projectType === ProjectType.MOD);
  const graph = buildDependencyGraph(modList, index);
  for (const mod of modList) {
    const from = filesOf(mod)
      .map((file) => byLower.get(file.toLowerCase()))
      .filter((file): file is string => !!file);
    if (from.length === 0) continue;
    for (const key of graph.catalogDependencies.get(modGraphKey(mod)) ?? []) {
      const dependency = graph.byKey.get(key);
      const target = dependency
        ? filesOf(dependency)
            .map((file) => byLower.get(file.toLowerCase()))
            .find((file): file is string => !!file)
        : undefined;
      if (!target) continue;
      for (const file of from) link(file, target);
    }
  }

  const result: Record<string, string[]> = {};
  for (const [file, set] of edges)
    result[file] = [...set].sort((a, b) => a.localeCompare(b));
  return result;
}
