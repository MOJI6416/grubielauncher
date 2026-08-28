import type { SettingsEntryId, SettingsSectionId } from "./catalog";

export interface SettingsSearchEntry {
  id: SettingsEntryId;
  section: SettingsSectionId;
  title: string;
  description: string;
  keywords: string;
}

export interface SettingsSearchResult {
  query: string;
  matchedIds: Set<SettingsEntryId>;
  sections: SettingsSectionId[];
  countBySection: Record<string, number>;
  total: number;
}

const LAYOUT_RU = "йцукенгшщзхъфывапролджэячсмитьбю";
const LAYOUT_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";

export function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

export function toRussianLayout(value: string): string {
  let result = "";
  for (const char of value) {
    const index = LAYOUT_EN.indexOf(char);
    result += index === -1 ? char : LAYOUT_RU[index];
  }
  return result;
}

function tokens(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

function haystack(entry: SettingsSearchEntry): string {
  return normalize(
    `${entry.title} ${entry.description} ${entry.keywords} ${entry.id}`,
  );
}

function matches(text: string, parts: string[]): boolean {
  return parts.every((part) => text.includes(part));
}

export function searchSettings(
  entries: SettingsSearchEntry[],
  query: string,
): SettingsSearchResult {
  const parts = tokens(query);

  if (parts.length === 0) {
    return {
      query: "",
      matchedIds: new Set(entries.map((entry) => entry.id)),
      sections: [],
      countBySection: {},
      total: entries.length,
    };
  }

  const swapped = parts.map(toRussianLayout);
  const matched = entries.filter((entry) => {
    const text = haystack(entry);
    return matches(text, parts) || matches(text, swapped);
  });

  const countBySection: Record<string, number> = {};
  const sections: SettingsSectionId[] = [];

  for (const entry of matched) {
    countBySection[entry.section] = (countBySection[entry.section] ?? 0) + 1;
    if (!sections.includes(entry.section)) sections.push(entry.section);
  }

  return {
    query: normalize(query),
    matchedIds: new Set(matched.map((entry) => entry.id)),
    sections,
    countBySection,
    total: matched.length,
  };
}

export function highlightParts(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const needle = normalize(query);
  if (!needle) return [{ text, hit: false }];

  const source = normalize(text);
  const result: { text: string; hit: boolean }[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const index = source.indexOf(needle, cursor);
    if (index === -1) break;

    if (index > cursor) {
      result.push({ text: text.slice(cursor, index), hit: false });
    }
    result.push({ text: text.slice(index, index + needle.length), hit: true });
    cursor = index + needle.length;
  }

  if (result.length === 0) return [{ text, hit: false }];
  if (cursor < text.length) result.push({ text: text.slice(cursor), hit: false });

  return result;
}
