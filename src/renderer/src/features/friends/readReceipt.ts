import type { ChatEntry } from "./chatEntries";

export function mergeReadSeq(current: number, incoming: unknown): number {
  const seq = Number(incoming);
  if (!Number.isFinite(seq) || seq <= current) return current;
  return Math.trunc(seq);
}

export function lastReadOwnKey(
  entries: ChatEntry[],
  ownUserId: string | undefined,
  peerReadSeq: number,
): string | undefined {
  if (!ownUserId || peerReadSeq <= 0) return undefined;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.status !== "sent") continue;
    if (entry.message.sender !== ownUserId) continue;

    const seq = Number(entry.message.seq);
    if (!Number.isFinite(seq)) continue;
    if (seq <= peerReadSeq) return entry.key;
  }

  return undefined;
}
