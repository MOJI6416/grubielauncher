export function pickNewShares<T extends { sessionId: string }>(
  previous: Set<string> | null,
  shares: T[],
): T[] {
  if (!previous) return [];
  return shares.filter((share) => !previous.has(share.sessionId));
}
