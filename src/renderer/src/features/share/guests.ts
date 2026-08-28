import type { SharePeerInfo } from "@/types/Share";

export interface ShareGuestRow {
  key: string;
  userId?: string;
  accountName?: string;
  gameName?: string;
  connections: number;
  connectedAt: string;
  isKnown: boolean;
}

function guestKey(peer: SharePeerInfo): string {
  if (peer.guestUserId) return `user:${peer.guestUserId}`;
  if (peer.guestUsername) return `name:${peer.guestUsername.toLowerCase()}`;
  return `stream:${peer.streamId}`;
}

function earliest(a: string, b: string): string {
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left)) return b;
  if (Number.isNaN(right)) return a;
  return left <= right ? a : b;
}

export function buildGuestRows(
  peers: SharePeerInfo[],
  accountNameById: Map<string, string>,
): ShareGuestRow[] {
  const rows = new Map<string, ShareGuestRow>();

  for (const peer of peers) {
    const key = guestKey(peer);
    const accountName = peer.guestUserId
      ? accountNameById.get(peer.guestUserId)
      : undefined;
    const existing = rows.get(key);

    if (existing) {
      existing.connections += 1;
      existing.connectedAt = earliest(existing.connectedAt, peer.connectedAt);
      existing.accountName = existing.accountName || accountName;
      existing.gameName = existing.gameName || peer.guestUsername;
      existing.isKnown = existing.isKnown || !!accountName;
      continue;
    }

    rows.set(key, {
      key,
      userId: peer.guestUserId,
      accountName,
      gameName: peer.guestUsername,
      connections: 1,
      connectedAt: peer.connectedAt,
      isKnown: !!accountName,
    });
  }

  return [...rows.values()].sort((a, b) => {
    const left = Date.parse(a.connectedAt);
    const right = Date.parse(b.connectedAt);
    if (Number.isNaN(left) || Number.isNaN(right) || left === right) {
      return a.key.localeCompare(b.key);
    }
    return left - right;
  });
}

export function guestDisplayName(
  row: ShareGuestRow,
  unknownLabel: string,
): string {
  return row.accountName || row.gameName || unknownLabel;
}

export function guestSecondaryName(row: ShareGuestRow): string | undefined {
  if (!row.gameName) return undefined;
  if (!row.accountName) return undefined;
  if (row.gameName === row.accountName) return undefined;
  return row.gameName;
}

export function guestUserIds(rows: ShareGuestRow[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) if (row.userId) ids.add(row.userId);
  return ids;
}
