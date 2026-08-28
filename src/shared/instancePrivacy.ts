export const PRIVATE_INSTANCE_PATHS = [
  "sessions.json",
  "statistics.json",
  "usercache.json",
  "usernamecache.json",
  "ops.json",
  "whitelist.json",
  "banned-players.json",
  "banned-ips.json",
  "notes.txt",
  "authlib-injector.log",
  "servers.dat",
  "servers.dat_old",
  "command_history.txt",
  "realms_persistence.json",
  "logs",
  "crash-reports",
  "screenshots",
  "storage/trash",
  "storage/config-backups",
  "storage/offline-uuid-migration.json",
] as const;

export const RUNTIME_INSTANCE_PATHS = [
  "natives",
  "temp",
  "downloads",
  ".fabric",
] as const;

export const EXCLUDED_INSTANCE_PATHS: readonly string[] = [
  ...PRIVATE_INSTANCE_PATHS,
  ...RUNTIME_INSTANCE_PATHS,
];

export const NESTED_INSTANCE_ROOTS: readonly string[] = ["server"];

export function normalizeInstancePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function matchesExcluded(normalized: string): boolean {
  return EXCLUDED_INSTANCE_PATHS.some(
    (excluded) =>
      normalized === excluded || normalized.startsWith(`${excluded}/`),
  );
}

function withoutNestedRoot(normalized: string): string | null {
  const root = NESTED_INSTANCE_ROOTS.find((nested) =>
    normalized.startsWith(`${nested}/`),
  );

  return root ? normalized.slice(root.length + 1) : null;
}

export function isExcludedInstancePath(relativePath: string): boolean {
  const normalized = normalizeInstancePath(relativePath);
  if (!normalized) return false;
  if (matchesExcluded(normalized)) return true;

  const nested = withoutNestedRoot(normalized);
  return nested !== null && matchesExcluded(nested);
}

export function hasNestedInstanceExclusions(relativePath: string): boolean {
  const normalized = normalizeInstancePath(relativePath);
  if (!normalized) return false;
  if (NESTED_INSTANCE_ROOTS.includes(normalized)) return true;

  return EXCLUDED_INSTANCE_PATHS.some((excluded) =>
    excluded.startsWith(`${normalized}/`),
  );
}
