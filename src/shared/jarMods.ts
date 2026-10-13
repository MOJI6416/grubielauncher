import type { IJarMod, IJarModSet, ILaunchOverride } from "@/types/IVersion";

export const JAR_MOD_EXTENSIONS = ["jar", "zip"];

interface JarModHolder {
  jarMods?: IJarMod[];
  mainJar?: IJarMod;
  launchOverride?: ILaunchOverride;
}

export function countJarMods(conf: JarModHolder | null | undefined): number {
  return (conf?.jarMods?.length ?? 0) + (conf?.mainJar ? 1 : 0);
}

export function jarModSetOf(conf: JarModHolder | null | undefined): IJarModSet {
  return {
    mods: conf?.jarMods ?? [],
    main: conf?.mainJar ?? null,
    launch: conf?.launchOverride ?? null,
  };
}

export function applyJarModSet(conf: JarModHolder, jar: IJarModSet): void {
  if (jar.mods.length > 0) conf.jarMods = jar.mods;
  else delete conf.jarMods;
  if (jar.main) conf.mainJar = jar.main;
  else delete conf.mainJar;
  if (jar.launch) conf.launchOverride = jar.launch;
  else delete conf.launchOverride;
}

export function jarModsSignature(
  conf: JarModHolder | null | undefined,
): string {
  const describe = (mod: IJarMod) => `${mod.file}:${mod.enabled ? 1 : 0}`;
  const launch = conf?.launchOverride;
  return JSON.stringify({
    mods: (conf?.jarMods ?? []).map(describe),
    main: conf?.mainJar ? describe(conf.mainJar) : null,
    ...(launch
      ? { launch: `${launch.mainClass} ${launch.minecraftArguments}` }
      : {}),
  });
}
