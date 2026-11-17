import type { IJarMod } from "@/types/IVersion";
import type { Loader } from "@/types/Loader";
import type { ILocalProject } from "@/types/ModManager";
import { hasShaderLoader } from "@/shared/shaderLoaders";

export type ShaderSupport =
  | { state: "ready" }
  | { state: "missing"; slug: "iris" | "oculus"; title: string }
  | { state: "unsupported" };

const SUGGESTED: Partial<Record<Loader, { slug: "iris" | "oculus"; title: string }>> = {
  fabric: { slug: "iris", title: "Iris" },
  quilt: { slug: "iris", title: "Iris" },
  neoforge: { slug: "iris", title: "Iris" },
  forge: { slug: "oculus", title: "Oculus" },
};

export function shaderSupport(input: {
  loader: Loader | undefined;
  mods: ILocalProject[];
  jarMods?: IJarMod[];
  disabled?: ReadonlySet<string>;
}): ShaderSupport {
  if (hasShaderLoader(input)) return { state: "ready" };

  const suggested = input.loader ? SUGGESTED[input.loader] : undefined;
  return suggested ? { state: "missing", ...suggested } : { state: "unsupported" };
}
