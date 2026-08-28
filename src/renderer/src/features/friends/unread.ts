export type UnreadCounts = Record<string, number>;

export function bumpUnread(counts: UnreadCounts, id: string): UnreadCounts {
  if (!id) return counts;
  return { ...counts, [id]: (counts[id] || 0) + 1 };
}

export function clearUnread(counts: UnreadCounts, id: string): UnreadCounts {
  if (!id || !counts[id]) return counts;
  const next = { ...counts };
  delete next[id];
  return next;
}

export function keepLocalUnread(
  counts: UnreadCounts,
  local: UnreadCounts,
  ids: Iterable<string>,
): UnreadCounts {
  const next = { ...counts };
  let changed = false;

  for (const id of ids) {
    const value = local[id] || 0;
    if (value === next[id] || (!value && !(id in next))) continue;

    changed = true;
    if (value > 0) next[id] = value;
    else delete next[id];
  }

  return changed ? next : counts;
}

export function dropUnknownFriends(
  counts: UnreadCounts,
  knownIds: Iterable<string>,
): UnreadCounts {
  const known = new Set(knownIds);
  const next: UnreadCounts = {};
  let changed = false;

  for (const [id, value] of Object.entries(counts)) {
    if (known.has(id)) next[id] = value;
    else changed = true;
  }

  return changed ? next : counts;
}

export function totalUnread(counts: UnreadCounts): number {
  let total = 0;
  for (const value of Object.values(counts)) total += value;
  return total;
}

const STORAGE_PREFIX = "friends.unread";

function storageKey(accountKey: string) {
  return `${STORAGE_PREFIX}.${accountKey}`;
}

export function loadUnread(accountKey: string): UnreadCounts {
  if (!accountKey) return {};

  try {
    const raw = localStorage.getItem(storageKey(accountKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return {};

    const counts: UnreadCounts = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === "number" && value > 0) counts[id] = value;
    }
    return counts;
  } catch {
    return {};
  }
}

export function saveUnread(accountKey: string, counts: UnreadCounts) {
  if (!accountKey) return;

  try {
    localStorage.setItem(storageKey(accountKey), JSON.stringify(counts));
  } catch {
    return;
  }
}
