export const TRASH_MAX_AGE_DAYS = 14;
export const TRASH_MAX_AGE_MS = TRASH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

const ENTRY_PATTERN = /^(\d{13})-[0-9a-f]{8}-(.+)$/;
const DISABLED_SUFFIX = /\.disabled$/i;
const RESTORABLE = /\.(jar|zip)$/i;

export interface TrashEntry {
  raw: string;
  name: string;
  deletedAt: number | null;
}

export function parseTrashEntry(raw: string): TrashEntry | null {
  if (!raw) return null;

  const match = ENTRY_PATTERN.exec(raw);
  const name = (match ? match[2] : raw).replace(DISABLED_SUFFIX, "");
  if (!RESTORABLE.test(name)) return null;

  const deletedAt = match ? Number(match[1]) : NaN;

  return {
    raw,
    name,
    deletedAt: Number.isFinite(deletedAt) ? deletedAt : null,
  };
}

export function isTrashEntryExpired(
  entry: TrashEntry,
  now: number = Date.now(),
): boolean {
  if (entry.deletedAt === null) return false;
  return now - entry.deletedAt > TRASH_MAX_AGE_MS;
}

export function sortTrashEntries(entries: TrashEntry[]): TrashEntry[] {
  return [...entries].sort(
    (a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0) || a.name.localeCompare(b.name),
  );
}

export async function listTrash(versionPath: string): Promise<TrashEntry[]> {
  try {
    const api = window.api;
    const folderPath = await api.path.join(versionPath, "storage", "trash");
    const names = await api.fs.readdir(folderPath);

    const entries: TrashEntry[] = [];
    for (const raw of names) {
      const entry = parseTrashEntry(raw);
      if (entry && !isTrashEntryExpired(entry)) entries.push(entry);
    }

    return sortTrashEntries(entries);
  } catch {
    return [];
  }
}

export async function trashPaths(
  versionPath: string,
  entries: TrashEntry[],
): Promise<{ path: string; name: string }[]> {
  const api = window.api;
  const folderPath = await api.path.join(versionPath, "storage", "trash");

  return Promise.all(
    entries.map(async (entry) => ({
      path: await api.path.join(folderPath, entry.raw),
      name: entry.name,
    })),
  );
}
