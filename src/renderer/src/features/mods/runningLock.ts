import { ILocalProject, ProjectType } from "@/types/ModManager";

const EDITABLE_WHILE_RUNNING: readonly ProjectType[] = [
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
];

const VIEWABLE_WHILE_RUNNING: readonly ProjectType[] = [
  ProjectType.MOD,
  ...EDITABLE_WHILE_RUNNING,
];

export function isLockedWhileRunning(type: ProjectType): boolean {
  return !EDITABLE_WHILE_RUNNING.includes(type);
}

export function typesWhileRunning(
  types: ProjectType[],
  isLibrary: boolean,
): ProjectType[] {
  const allowed = isLibrary ? VIEWABLE_WHILE_RUNNING : EDITABLE_WHILE_RUNNING;
  return types.filter((type) => allowed.includes(type));
}

function lockedFiles(mods: ILocalProject[]): Map<string, string> {
  const result = new Map<string, string>();

  for (const mod of mods) {
    if (!isLockedWhileRunning(mod.projectType)) continue;
    const files = (mod.version?.files ?? [])
      .map((file) => `${file.filename}|${file.disabled === true}`)
      .sort();
    result.set(
      `${mod.projectType}:${mod.provider}:${mod.id}`,
      `${mod.version?.id ?? ""}#${files.join("/")}`,
    );
  }

  return result;
}

export function touchesLockedContent(
  before: ILocalProject[],
  after: ILocalProject[],
): boolean {
  const previous = lockedFiles(before);
  const next = lockedFiles(after);
  if (previous.size !== next.size) return true;

  for (const [key, files] of previous) {
    if (next.get(key) !== files) return true;
  }

  return false;
}
