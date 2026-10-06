const STORAGE_KEY = "chat.expressionRecents";
const RECENT_LIMIT = 16;

export interface ExpressionRecents {
  emoji: string[];
  stickers: string[];
}

const EMPTY: ExpressionRecents = { emoji: [], stickers: [] };

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.length <= 64)
        .slice(0, RECENT_LIMIT)
    : [];
}

export function normalizeRecents(raw: unknown): ExpressionRecents {
  if (!raw || typeof raw !== "object") return EMPTY;
  const value = raw as Partial<ExpressionRecents>;
  return { emoji: strings(value.emoji), stickers: strings(value.stickers) };
}

export function pushRecent(list: string[], item: string): string[] {
  return [item, ...list.filter((entry) => entry !== item)].slice(0, RECENT_LIMIT);
}

export function loadRecents(): ExpressionRecents {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeRecents(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY;
  }
}

export function saveRecents(recents: ExpressionRecents) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(recents));
  } catch {
    return;
  }
}
