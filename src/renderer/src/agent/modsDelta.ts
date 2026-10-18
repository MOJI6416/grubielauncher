import { ILocalProject } from "@/types/ModManager";

export function projectKey(mod: Pick<ILocalProject, "provider" | "id">): string {
  return `${mod.provider}:${mod.id}`;
}

export function applyModsDelta(
  mods: ILocalProject[],
  put: ILocalProject[],
  drop: string[],
): ILocalProject[] {
  const dropped = new Set(drop);
  const replacements = new Map(put.map((mod) => [projectKey(mod), mod]));

  const next = mods
    .filter((mod) => !dropped.has(projectKey(mod)))
    .map((mod) => replacements.get(projectKey(mod)) ?? mod);

  const present = new Set(next.map(projectKey));
  for (const mod of put) {
    if (!present.has(projectKey(mod))) next.push(mod);
  }

  return next;
}
