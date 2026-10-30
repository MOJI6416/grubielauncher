import { ContentEntry } from "./entries";

export interface ModGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

export interface ModGroupsFile {
  version: 1;
  groups: ModGroup[];
  members: Record<string, string>;
}

export const UNGROUPED_ID = "";

const NAME_LIMIT = 48;

export const EMPTY_GROUPS: ModGroupsFile = { version: 1, groups: [], members: {} };

export type DisplayItem =
  | {
      kind: "header";
      groupId: string;
      name: string;
      count: number;
      collapsed: boolean;
      entries: ContentEntry[];
    }
  | { kind: "row"; entry: ContentEntry; rowIndex: number };

export function normalizeGroupName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, NAME_LIMIT);
}

export function parseGroupsFile(raw: unknown): ModGroupsFile {
  const data = raw as Partial<ModGroupsFile> | null;
  if (!data || typeof data !== "object") return EMPTY_GROUPS;

  const groups: ModGroup[] = [];
  const ids = new Set<string>();
  for (const group of Array.isArray(data.groups) ? data.groups : []) {
    if (!group || typeof group.id !== "string" || !group.id) continue;
    if (typeof group.name !== "string" || ids.has(group.id)) continue;
    ids.add(group.id);
    groups.push({
      id: group.id,
      name: normalizeGroupName(group.name) || group.id,
      ...(group.collapsed === true ? { collapsed: true } : {}),
    });
  }

  const members: Record<string, string> = {};
  if (data.members && typeof data.members === "object") {
    for (const [key, groupId] of Object.entries(data.members)) {
      if (typeof groupId === "string" && ids.has(groupId)) members[key] = groupId;
    }
  }

  return { version: 1, groups, members };
}

export function addGroup(
  file: ModGroupsFile,
  name: string,
  id: string,
): ModGroupsFile {
  return { ...file, groups: [...file.groups, { id, name: normalizeGroupName(name) }] };
}

export function renameGroup(
  file: ModGroupsFile,
  id: string,
  name: string,
): ModGroupsFile {
  return {
    ...file,
    groups: file.groups.map((group) =>
      group.id === id ? { ...group, name: normalizeGroupName(name) } : group,
    ),
  };
}

export function removeGroup(file: ModGroupsFile, id: string): ModGroupsFile {
  return {
    ...file,
    groups: file.groups.filter((group) => group.id !== id),
    members: Object.fromEntries(
      Object.entries(file.members).filter(([, groupId]) => groupId !== id),
    ),
  };
}

export function toggleGroupCollapsed(
  file: ModGroupsFile,
  id: string,
): ModGroupsFile {
  return {
    ...file,
    groups: file.groups.map((group) =>
      group.id === id
        ? group.collapsed
          ? { id: group.id, name: group.name }
          : { ...group, collapsed: true }
        : group,
    ),
  };
}

export function assignToGroup(
  file: ModGroupsFile,
  keys: string[],
  groupId: string,
): ModGroupsFile {
  const members = { ...file.members };
  for (const key of keys) {
    if (groupId === UNGROUPED_ID) delete members[key];
    else members[key] = groupId;
  }
  return { ...file, members };
}

export function groupOf(file: ModGroupsFile, key: string): string {
  const groupId = file.members[key];
  return groupId && file.groups.some((group) => group.id === groupId)
    ? groupId
    : UNGROUPED_ID;
}

export function groupRows(
  entries: ContentEntry[],
  file: ModGroupsFile,
  expandAll: boolean,
): { rows: ContentEntry[]; items: DisplayItem[] } {
  if (file.groups.length === 0) {
    return {
      rows: entries,
      items: entries.map((entry, rowIndex) => ({ kind: "row", entry, rowIndex })),
    };
  }

  const buckets = new Map<string, ContentEntry[]>(
    [...file.groups.map((group) => group.id), UNGROUPED_ID].map((id) => [id, []]),
  );
  for (const entry of entries) buckets.get(groupOf(file, entry.key))!.push(entry);

  const rows: ContentEntry[] = [];
  const items: DisplayItem[] = [];
  const sections = [
    ...file.groups,
    { id: UNGROUPED_ID, name: "", collapsed: undefined },
  ];

  for (const group of sections) {
    const members = buckets.get(group.id) ?? [];
    if (members.length === 0) continue;

    const collapsed = !expandAll && group.collapsed === true;
    items.push({
      kind: "header",
      groupId: group.id,
      name: group.name,
      count: members.length,
      collapsed,
      entries: members,
    });
    if (collapsed) continue;

    for (const entry of members) {
      items.push({ kind: "row", entry, rowIndex: rows.length });
      rows.push(entry);
    }
  }

  return { rows, items };
}
