import { createHash } from "node:crypto";
import type { IServer } from "@/types/ServersList";

export interface ServerMark {
  k: string;
  h: string;
}

const JOIN_HOST = /\.join\.grubielauncher\.com$/i;

function hostOf(ip: string): string {
  const value = ip.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(0, end + 1) : value;
  }
  const parts = value.split(":");
  return parts.length === 2 ? parts[0] : value;
}

export function serverKey(ip: string): string {
  return ip
    .trim()
    .toLowerCase()
    .replace(/:25565$/, "");
}

export function isTransientServer(server: IServer): boolean {
  return server.hidden === 1 || JOIN_HOST.test(hostOf(server.ip));
}

function digest(server: IServer): string {
  return createHash("sha1")
    .update(
      JSON.stringify([
        server.name,
        server.ip,
        server.icon ?? "",
        server.acceptTextures ?? null,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}

export function serverMarks(list: IServer[]): ServerMark[] {
  return list
    .filter((server) => !isTransientServer(server) && server.ip.trim())
    .map((server) => ({ k: serverKey(server.ip), h: digest(server) }));
}

export interface ServerState {
  profile: IServer[];
  local: string[];
}

function uniqueByKey(list: IServer[]): IServer[] {
  const seen = new Set<string>();
  return list.filter((server) => {
    const key = serverKey(server.ip);
    if (!server.ip.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function captureServers(
  current: IServer[],
  baseline: ServerMark[] | null,
  state: ServerState,
  mode: "session" | "adopt" | "first",
): ServerState {
  const own = uniqueByKey(
    current.filter((server) => !isTransientServer(server)),
  );
  const profileKeys = new Set(
    state.profile.map((server) => serverKey(server.ip)),
  );

  if (mode === "adopt") {
    return {
      profile: uniqueByKey([...state.profile, ...own]),
      local: [],
    };
  }

  if (mode === "first" || !baseline) {
    return {
      profile: state.profile,
      local: own
        .map((server) => serverKey(server.ip))
        .filter((key) => !profileKeys.has(key)),
    };
  }

  const before = new Map(baseline.map((mark) => [mark.k, mark.h]));
  const present = new Set(own.map((server) => serverKey(server.ip)));
  const removed = new Set(
    [...before.keys()].filter((key) => !present.has(key)),
  );
  const localSet = new Set(state.local);
  const profileByKey = new Map(
    state.profile.map((server) => [serverKey(server.ip), server]),
  );

  const kept: IServer[] = [];
  for (const server of own) {
    const key = serverKey(server.ip);
    if (localSet.has(key) && !profileKeys.has(key)) continue;
    const was = before.get(key);
    if (was === undefined || was !== digest(server)) {
      kept.push(server);
      continue;
    }
    const known = profileByKey.get(key);
    if (known) kept.push(known);
  }

  const keptKeys = new Set(kept.map((server) => serverKey(server.ip)));
  const profile = uniqueByKey([
    ...kept,
    ...state.profile.filter((server) => {
      const key = serverKey(server.ip);
      return !keptKeys.has(key) && !removed.has(key);
    }),
  ]);
  const shared = new Set(profile.map((server) => serverKey(server.ip)));
  return {
    profile,
    local: state.local.filter((key) => !removed.has(key) && !shared.has(key)),
  };
}

export function applyServers(
  current: IServer[],
  state: ServerState,
): IServer[] {
  const transient = current.filter(isTransientServer);
  const profileKeys = new Set(
    state.profile.map((server) => serverKey(server.ip)),
  );
  const localKeys = new Set(state.local);
  const local = current.filter((server) => {
    if (isTransientServer(server)) return false;
    const key = serverKey(server.ip);
    return localKeys.has(key) && !profileKeys.has(key);
  });
  return uniqueByKey([...transient, ...state.profile, ...local]);
}

export function restoreServers(
  current: IServer[],
  backup: IServer[],
): IServer[] {
  return uniqueByKey([...current.filter(isTransientServer), ...backup]);
}

export function withoutSharedServers(
  current: IServer[],
  shared: IServer[],
  own: ReadonlySet<string>,
): IServer[] {
  const sharedKeys = new Set(shared.map((server) => serverKey(server.ip)));
  return current.filter((server) => {
    const key = serverKey(server.ip);
    return !sharedKeys.has(key) || own.has(key);
  });
}
