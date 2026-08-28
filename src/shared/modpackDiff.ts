export interface DiffProject {
  title: string;
  provider: string | number;
  id: string;
  projectType?: string | number;
  version: { id: string; files?: { filename: string }[] } | null;
}

export interface ModpackDiffEntry {
  key: string;
  title: string;
  projectType?: string | number;
  fromVersion?: string;
  toVersion?: string;
}

export interface ModpackDiff {
  added: ModpackDiffEntry[];
  removed: ModpackDiffEntry[];
  updated: ModpackDiffEntry[];
  unchanged: number;
}

export function projectKey(project: DiffProject): string {
  return `${project.provider}:${project.id}`;
}

function versionLabel(project: DiffProject): string {
  const fileName = project.version?.files?.[0]?.filename;
  return fileName || project.version?.id || "";
}

function toEntry(
  project: DiffProject,
  extra: Partial<ModpackDiffEntry> = {},
): ModpackDiffEntry {
  return {
    key: projectKey(project),
    title: project.title,
    projectType: project.projectType,
    ...extra,
  };
}

function byTitle(a: ModpackDiffEntry, b: ModpackDiffEntry): number {
  return a.title.localeCompare(b.title);
}

export function diffModpackProjects(
  current: DiffProject[],
  next: DiffProject[],
): ModpackDiff {
  const currentByKey = new Map(current.map((item) => [projectKey(item), item]));
  const nextByKey = new Map(next.map((item) => [projectKey(item), item]));

  const added: ModpackDiffEntry[] = [];
  const updated: ModpackDiffEntry[] = [];
  let unchanged = 0;

  for (const [key, project] of nextByKey) {
    const existing = currentByKey.get(key);

    if (!existing) {
      added.push(toEntry(project, { toVersion: versionLabel(project) }));
      continue;
    }

    const from = versionLabel(existing);
    const to = versionLabel(project);

    if (from === to) {
      unchanged += 1;
      continue;
    }

    updated.push(toEntry(project, { fromVersion: from, toVersion: to }));
  }

  const removed: ModpackDiffEntry[] = [];
  for (const [key, project] of currentByKey) {
    if (nextByKey.has(key)) continue;
    removed.push(toEntry(project, { fromVersion: versionLabel(project) }));
  }

  return {
    added: added.sort(byTitle),
    removed: removed.sort(byTitle),
    updated: updated.sort(byTitle),
    unchanged,
  };
}

export function isEmptyDiff(diff: ModpackDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.updated.length === 0
  );
}

export function diffTotals(diff: ModpackDiff): number {
  return diff.added.length + diff.removed.length + diff.updated.length;
}
