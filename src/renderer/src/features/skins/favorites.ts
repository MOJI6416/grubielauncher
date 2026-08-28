const STORAGE_PREFIX = "skins:favorites:";

function storageKey(accountKey: string): string {
  return `${STORAGE_PREFIX}${accountKey}`;
}

export function readFavorites(accountKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(accountKey));
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function writeFavorites(accountKey: string, favorites: string[]): void {
  try {
    localStorage.setItem(storageKey(accountKey), JSON.stringify(favorites));
  } catch {}
}
