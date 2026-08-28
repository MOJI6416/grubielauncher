export function continueCacheKey(
  identity: string,
  versionPath: string,
): string {
  return `${identity}|${versionPath}`;
}

export function isContinueCacheKeyFor(
  key: string,
  versionPath: string,
): boolean {
  return key.endsWith(`|${versionPath}`);
}

export interface ContinueWorld {
  kind: "world";
  id: string;
  name: string;
  folderName: string;
  icon?: string;
  lastPlayed: number;
  hardcore: boolean;
  gameMode?: string;
  versionName?: string;
}

export interface ContinueServer {
  kind: "server";
  id: string;
  name: string;
  address: string;
  icon?: string;
  quick: boolean;
}

export type ContinueTarget = ContinueWorld | ContinueServer;

export type ContinueTab = "worlds" | "servers";

export interface ContinueTabs {
  worlds: boolean;
  servers: boolean;
}

export function continueListTab(
  kind: ContinueTarget["kind"],
  tabs: ContinueTabs,
): ContinueTab | null {
  if (kind === "world") return tabs.worlds ? "worlds" : null;
  return tabs.servers ? "servers" : null;
}

export function continueAllTab(
  counts: { worlds: number; servers: number },
  tabs: ContinueTabs,
): ContinueTab | null {
  if (counts.worlds > 0 && tabs.worlds) return "worlds";
  if (counts.servers > 0 && tabs.servers) return "servers";

  return null;
}

export interface ContinueSourceWorld {
  name: string;
  folderName: string;
  icon?: string;
  lastPlayed?: number;
  hardcore?: boolean;
  gameMode?: string;
  versionName?: string;
}

export interface ContinueSourceServer {
  name: string;
  ip: string;
  icon?: string;
}

export interface ContinueInput {
  worlds?: ContinueSourceWorld[];
  servers?: ContinueSourceServer[];
  quickServer?: string;
  limit?: number;
  allowWorlds?: boolean;
  allowServers?: boolean;
}

function normalizeAddress(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function stripFormatting(value: string): string {
  return value.replace(/§[0-9a-fk-orA-FK-OR]/g, "").trim();
}

export function sanitizeWorldIcon(icon?: string): string | undefined {
  const value = (icon ?? "").trim();
  return /^(file|app|https?|data):/i.test(value) ? value : undefined;
}

export function sanitizeServerIcon(icon?: string): string | undefined {
  const value = (icon ?? "").trim();
  if (value.startsWith("data:image/")) return value;

  return value.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : undefined;
}

export function buildContinueTargets(input: ContinueInput): ContinueTarget[] {
  const limit = input.limit ?? 4;
  const quick = normalizeAddress(input.quickServer);

  const worlds: ContinueWorld[] =
    input.allowWorlds === false
      ? []
      : (input.worlds ?? [])
          .filter((world) => world.folderName)
          .map((world) => ({
            kind: "world" as const,
            id: `world:${world.folderName}`,
            name: stripFormatting(world.name || "") || world.folderName,
            folderName: world.folderName,
            icon: sanitizeWorldIcon(world.icon),
            lastPlayed: Number.isFinite(world.lastPlayed)
              ? (world.lastPlayed as number)
              : 0,
            hardcore: world.hardcore === true,
            gameMode: world.gameMode,
            versionName: world.versionName,
          }))
          .sort((a, b) => b.lastPlayed - a.lastPlayed);

  const servers: ContinueServer[] =
    input.allowServers === false
      ? []
      : (input.servers ?? [])
          .filter((server) => server.ip)
          .map((server) => ({
            kind: "server" as const,
            id: `server:${server.ip}`,
            name: stripFormatting(server.name || "") || server.ip,
            address: server.ip,
            icon: sanitizeServerIcon(server.icon),
            quick: !!quick && normalizeAddress(server.ip) === quick,
          }));

  const pinned = servers.filter((server) => server.quick);
  const rest = servers.filter((server) => !server.quick);

  return [...pinned, ...worlds, ...rest].slice(0, Math.max(0, limit));
}
