export interface InstanceGroup {
  id: string;
  name: string;
  keys: string[];
  collapsed?: boolean;
}

export interface InstancesFile {
  version: 1;
  tags: Record<string, string[]>;
  order: string[];
  groups: InstanceGroup[];
  ungroupedCollapsed?: boolean;
}

export const EMPTY_INSTANCES_FILE: InstancesFile = {
  version: 1,
  tags: {},
  order: [],
  groups: [],
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value) {
    if (typeof item !== "string" || !item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
}

function normalizeTags(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const result: Record<string, string[]> = {};
  for (const [key, tags] of Object.entries(value as Record<string, unknown>)) {
    const list = stringList(tags);
    if (key && list.length) result[key] = list;
  }

  return result;
}

function normalizeGroups(value: unknown): InstanceGroup[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const groups: InstanceGroup[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!id || !name || seenIds.has(id)) continue;

    seenIds.add(id);
    groups.push({
      id,
      name,
      keys: stringList(raw.keys),
      ...(raw.collapsed === true ? { collapsed: true } : {}),
    });
  }

  return groups;
}

export function normalizeInstancesFile(raw: unknown): InstancesFile {
  if (!raw || typeof raw !== "object") return EMPTY_INSTANCES_FILE;

  const source = raw as Record<string, unknown>;

  return {
    version: 1,
    tags: normalizeTags(source.tags),
    order: stringList(source.order),
    groups: normalizeGroups(source.groups),
    ...(source.ungroupedCollapsed === true ? { ungroupedCollapsed: true } : {}),
  };
}

export function mergeLegacyOrganize(
  file: InstancesFile,
  legacy: { tags?: Record<string, string[]>; order?: string[] },
): InstancesFile {
  const hasTags = Object.keys(file.tags).length > 0;
  const hasOrder = file.order.length > 0;

  return {
    ...file,
    tags: hasTags ? file.tags : normalizeTags(legacy.tags),
    order: hasOrder ? file.order : stringList(legacy.order),
  };
}

export function renameInstanceKey(
  file: InstancesFile,
  oldKey: string,
  newKey: string,
): InstancesFile {
  if (!oldKey || !newKey || oldKey === newKey) return file;

  const tags = { ...file.tags };
  if (oldKey in tags) {
    tags[newKey] = tags[oldKey];
    delete tags[oldKey];
  }

  return {
    ...file,
    tags,
    order: file.order.map((key) => (key === oldKey ? newKey : key)),
    groups: file.groups.map((group) => ({
      ...group,
      keys: group.keys.map((key) => (key === oldKey ? newKey : key)),
    })),
  };
}

export function forgetInstanceKey(
  file: InstancesFile,
  key: string,
): InstancesFile {
  if (!key) return file;

  const tags = { ...file.tags };
  delete tags[key];

  return {
    ...file,
    tags,
    order: file.order.filter((item) => item !== key),
    groups: file.groups.map((group) => ({
      ...group,
      keys: group.keys.filter((item) => item !== key),
    })),
  };
}

export function createGroup(
  file: InstancesFile,
  id: string,
  name: string,
): InstancesFile {
  const trimmed = name.trim();
  if (!id || !trimmed || file.groups.some((group) => group.id === id)) {
    return file;
  }

  return {
    ...file,
    groups: [...file.groups, { id, name: trimmed, keys: [] }],
  };
}

export function renameGroup(
  file: InstancesFile,
  id: string,
  name: string,
): InstancesFile {
  const trimmed = name.trim();
  if (!trimmed) return file;

  return {
    ...file,
    groups: file.groups.map((group) =>
      group.id === id ? { ...group, name: trimmed } : group,
    ),
  };
}

export function removeGroup(file: InstancesFile, id: string): InstancesFile {
  return {
    ...file,
    groups: file.groups.filter((group) => group.id !== id),
  };
}

export function toggleGroup(file: InstancesFile, id: string): InstancesFile {
  return {
    ...file,
    groups: file.groups.map((group) =>
      group.id === id ? { ...group, collapsed: !group.collapsed } : group,
    ),
  };
}

export function toggleUngrouped(file: InstancesFile): InstancesFile {
  if (file.ungroupedCollapsed === true) {
    const next = { ...file };
    delete next.ungroupedCollapsed;
    return next;
  }

  return { ...file, ungroupedCollapsed: true };
}

export function assignToGroup(
  file: InstancesFile,
  key: string,
  groupId: string | null,
  position?: number,
): InstancesFile {
  if (!key) return file;

  const groups = file.groups.map((group) => ({
    ...group,
    keys: group.keys.filter((item) => item !== key),
  }));

  if (!groupId) return { ...file, groups };

  const target = groups.find((group) => group.id === groupId);
  if (!target) return { ...file, groups };

  const index =
    position === undefined
      ? target.keys.length
      : Math.max(0, Math.min(position, target.keys.length));

  target.keys = [
    ...target.keys.slice(0, index),
    key,
    ...target.keys.slice(index),
  ];

  return { ...file, groups };
}

export function reorderGroups(
  file: InstancesFile,
  from: number,
  to: number,
): InstancesFile {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= file.groups.length ||
    to >= file.groups.length
  ) {
    return file;
  }

  const groups = [...file.groups];
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);

  return { ...file, groups };
}
