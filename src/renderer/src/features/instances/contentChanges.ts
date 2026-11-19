import type { ILocalProject } from "@/types/ModManager";
import { ProjectType } from "@/types/ModManager";
import { entryKey } from "@renderer/features/mods/entries";

export interface ContentDiff {
  added: ILocalProject[];
  removed: ILocalProject[];
  changed: { before: ILocalProject; after: ILocalProject }[];
}

const TRASH_ENTRY = /^(\d{13})-[0-9a-f]{8}-(.+)$/;
const DISABLED_SUFFIX = ".disabled";
const RESTORABLE_TYPES = new Set<ProjectType>([
  ProjectType.MOD,
  ProjectType.RESOURCEPACK,
  ProjectType.SHADER,
  ProjectType.DATAPACK,
]);

function contentKey(mod: Pick<ILocalProject, "provider" | "id">): string {
  return entryKey(mod.provider, mod.id);
}

export function sameContentItem(left: ILocalProject, right: ILocalProject) {
  return left === right || JSON.stringify(left) === JSON.stringify(right);
}

export function diffContent(
  before: readonly ILocalProject[],
  after: readonly ILocalProject[],
): ContentDiff {
  const previous = new Map(before.map((mod) => [contentKey(mod), mod]));
  const next = new Map(after.map((mod) => [contentKey(mod), mod]));

  const changed: ContentDiff["changed"] = [];
  for (const mod of after) {
    const old = previous.get(contentKey(mod));
    if (old && !sameContentItem(old, mod))
      changed.push({ before: old, after: mod });
  }

  return {
    added: after.filter((mod) => !previous.has(contentKey(mod))),
    removed: before.filter((mod) => !next.has(contentKey(mod))),
    changed,
  };
}

export function isEmptyDiff(diff: ContentDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}

export function invertContent(
  before: readonly ILocalProject[],
  after: readonly ILocalProject[],
  current: readonly ILocalProject[],
): ILocalProject[] {
  const diff = diffContent(before, after);
  const added = new Set(diff.added.map(contentKey));
  const changed = new Map(
    diff.changed.map((change) => [contentKey(change.after), change]),
  );

  const next = current
    .filter((mod) => !added.has(contentKey(mod)))
    .map((mod) => {
      const change = changed.get(contentKey(mod));
      return change && sameContentItem(mod, change.after) ? change.before : mod;
    });

  const present = new Set(next.map(contentKey));
  for (const mod of diff.removed) {
    if (present.has(contentKey(mod))) continue;
    const index = before.indexOf(mod);
    next.splice(Math.min(Math.max(index, 0), next.length), 0, mod);
    present.add(contentKey(mod));
  }

  return next;
}

export function restoredItems(
  before: readonly ILocalProject[],
  after: readonly ILocalProject[],
): ILocalProject[] {
  const diff = diffContent(before, after);
  return [...diff.added, ...diff.changed.map((change) => change.after)];
}

export interface TrashRestoreStep {
  raw: string;
  projectType: ProjectType;
  target: string;
}

export function planTrashRestore(input: {
  items: readonly ILocalProject[];
  present: ReadonlyMap<ProjectType, ReadonlySet<string>>;
  trash: readonly string[];
  since: number;
}): TrashRestoreStep[] {
  const newest = new Map<string, { raw: string; at: number; target: string }>();

  for (const raw of input.trash) {
    const match = TRASH_ENTRY.exec(raw);
    if (!match) continue;
    const at = Number(match[1]);
    if (!Number.isFinite(at) || at < input.since) continue;

    const target = match[2];
    const name = target.toLowerCase().endsWith(DISABLED_SUFFIX)
      ? target.slice(0, -DISABLED_SUFFIX.length)
      : target;
    const key = name.toLowerCase();
    const known = newest.get(key);
    if (!known || known.at < at) newest.set(key, { raw, at, target });
  }

  const steps: TrashRestoreStep[] = [];
  const taken = new Set<string>();

  for (const mod of input.items) {
    if (!RESTORABLE_TYPES.has(mod.projectType)) continue;
    const present = input.present.get(mod.projectType) ?? new Set<string>();

    for (const file of mod.version?.files ?? []) {
      if (!file.filename || file.isClient === false) continue;
      const key = file.filename.toLowerCase();
      if (
        present.has(key) ||
        present.has(`${key}${DISABLED_SUFFIX}`) ||
        taken.has(key)
      )
        continue;

      const entry = newest.get(key);
      if (!entry) continue;

      taken.add(key);
      steps.push({
        raw: entry.raw,
        projectType: mod.projectType,
        target: entry.target,
      });
    }
  }

  return steps;
}
