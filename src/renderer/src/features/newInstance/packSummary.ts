import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";

export const PACK_CONTENT_ORDER: ProjectType[] = [
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
  ProjectType.WORLD,
  ProjectType.PLUGIN,
  ProjectType.MODPACK,
];

export interface PackContentGroup {
  type: ProjectType;
  count: number;
}

export interface PackContentSummary {
  total: number;
  groups: PackContentGroup[];
  bytes: number;
  localCount: number;
  providers: { curseforge: number; modrinth: number; other: number };
}

export function summarizePackContent(
  mods: ILocalProject[],
): PackContentSummary {
  const counts = new Map<ProjectType, number>();
  const providers = { curseforge: 0, modrinth: 0, other: 0 };
  let bytes = 0;
  let localCount = 0;

  for (const mod of mods) {
    counts.set(mod.projectType, (counts.get(mod.projectType) ?? 0) + 1);

    if (mod.provider === Provider.CURSEFORGE) providers.curseforge += 1;
    else if (mod.provider === Provider.MODRINTH) providers.modrinth += 1;
    else providers.other += 1;

    if (mod.provider === Provider.LOCAL) localCount += 1;

    for (const file of mod.version?.files ?? []) {
      if (typeof file.size === "number" && file.size > 0) bytes += file.size;
    }
  }

  const groups = PACK_CONTENT_ORDER.filter((type) => counts.has(type)).map(
    (type) => ({ type, count: counts.get(type) ?? 0 }),
  );

  for (const [type, count] of counts) {
    if (PACK_CONTENT_ORDER.includes(type)) continue;
    groups.push({ type, count });
  }

  return {
    total: mods.length,
    groups,
    bytes,
    localCount,
    providers,
  };
}

export function hasLocalContent(mods: ILocalProject[]): boolean {
  return mods.some((mod) => mod.provider === Provider.LOCAL);
}
