import {
  FOREIGN_LAUNCHERS,
  IMPORT_PARTS,
  type ForeignInstanceSummary,
  type ForeignLauncher,
  type ImportPart,
} from "@/types/LauncherImport";

export const LAUNCHER_NAMES: Record<Exclude<ForeignLauncher, "official">, string> = {
  prism: "Prism Launcher",
  multimc: "MultiMC",
  atlauncher: "ATLauncher",
  gdlauncher: "GDLauncher",
  curseforge: "CurseForge",
  modrinth: "Modrinth App",
  tlauncher: "TLauncher",
  legacy: "Legacy Launcher",
};

export interface LauncherGroup {
  launcher: ForeignLauncher;
  instances: ForeignInstanceSummary[];
}

export function groupByLauncher(instances: ForeignInstanceSummary[]): LauncherGroup[] {
  return FOREIGN_LAUNCHERS.map((launcher) => ({
    launcher,
    instances: instances.filter((instance) => instance.launcher === launcher),
  })).filter((group) => group.instances.length > 0);
}

export function defaultSelection(
  instances: ForeignInstanceSummary[],
  imported: ReadonlySet<string>,
): Set<string> {
  return new Set(
    instances.filter((instance) => !imported.has(instance.id)).map((instance) => instance.id),
  );
}

export function toggleGroup(
  selected: ReadonlySet<string>,
  group: LauncherGroup,
  value: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const instance of group.instances) {
    if (value) next.add(instance.id);
    else next.delete(instance.id);
  }
  return next;
}

export function groupState(
  selected: ReadonlySet<string>,
  group: LauncherGroup,
): boolean | "indeterminate" {
  const count = group.instances.filter((instance) => selected.has(instance.id)).length;
  if (count === 0) return false;
  return count === group.instances.length ? true : "indeterminate";
}

export function launcherSummary(groups: LauncherGroup[]): { launcher: ForeignLauncher; count: number }[] {
  return groups.map((group) => ({ launcher: group.launcher, count: group.instances.length }));
}

export const DEFAULT_PARTS: ImportPart[] = [...IMPORT_PARTS];

export function orderedParts(parts: ReadonlySet<ImportPart>): ImportPart[] {
  return IMPORT_PARTS.filter((part) => parts.has(part));
}
