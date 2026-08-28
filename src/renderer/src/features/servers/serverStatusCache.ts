import { ServerPingState } from "./types";

export const SERVER_STATUS_TTL_MS = 60_000;

export function isStatusFresh(
  state: ServerPingState | undefined,
  now: number,
  ttlMs = SERVER_STATUS_TTL_MS,
): boolean {
  if (!state || state.state === "pending") return false;
  return now - (state.checkedAt ?? 0) < ttlMs;
}

export function pickStaleAddresses(
  addresses: string[],
  cache: Record<string, ServerPingState>,
  inFlight: ReadonlySet<string>,
  now: number,
  ttlMs = SERVER_STATUS_TTL_MS,
): string[] {
  const seen = new Set<string>();

  return addresses.filter((address) => {
    if (!address || seen.has(address) || inFlight.has(address)) return false;
    seen.add(address);
    return !isStatusFresh(cache[address], now, ttlMs);
  });
}
