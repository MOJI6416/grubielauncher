import type { IJarMod } from "@/types/IVersion";
import type { Loader } from "@/types/Loader";
import { ProjectType, type ILocalProject } from "@/types/ModManager";

export type ShaderSupport =
  | { state: "ready" }
  | { state: "missing"; slug: "iris" | "oculus"; title: string }
  | { state: "unsupported" };

const SHADER_LOADER_NAME = /(?:^|[^a-z])(iris|oculus|optifine|optifabric|angelica)(?:[^a-z]|$)/i;
const SHADER_LOADER_IDS = new Set(["YL57xq9U", "GchcoXML", "455508", "581495"]);

const SUGGESTED: Partial<Record<Loader, { slug: "iris" | "oculus"; title: string }>> = {
  fabric: { slug: "iris", title: "Iris" },
  quilt: { slug: "iris", title: "Iris" },
  neoforge: { slug: "iris", title: "Iris" },
  forge: { slug: "oculus", title: "Oculus" },
};

function isEnabled(project: ILocalProject, disabled: ReadonlySet<string> | undefined): boolean {
  const files = project.version?.files ?? [];
  if (files.length > 0 && files.every((file) => file.disabled)) return false;
  return !disabled?.has(`${project.provider}:${project.id}`);
}

function loadsShaders(project: ILocalProject): boolean {
  if (SHADER_LOADER_IDS.has(project.id)) return true;
  if (SHADER_LOADER_NAME.test(project.title)) return true;
  return (project.version?.files ?? []).some((file) => SHADER_LOADER_NAME.test(file.filename));
}

export function shaderSupport(input: {
  loader: Loader | undefined;
  mods: ILocalProject[];
  jarMods?: IJarMod[];
  disabled?: ReadonlySet<string>;
}): ShaderSupport {
  const hasLoaderMod = input.mods.some(
    (project) =>
      project.projectType === ProjectType.MOD && isEnabled(project, input.disabled) && loadsShaders(project),
  );
  const hasJarMod = (input.jarMods ?? []).some(
    (mod) => mod.enabled && SHADER_LOADER_NAME.test(`${mod.name} ${mod.file}`),
  );
  if (hasLoaderMod || hasJarMod) return { state: "ready" };

  const suggested = input.loader ? SUGGESTED[input.loader] : undefined;
  return suggested ? { state: "missing", ...suggested } : { state: "unsupported" };
}
