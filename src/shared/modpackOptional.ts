import type { ILocalProject } from "@/types/ModManager";
import { modpackProjectKey } from "./modpackMerge";

export type ModpackSideSupport = "required" | "optional" | "unsupported";

export function isOptionalOnClient(
  env: { client?: ModpackSideSupport | string } | undefined,
): boolean {
  return env?.client === "optional";
}

export function isProjectEnabled(project: ILocalProject): boolean {
  const files = project.version?.files ?? [];
  return files.length === 0 || files.some((file) => file.disabled !== true);
}

export function withProjectEnabled(
  project: ILocalProject,
  enabled: boolean,
): ILocalProject {
  if (!project.version) return project;

  return {
    ...project,
    version: {
      ...project.version,
      files: project.version.files.map((file) => {
        const { disabled: _disabled, ...rest } = file;
        return enabled ? rest : { ...rest, disabled: true };
      }),
    },
  };
}

export function setOptionalEnabled(
  mods: ILocalProject[],
  optional: readonly string[],
  keys: readonly string[],
  enabled: boolean,
): ILocalProject[] {
  const allowed = new Set(optional);
  const targets = new Set(keys.filter((key) => allowed.has(key)));
  if (targets.size === 0) return mods;

  return mods.map((mod) =>
    targets.has(modpackProjectKey(mod)) ? withProjectEnabled(mod, enabled) : mod,
  );
}

export function optionalSummary(
  mods: ILocalProject[],
  optional: readonly string[] | undefined,
): { total: number; enabled: number } {
  const keys = new Set(optional ?? []);
  let total = 0;
  let enabled = 0;

  for (const mod of mods) {
    if (!keys.has(modpackProjectKey(mod))) continue;
    total += 1;
    if (isProjectEnabled(mod)) enabled += 1;
  }

  return { total, enabled };
}
