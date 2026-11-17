export interface LaunchShortcutTarget {
  world?: string;
  server?: string;
  label?: string;
}

const MAX_TARGET_LENGTH = 255;
const WORLD_FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/;
const SERVER_ADDRESS = /^[A-Za-z0-9._\-[\]:]+$/;

export function isSafeQuickWorld(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_TARGET_LENGTH) return false;
  if (value !== value.trim() || value.startsWith("-")) return false;
  if (value === "." || value === "..") return false;
  return !WORLD_FORBIDDEN.test(value);
}

export function isSafeQuickServer(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value || value.length > MAX_TARGET_LENGTH) return false;
  if (value.startsWith("-")) return false;
  return SERVER_ADDRESS.test(value);
}

export function buildLaunchDeepLink(
  versionName: string,
  instance: number,
  target?: LaunchShortcutTarget,
  signature?: string,
): string {
  const base = `grubielauncher://launch/${encodeURIComponent(
    versionName,
  )}?instance=${instance}`;
  if (target?.world) return `${base}&world=${encodeURIComponent(target.world)}`;
  if (target?.server) {
    const signed = signature ? `&sig=${signature}` : "";
    return `${base}&server=${encodeURIComponent(target.server)}${signed}`;
  }
  return base;
}

export function readLaunchTarget(
  params: URLSearchParams,
): { world: string } | { server: string } | Record<string, never> {
  const world = params.get("world");
  if (isSafeQuickWorld(world)) return { world };
  const server = params.get("server");
  if (isSafeQuickServer(server)) return { server };
  return {};
}
