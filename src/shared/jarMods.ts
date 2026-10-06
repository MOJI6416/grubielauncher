import type { IJarMod, IJarModSet } from "@/types/IVersion";

export const JAR_MOD_EXTENSIONS = ["jar", "zip"];

interface JarModHolder {
  jarMods?: IJarMod[];
  mainJar?: IJarMod;
}

export function countJarMods(conf: JarModHolder | null | undefined): number {
  return (conf?.jarMods?.length ?? 0) + (conf?.mainJar ? 1 : 0);
}

export function jarModSetOf(conf: JarModHolder | null | undefined): IJarModSet {
  return { mods: conf?.jarMods ?? [], main: conf?.mainJar ?? null };
}

export function applyJarModSet(conf: JarModHolder, jar: IJarModSet): void {
  if (jar.mods.length > 0) conf.jarMods = jar.mods;
  else delete conf.jarMods;
  if (jar.main) conf.mainJar = jar.main;
  else delete conf.mainJar;
}

export function jarModsSignature(
  conf: JarModHolder | null | undefined,
): string {
  const describe = (mod: IJarMod) => `${mod.file}:${mod.enabled ? 1 : 0}`;
  return JSON.stringify({
    mods: (conf?.jarMods ?? []).map(describe),
    main: conf?.mainJar ? describe(conf.mainJar) : null,
  });
}
