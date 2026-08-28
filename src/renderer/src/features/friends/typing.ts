export const TYPING_TTL_MS = 7000;
export const TYPING_PING_MS = 3000;

export type TypingMap = Record<string, number>;

export function markTyping(
  map: TypingMap,
  id: string,
  now: number,
): TypingMap {
  if (!id) return map;
  return { ...map, [id]: now };
}

export function clearTyping(map: TypingMap, id: string): TypingMap {
  if (!id || map[id] === undefined) return map;
  const next = { ...map };
  delete next[id];
  return next;
}

export function pruneTyping(
  map: TypingMap,
  now: number,
  ttl: number = TYPING_TTL_MS,
): TypingMap {
  const next: TypingMap = {};
  let changed = false;

  for (const [id, at] of Object.entries(map)) {
    if (now - at < ttl) next[id] = at;
    else changed = true;
  }

  return changed ? next : map;
}

export function isTyping(
  map: TypingMap,
  id: string | undefined,
  now: number,
  ttl: number = TYPING_TTL_MS,
): boolean {
  if (!id) return false;
  const at = map[id];
  return at !== undefined && now - at < ttl;
}

export function shouldPingTyping(
  lastSentAt: number | null,
  now: number,
  interval: number = TYPING_PING_MS,
): boolean {
  return lastSentAt === null || now - lastSentAt >= interval;
}
