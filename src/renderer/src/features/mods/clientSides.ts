import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";

function isModrinthMod(mod: ILocalProject): boolean {
  return (
    mod.provider === Provider.MODRINTH &&
    mod.projectType === ProjectType.MOD &&
    Boolean(mod.id)
  );
}

export function clientSideSuspects(mods: ILocalProject[]): string[] {
  const ids = new Set<string>();

  for (const mod of mods) {
    if (!isModrinthMod(mod)) continue;
    if (mod.version?.files.some((file) => file.isClient === false)) {
      ids.add(mod.id);
    }
  }

  return [...ids];
}

export function applyClientSides(
  mods: ILocalProject[],
  sides: Readonly<Record<string, boolean>>,
): number {
  let repaired = 0;

  for (const mod of mods) {
    if (!isModrinthMod(mod) || sides[mod.id] !== true) continue;

    let changed = false;
    for (const file of mod.version?.files ?? []) {
      if (file.isClient !== false) continue;
      file.isClient = true;
      changed = true;
    }

    if (changed) repaired += 1;
  }

  return repaired;
}

export async function repairClientSides(
  mods: ILocalProject[],
): Promise<number> {
  const ids = clientSideSuspects(mods);
  if (ids.length === 0) return 0;

  const sides = await window.api.modManager.modrinthClientSides(ids).catch(() => null);

  return sides ? applyClientSides(mods, sides) : 0;
}
