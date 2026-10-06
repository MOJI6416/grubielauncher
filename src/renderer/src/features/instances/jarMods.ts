import type { IJarMod, IVersionConf } from "@/types/IVersion";
import { mcVersionToJavaMajor } from "@/shared/javaVersions";

export function moveJarMod(
  list: IJarMod[],
  index: number,
  delta: -1 | 1,
): IJarMod[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length)
    return list;

  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setJarModEnabled(
  list: IJarMod[],
  file: string,
  enabled: boolean,
): IJarMod[] {
  return list.map((mod) => (mod.file === file ? { ...mod, enabled } : mod));
}

export function withoutJarMod(list: IJarMod[], file: string): IJarMod[] {
  return list.filter((mod) => mod.file !== file);
}

export function summarizeJarMods(conf: IVersionConf) {
  const mods = conf.jarMods ?? [];

  return {
    total: mods.length,
    active: mods.filter((mod) => mod.enabled).length,
    replacement: conf.mainJar?.enabled ? conf.mainJar : undefined,
  };
}

export function showsJarModsCard(conf: IVersionConf): boolean {
  if ((conf.jarMods?.length ?? 0) > 0 || conf.mainJar) return true;
  return mcVersionToJavaMajor(conf.version.id) <= 8;
}
