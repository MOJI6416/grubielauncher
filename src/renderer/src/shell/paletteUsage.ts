const STORAGE_KEY = "grubie:paletteUsage";
const MAX_ENTRIES = 60;

let cache: Record<string, number> | null = null;

function read(): Record<string, number> {
  if (cache) return cache;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = {};

    if (parsed && typeof parsed === "object") {
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "number" && Number.isFinite(value)) {
          cache[key] = value;
        }
      }
    }
  } catch {
    cache = {};
  }

  return cache;
}

export function readPaletteUsage(): Record<string, number> {
  return { ...read() };
}

export function recordPaletteUse(id: string): void {
  const usage = read();
  usage[id] = (usage[id] ?? 0) + 1;

  const entries = Object.entries(usage);
  if (entries.length > MAX_ENTRIES) {
    const trimmed = entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);

    cache = Object.fromEntries(trimmed);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache ?? usage));
  } catch {}
}
