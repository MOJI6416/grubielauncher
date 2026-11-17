import type { IJarMod } from "../types/IVersion";
import { ProjectType, type ILocalProject } from "../types/ModManager";

export const SHADER_LOADER_NAME =
  /(?:^|[^a-z])(iris|oculus|optifine|optifabric|angelica)(?:[^a-z]|$)/i;
const SHADER_LOADER_IDS = new Set(["YL57xq9U", "GchcoXML", "455508", "581495"]);

export function isProjectEnabled(
  project: ILocalProject,
  disabled?: ReadonlySet<string>,
): boolean {
  const files = project.version?.files ?? [];
  if (files.length > 0 && files.every((file) => file.disabled)) return false;
  return !disabled?.has(`${project.provider}:${project.id}`);
}

export function loadsShaders(project: ILocalProject): boolean {
  if (SHADER_LOADER_IDS.has(project.id)) return true;
  if (SHADER_LOADER_NAME.test(project.title)) return true;
  return (project.version?.files ?? []).some((file) =>
    SHADER_LOADER_NAME.test(file.filename),
  );
}

export function hasShaderLoader(input: {
  mods: readonly ILocalProject[];
  jarMods?: readonly IJarMod[];
  disabled?: ReadonlySet<string>;
}): boolean {
  const hasLoaderMod = input.mods.some(
    (project) =>
      project.projectType === ProjectType.MOD &&
      isProjectEnabled(project, input.disabled) &&
      loadsShaders(project),
  );
  if (hasLoaderMod) return true;

  return (input.jarMods ?? []).some(
    (mod) => mod.enabled && SHADER_LOADER_NAME.test(`${mod.name} ${mod.file}`),
  );
}
