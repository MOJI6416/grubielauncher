import type { IPackSessionEntry } from "@/types/VersionStatistics";

export const PACK_SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
export const PACK_SESSIONS_PER_FLUSH = 20;

export interface PackSessionFlushPlan {
  send: IPackSessionEntry[];
  drop: string[];
}

export function planPackSessionFlush(
  queue: IPackSessionEntry[],
  sub: string | null,
  isEnabled: boolean,
  now: number,
): PackSessionFlushPlan {
  if (!isEnabled) return { send: [], drop: queue.map((entry) => entry.id) };

  const drop: string[] = [];
  const send: IPackSessionEntry[] = [];
  for (const entry of queue) {
    const createdAt = Date.parse(entry.createdAt);
    if (!Number.isFinite(createdAt) || now - createdAt > PACK_SESSION_MAX_AGE_MS) {
      drop.push(entry.id);
      continue;
    }
    if (sub && entry.sub === sub && send.length < PACK_SESSIONS_PER_FLUSH) {
      send.push(entry);
    }
  }
  return { send, drop };
}
