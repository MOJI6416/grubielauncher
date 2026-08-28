export const RESERVED_TAGS = new Set(["official"]);

export const TAG_MAX_LENGTH = 24;

export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAG_MAX_LENGTH);
}

export function canAddTag(
  raw: string,
  selected: string[],
  max: number,
): boolean {
  const tag = normalizeTag(raw);

  return (
    tag.length > 0 &&
    !RESERVED_TAGS.has(tag) &&
    !selected.includes(tag) &&
    selected.length < max
  );
}

export function filterSuggestions(
  suggestions: string[],
  selected: string[],
  limit: number,
): string[] {
  const taken = new Set(selected);

  return suggestions
    .filter((entry) => !taken.has(entry) && !RESERVED_TAGS.has(entry))
    .slice(0, limit);
}
