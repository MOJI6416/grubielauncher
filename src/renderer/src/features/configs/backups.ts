export const BACKUPS_FOLDER = "config-backups";
export const BACKUPS_INDEX = "index.json";
export const MAX_SNAPSHOTS = 8;

export type ConfigSnapshotKind = "baseline" | "snapshot";

export interface ConfigSnapshot {
  id: string;
  time: number;
  size: number;
  kind: ConfigSnapshotKind;
}

export interface ConfigBackupIndex {
  version: 1;
  files: Record<string, ConfigSnapshot[]>;
}

export interface BackupStorage {
  join: (...parts: string[]) => string;
  ensure: (directory: string) => Promise<boolean>;
  readFile: (filePath: string, encoding: "utf-8") => Promise<string>;
  writeFile: (
    filePath: string,
    data: string,
    encoding?: "utf-8",
  ) => Promise<boolean>;
  pathExists: (target: string) => Promise<boolean>;
  rimraf: (target: string) => Promise<boolean>;
}

export function emptyBackupIndex(): ConfigBackupIndex {
  return { version: 1, files: {} };
}

export function backupSlug(relative: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < relative.length; index += 1) {
    hash ^= relative.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const readable = relative
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-40)
    .toLowerCase();

  return `${readable || "config"}-${hash.toString(36)}`;
}

export function snapshotFileName(slug: string, snapshot: ConfigSnapshot) {
  return `${slug}.${snapshot.id}.bak`;
}

export function parseBackupIndex(raw: unknown): ConfigBackupIndex {
  const index = emptyBackupIndex();
  if (!raw || typeof raw !== "object") return index;

  const files = (raw as { files?: unknown }).files;
  if (!files || typeof files !== "object") return index;

  for (const [relative, value] of Object.entries(
    files as Record<string, unknown>,
  )) {
    if (!Array.isArray(value)) continue;

    const snapshots = value.filter(
      (entry): entry is ConfigSnapshot =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as ConfigSnapshot).id === "string" &&
        typeof (entry as ConfigSnapshot).time === "number" &&
        typeof (entry as ConfigSnapshot).size === "number" &&
        ((entry as ConfigSnapshot).kind === "baseline" ||
          (entry as ConfigSnapshot).kind === "snapshot"),
    );

    if (snapshots.length) index.files[relative] = snapshots;
  }

  return index;
}

export function sortSnapshots(snapshots: ConfigSnapshot[]): ConfigSnapshot[] {
  return [...snapshots].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "baseline" ? 1 : -1;
    return b.time - a.time;
  });
}

export function pruneSnapshots(
  snapshots: ConfigSnapshot[],
  max = MAX_SNAPSHOTS,
): { keep: ConfigSnapshot[]; drop: ConfigSnapshot[] } {
  const baseline = snapshots.filter((entry) => entry.kind === "baseline");
  const rest = sortSnapshots(
    snapshots.filter((entry) => entry.kind === "snapshot"),
  );

  return {
    keep: [...rest.slice(0, max), ...baseline.slice(0, 1)],
    drop: [...rest.slice(max), ...baseline.slice(1)],
  };
}

export function nextSnapshot(
  existing: ConfigSnapshot[],
  time: number,
  size: number,
): ConfigSnapshot {
  const kind: ConfigSnapshotKind = existing.some(
    (entry) => entry.kind === "baseline",
  )
    ? "snapshot"
    : "baseline";

  let id = String(time);
  let suffix = 1;
  while (existing.some((entry) => entry.id === id)) {
    id = `${time}-${suffix}`;
    suffix += 1;
  }

  return { id, time, size, kind };
}

export function backupsRoot(
  storage: BackupStorage,
  versionPath: string,
): string {
  return storage.join(versionPath, "storage", BACKUPS_FOLDER);
}

export async function loadBackupIndex(
  storage: BackupStorage,
  root: string,
): Promise<ConfigBackupIndex> {
  try {
    const file = storage.join(root, BACKUPS_INDEX);
    if (!(await storage.pathExists(file))) return emptyBackupIndex();
    return parseBackupIndex(JSON.parse(await storage.readFile(file, "utf-8")));
  } catch {
    return emptyBackupIndex();
  }
}

async function saveBackupIndex(
  storage: BackupStorage,
  root: string,
  index: ConfigBackupIndex,
): Promise<void> {
  await storage.ensure(root);

  const written = await storage.writeFile(
    storage.join(root, BACKUPS_INDEX),
    JSON.stringify(index),
    "utf-8",
  );

  if (!written) throw new Error("config backup index was not written");
}

export async function captureSnapshot(
  storage: BackupStorage,
  root: string,
  index: ConfigBackupIndex,
  relative: string,
  content: string,
  time = Date.now(),
): Promise<ConfigBackupIndex> {
  const existing = index.files[relative] ?? [];
  const slug = backupSlug(relative);
  const snapshot = nextSnapshot(existing, time, content.length);
  const { keep, drop } = pruneSnapshots([snapshot, ...existing]);

  await storage.ensure(root);

  const written = await storage.writeFile(
    storage.join(root, snapshotFileName(slug, snapshot)),
    content,
    "utf-8",
  );

  if (!written) throw new Error("config snapshot was not written");

  for (const stale of drop) {
    await storage.rimraf(storage.join(root, snapshotFileName(slug, stale)));
  }

  const next: ConfigBackupIndex = {
    version: 1,
    files: { ...index.files, [relative]: keep },
  };

  await saveBackupIndex(storage, root, next);
  return next;
}

export async function readSnapshot(
  storage: BackupStorage,
  root: string,
  relative: string,
  snapshot: ConfigSnapshot,
): Promise<string | null> {
  try {
    const file = storage.join(
      root,
      snapshotFileName(backupSlug(relative), snapshot),
    );
    if (!(await storage.pathExists(file))) return null;

    const text = await storage.readFile(file, "utf-8");

    return text.length === 0 && snapshot.size > 0 ? null : text;
  } catch {
    return null;
  }
}
