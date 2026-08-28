import { IServer } from "@/types/ServersList";

export type ServerSort = "manual" | "name" | "players" | "ping";

export interface ServerStatus {
  state: "pending" | "online" | "offline";
  latencyMs?: number;
  players?: { online: number; max: number };
}

export const DEFAULT_PORT = 25565;
export const MAX_SERVER_NAME = 64;

export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list;
  if (from < 0 || from >= list.length) return list;
  if (to < 0 || to >= list.length) return list;

  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  return next;
}

export function normalizeAddress(raw: string): string {
  const withoutScheme = raw.trim().replace(/^[a-z]+:\/\//i, "");
  const trimmed = withoutScheme.replace(/\/+$/, "");

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end < 0) return trimmed;
    const host = trimmed.slice(0, end + 1);
    const rest = trimmed.slice(end + 1);
    return rest === `:${DEFAULT_PORT}` ? host : `${host}${rest}`;
  }

  const parts = trimmed.split(":");
  if (parts.length === 2 && parts[1] === String(DEFAULT_PORT)) {
    return parts[0].toLowerCase();
  }

  if (parts.length === 2) return `${parts[0].toLowerCase()}:${parts[1]}`;

  return trimmed.toLowerCase();
}

export type AddressProblem = "empty" | "spaces" | "port" | "host" | null;

export function validateAddress(raw: string): AddressProblem {
  const value = raw.trim();
  if (!value) return "empty";
  if (/\s/.test(value)) return "spaces";

  const withoutScheme = value.replace(/^[a-z]+:\/\//i, "");

  let host = withoutScheme;
  let port: string | null = null;

  if (withoutScheme.startsWith("[")) {
    const end = withoutScheme.indexOf("]");
    if (end < 0) return "host";
    host = withoutScheme.slice(1, end);
    const rest = withoutScheme.slice(end + 1);
    if (rest) {
      if (!rest.startsWith(":")) return "port";
      port = rest.slice(1);
    }
  } else {
    const parts = withoutScheme.split(":");
    if (parts.length > 2) return "port";
    host = parts[0];
    port = parts[1] ?? null;
  }

  if (!host) return "host";
  if (!/^[a-z0-9._:-]+$/i.test(host)) return "host";

  if (port !== null) {
    if (!/^\d{1,5}$/.test(port)) return "port";
    const parsed = Number(port);
    if (parsed < 1 || parsed > 65535) return "port";
  }

  return null;
}

export function findDuplicateAddress(
  servers: IServer[],
  address: string,
  exceptIndex?: number,
): number {
  const key = normalizeAddress(address);
  if (!key) return -1;

  return servers.findIndex(
    (server, index) =>
      index !== exceptIndex && normalizeAddress(server.ip || "") === key,
  );
}

export function findDuplicateName(
  servers: IServer[],
  name: string,
  exceptIndex?: number,
): number {
  const key = name.trim().toLowerCase();
  if (!key) return -1;

  return servers.findIndex(
    (server, index) =>
      index !== exceptIndex && server.name.trim().toLowerCase() === key,
  );
}

export function filterServers(servers: IServer[], query: string): IServer[] {
  const key = query.trim().toLowerCase();
  if (!key) return servers;

  return servers.filter(
    (server) =>
      server.name.toLowerCase().includes(key) ||
      (server.ip || "").toLowerCase().includes(key),
  );
}

export function sortServers(
  servers: IServer[],
  sort: ServerSort,
  statuses: Record<string, ServerStatus | undefined>,
): IServer[] {
  if (sort === "manual") return servers;

  const decorated = servers.map((server, index) => ({ server, index }));
  const statusOf = (server: IServer) => statuses[server.ip || ""];

  decorated.sort((a, b) => {
    if (sort === "name") {
      const byName = a.server.name.localeCompare(b.server.name);
      return byName || a.index - b.index;
    }

    if (sort === "players") {
      const left = statusOf(a.server)?.players?.online ?? -1;
      const right = statusOf(b.server)?.players?.online ?? -1;
      return right - left || a.index - b.index;
    }

    const left = statusOf(a.server);
    const right = statusOf(b.server);
    const leftPing = left?.state === "online" ? (left.latencyMs ?? 9999) : 99999;
    const rightPing =
      right?.state === "online" ? (right.latencyMs ?? 9999) : 99999;

    return leftPing - rightPing || a.index - b.index;
  });

  return decorated.map((entry) => entry.server);
}

export function countOnline(
  servers: IServer[],
  statuses: Record<string, ServerStatus | undefined>,
): number {
  return servers.filter((server) => statuses[server.ip || ""]?.state === "online")
    .length;
}
