import type { TrashReason } from "@/types/ModManager";

export const TRASH_MAX_AGE_DAYS = 14;
export const TRASH_MAX_AGE_MS = TRASH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

const ENTRY_PATTERN = /^(\d{13})-[0-9a-f]{8}-(.+)$/;
const DISABLED_SUFFIX = /\.disabled$/i;
const RESTORABLE = /\.(jar|zip)$/i;
const REASONS_FILE = "reasons.json";
const REASONS = new Set<string>(["updated", "removed", "foreign"]);

export interface TrashEntry {
  raw: string;
  name: string;
  deletedAt: number | null;
  reason?: TrashReason;
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

export function withReasons(
  entries: TrashEntry[],
  reasons: unknown,
): TrashEntry[] {
  if (!reasons || typeof reasons !== "object") return entries;

  const known = reasons as Record<string, unknown>;
  return entries.map((entry) => {
    const reason = known[entry.raw];
    return typeof reason === "string" && REASONS.has(reason)
      ? { ...entry, reason: reason as TrashReason }
      : entry;
  });
}

export async function trashFolder(versionPath: string): Promise<string> {
  return await window.api.path.join(versionPath, "storage", "trash");
}

export async function listTrash(versionPath: string): Promise<TrashEntry[]> {
  try {
    const api = window.api;
    const folderPath = await trashFolder(versionPath);
    const names = await api.fs.readdir(folderPath);

    const parsed: TrashEntry[] = [];
    for (const raw of names) {
      const entry = parseTrashEntry(raw);
      if (entry && !isTrashEntryExpired(entry)) parsed.push(entry);
    }

    const entries = names.includes(REASONS_FILE)
      ? withReasons(
          parsed,
          await api.fs
            .readJSON(await api.path.join(folderPath, REASONS_FILE), "utf-8")
            .catch(() => null),
        )
      : parsed;

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
  const folderPath = await trashFolder(versionPath);

  return Promise.all(
    entries.map(async (entry) => ({
      path: await api.path.join(folderPath, entry.raw),
      name: entry.name,
    })),
  );
}
