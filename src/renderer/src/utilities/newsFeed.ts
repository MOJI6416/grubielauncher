export function parseHiddenSponsoredAdIds(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function serializeHiddenSponsoredAdIds(ids: string[]): string {
  return JSON.stringify(Array.from(new Set(ids)));
}

export function removeHiddenSponsoredAdId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}
