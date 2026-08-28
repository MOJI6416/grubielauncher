import { InstanceLike, activityTime, instanceKey } from "./selectors";

export type LibrarySort = "activity" | "playtime" | "name" | "manual";

export type LibraryFacet = "loader" | "tag" | "state";

export type LibraryFilters = Record<LibraryFacet, string[]>;

export interface LibraryGroup {
  id: string;
  name: string;
  keys: string[];
  collapsed?: boolean;
}

export interface LibraryInput {
  query?: string;
  filters?: LibraryFilters;
  tags?: Record<string, string[]>;
  updates?: Record<string, string>;
  playtime?: Record<string, number>;
  lastLaunch?: Record<string, number>;
  runningKeys?: string[];
  sort?: LibrarySort;
  manualOrder?: string[];
}

export type LibraryEntry<T> =
  | { kind: "item"; key: string; instance: T }
  | {
      kind: "header";
      key: string;
      id: string | null;
      name: string;
      count: number;
      collapsed: boolean;
    };

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  loader: [],
  tag: [],
  state: [],
};

export const LIBRARY_SORTS: LibrarySort[] = [
  "activity",
  "playtime",
  "name",
  "manual",
];

export function countFilters(filters: LibraryFilters): number {
  return filters.loader.length + filters.tag.length + filters.state.length;
}

export function availableFacets(input: {
  loaders?: string[];
  tags?: string[];
  hasUpdates?: boolean;
}): LibraryFilters {
  const loaders = input.loaders ?? [];

  return {
    loader: loaders.length > 1 ? loaders : [],
    tag: input.tags ?? [],
    state: input.hasUpdates ? ["behind"] : [],
  };
}

export function toggleFilter(
  filters: LibraryFilters,
  facet: LibraryFacet,
  value: string,
): LibraryFilters {
  const current = filters[facet];
  const next = current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];

  return { ...filters, [facet]: next };
}

export function listFilters(
  filters: LibraryFilters,
): Array<{ facet: LibraryFacet; value: string }> {
  return (["loader", "tag", "state"] as LibraryFacet[]).flatMap((facet) =>
    filters[facet].map((value) => ({ facet, value })),
  );
}

export function matchesQuery(
  instance: InstanceLike,
  tags: string[],
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    instance.version.name,
    instance.version.loader.name,
    instance.version.version?.id ?? "",
    ...tags,
  ]
    .join(" ")
    .toLowerCase();

  return needle
    .split(/\s+/)
    .every((token) => !token || haystack.includes(token));
}

export function filterLibrary<T extends InstanceLike>(
  instances: T[],
  input: LibraryInput = {},
): T[] {
  const filters = input.filters ?? EMPTY_LIBRARY_FILTERS;
  const tagMap = input.tags ?? {};
  const updates = input.updates ?? {};
  const query = input.query ?? "";

  return instances.filter((instance) => {
    const key = instanceKey(instance);
    const tags = tagMap[key] ?? [];

    if (!matchesQuery(instance, tags, query)) return false;

    if (
      filters.loader.length &&
      !filters.loader.includes(instance.version.loader.name)
    ) {
      return false;
    }

    if (filters.tag.length) {
      const owned = new Set(tags.map((tag) => tag.toLowerCase()));
      if (!filters.tag.some((tag) => owned.has(tag.toLowerCase()))) {
        return false;
      }
    }

    if (filters.state.length && !filters.state.includes(updates[key] ?? "")) {
      return false;
    }

    return true;
  });
}

export function sortLibrary<T extends InstanceLike>(
  instances: T[],
  input: LibraryInput = {},
): T[] {
  const sort = input.sort ?? "activity";
  const list = [...instances];
  const byName = (a: T, b: T) =>
    a.version.name.localeCompare(b.version.name, undefined, {
      numeric: true,
      sensitivity: "base",
    });

  if (sort === "manual") {
    const order = input.manualOrder ?? [];
    const positionOf = (instance: T) => {
      const index = order.indexOf(instanceKey(instance));
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    return list.sort((a, b) => positionOf(a) - positionOf(b) || byName(a, b));
  }

  const running = new Set(input.runningKeys ?? []);
  const playtime = input.playtime ?? {};
  const lastLaunch = input.lastLaunch ?? {};
  const activityOf = (instance: T) =>
    Math.max(activityTime(instance), lastLaunch[instanceKey(instance)] ?? 0);

  return list.sort((a, b) => {
    const aRunning = running.has(instanceKey(a));
    const bRunning = running.has(instanceKey(b));
    if (aRunning !== bRunning) return aRunning ? -1 : 1;

    if (sort === "name") return byName(a, b);

    if (sort === "playtime") {
      const delta =
        (playtime[instanceKey(b)] ?? 0) - (playtime[instanceKey(a)] ?? 0);
      if (delta !== 0) return delta;
      return byName(a, b);
    }

    const delta = activityOf(b) - activityOf(a);
    return delta !== 0 ? delta : byName(a, b);
  });
}

export function selectLibrary<T extends InstanceLike>(
  instances: T[] | undefined | null,
  input: LibraryInput = {},
): T[] {
  return sortLibrary(filterLibrary(instances ?? [], input), input);
}

export function buildLibraryEntries<T extends InstanceLike>(
  instances: T[],
  groups: LibraryGroup[],
  options: {
    ungroupedName: string;
    ungroupedCollapsed?: boolean;
    hideEmptyGroups?: boolean;
    expandGroups?: boolean;
  },
): LibraryEntry<T>[] {
  if (!groups.length) {
    return instances.map((instance) => ({
      kind: "item",
      key: instanceKey(instance),
      instance,
    }));
  }

  const entries: LibraryEntry<T>[] = [];
  const grouped = new Set<string>();
  const expandAll = options.expandGroups === true;

  for (const group of groups) {
    const members = instances.filter((instance) =>
      group.keys.includes(instanceKey(instance)),
    );
    members.forEach((instance) => grouped.add(instanceKey(instance)));

    if (options.hideEmptyGroups && members.length === 0) continue;

    entries.push({
      kind: "header",
      key: `group:${group.id}`,
      id: group.id,
      name: group.name,
      count: members.length,
      collapsed: !expandAll && group.collapsed === true,
    });

    if (!expandAll && group.collapsed) continue;

    entries.push(
      ...members.map((instance) => ({
        kind: "item" as const,
        key: instanceKey(instance),
        instance,
      })),
    );
  }

  const rest = instances.filter(
    (instance) => !grouped.has(instanceKey(instance)),
  );

  if (options.hideEmptyGroups && rest.length === 0) return entries;

  entries.push({
    kind: "header",
    key: "group:none",
    id: null,
    name: options.ungroupedName,
    count: rest.length,
    collapsed: !expandAll && options.ungroupedCollapsed === true,
  });

  if (expandAll || !options.ungroupedCollapsed) {
    entries.push(
      ...rest.map((instance) => ({
        kind: "item" as const,
        key: instanceKey(instance),
        instance,
      })),
    );
  }

  return entries;
}

export function mergeManualOrder(
  fullOrder: string[],
  visibleKeys: string[],
  movedVisible: string[],
): string[] {
  const visible = new Set(visibleKeys);
  const queue = [...movedVisible];
  const result: string[] = [];

  for (const key of fullOrder) {
    if (!visible.has(key)) {
      result.push(key);
      continue;
    }

    const next = queue.shift();
    if (next !== undefined) result.push(next);
  }

  return [...result, ...queue];
}

export function moveFocus(
  keys: string[],
  current: string | null,
  delta: number,
): string | null {
  if (!keys.length) return null;

  const index = current ? keys.indexOf(current) : -1;
  if (index === -1) return delta > 0 ? keys[0] : keys[keys.length - 1];

  const next = Math.min(Math.max(index + delta, 0), keys.length - 1);
  return keys[next];
}
