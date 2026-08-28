import {
  ModpackDiff,
  ModpackDiffEntry,
  diffModpackProjects,
  isEmptyDiff,
} from "@/shared/modpackDiff";

export interface UpdateSideVersion {
  version: { id: string };
  loader: { name: string; mods: unknown[] };
  servers?: { name?: string; ip?: string }[];
}

export interface UpdateChange {
  from: string;
  to: string;
}

export interface UpdateSummary {
  diff: ModpackDiff;
  gameVersion: UpdateChange | null;
  loader: UpdateChange | null;
  remoteServers: string[];
}

function changed(from: string, to: string): UpdateChange | null {
  if (!from || !to || from === to) return null;
  return { from, to };
}

export function buildUpdateSummary(
  local: UpdateSideVersion,
  remote: UpdateSideVersion,
): UpdateSummary {
  return {
    diff: diffModpackProjects(
      (local.loader.mods ?? []) as never[],
      (remote.loader.mods ?? []) as never[],
    ),
    gameVersion: changed(local.version.id, remote.version.id),
    loader: changed(local.loader.name, remote.loader.name),
    remoteServers: (remote.servers ?? []).map((server) => server.ip ?? ""),
  };
}

function serverKey(ip?: string): string {
  return (ip ?? "").trim().toLowerCase();
}

export function serversLostBySync(
  local: { name?: string; ip?: string }[],
  remote: string[],
): string[] {
  const kept = new Set(remote.map(serverKey).filter(Boolean));

  return local
    .filter((server) => !kept.has(serverKey(server.ip)))
    .map((server) => server.name?.trim() || server.ip?.trim() || "")
    .filter(Boolean);
}

function flipEntry(entry: ModpackDiffEntry): ModpackDiffEntry {
  return {
    ...entry,
    fromVersion: entry.toVersion,
    toVersion: entry.fromVersion,
  };
}

function flipChange(change: UpdateChange | null): UpdateChange | null {
  return change ? { from: change.to, to: change.from } : null;
}

export function invertUpdateSummary(summary: UpdateSummary): UpdateSummary {
  return {
    diff: {
      added: summary.diff.removed.map(flipEntry),
      removed: summary.diff.added.map(flipEntry),
      updated: summary.diff.updated.map(flipEntry),
      unchanged: summary.diff.unchanged,
    },
    gameVersion: flipChange(summary.gameVersion),
    loader: flipChange(summary.loader),
    remoteServers: summary.remoteServers,
  };
}

export function hasUpdateDetails(summary: UpdateSummary): boolean {
  return (
    !isEmptyDiff(summary.diff) || !!summary.gameVersion || !!summary.loader
  );
}

export function summaryCounts(summary: UpdateSummary): {
  added: number;
  updated: number;
  removed: number;
  total: number;
} {
  const { added, updated, removed } = summary.diff;

  return {
    added: added.length,
    updated: updated.length,
    removed: removed.length,
    total: added.length + updated.length + removed.length,
  };
}
