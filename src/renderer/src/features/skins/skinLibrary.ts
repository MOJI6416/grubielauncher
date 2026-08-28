import { ICape, ISkinEntry } from "@/types/SkinManager";

export type SkinFilter = "all" | "favorite" | "classic" | "slim" | "cape";
export type SkinSort = "recent" | "name";

export const SKIN_FILTERS: SkinFilter[] = [
  "all",
  "favorite",
  "classic",
  "slim",
  "cape",
];
export const SKIN_SORTS: SkinSort[] = ["recent", "name"];

export function isGeneratedSkinName(name: string): boolean {
  const compact = name.trim().replace(/-/g, "");

  return compact.length >= 8 && /^[0-9a-f]+$/i.test(compact);
}

export function shortSkinLabel(name: string, limit = 10): string {
  const trimmed = name.trim();
  if (!isGeneratedSkinName(trimmed)) return trimmed;

  return trimmed.slice(0, limit).toUpperCase();
}

export function capeLabel(cape: ICape, fallback: string): string {
  const alias = cape.alias?.trim() ?? "";
  if (!alias || isGeneratedSkinName(alias)) return fallback;

  return alias;
}

export function matchesSkinQuery(skin: ISkinEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return (
    skin.name.toLowerCase().includes(needle) ||
    skin.hash.toLowerCase().startsWith(needle) ||
    (skin.remoteId ?? "").toLowerCase().startsWith(needle)
  );
}

export function matchesSkinFilter(
  skin: ISkinEntry,
  filter: SkinFilter,
  favorites: string[] = [],
): boolean {
  if (filter === "all") return true;
  if (filter === "cape") return Boolean(skin.capeId);
  if (filter === "favorite") return favorites.includes(skin.id);

  return skin.model === filter;
}

export function countSkinFilters(
  skins: ISkinEntry[],
  favorites: string[] = [],
): Record<SkinFilter, number> {
  const counts: Record<SkinFilter, number> = {
    all: skins.length,
    favorite: 0,
    classic: 0,
    slim: 0,
    cape: 0,
  };

  for (const skin of skins) {
    if (skin.model === "slim") counts.slim += 1;
    else counts.classic += 1;
    if (skin.capeId) counts.cape += 1;
    if (favorites.includes(skin.id)) counts.favorite += 1;
  }

  return counts;
}

export function toggleFavorite(favorites: string[], skinId: string): string[] {
  return favorites.includes(skinId)
    ? favorites.filter((id) => id !== skinId)
    : [...favorites, skinId];
}

export interface SkinListInput {
  skins: ISkinEntry[];
  query: string;
  filter: SkinFilter;
  sort: SkinSort;
  activeSkin?: string;
  favorites?: string[];
}

export function buildSkinList({
  skins,
  query,
  filter,
  sort,
  activeSkin,
  favorites = [],
}: SkinListInput): ISkinEntry[] {
  const filtered = skins.filter(
    (skin) =>
      matchesSkinQuery(skin, query) &&
      matchesSkinFilter(skin, filter, favorites),
  );

  const order = new Map(skins.map((skin, index) => [skin.id, index]));
  const rank = (skin: ISkinEntry) => {
    if (activeSkin && skin.id === activeSkin) return 0;
    if (favorites.includes(skin.id)) return 1;

    return 2;
  };

  const sorted = [...filtered].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;

    if (sort === "name") {
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }

    return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
  });

  return sorted;
}

export function pickSelectedSkinId(
  skins: ISkinEntry[],
  current: string | null | undefined,
): string | null {
  if (current && skins.some((skin) => skin.id === current)) return current;

  return skins[0]?.id ?? null;
}

export type SkinChange = "skin" | "model" | "cape";

export interface AppliedState {
  activeSkin?: string;
  activeCape?: string;
  activeModel?: string;
}

export interface DraftState {
  skinId?: string;
  model?: "slim" | "classic";
  capeId?: string;
}

export function pendingSkinChanges(
  applied: AppliedState,
  draft: DraftState,
): SkinChange[] {
  if (!draft.skinId) return [];

  const changes: SkinChange[] = [];
  if (applied.activeSkin !== draft.skinId) changes.push("skin");
  else if (draft.model && applied.activeModel !== draft.model) {
    changes.push("model");
  }
  if ((applied.activeCape ?? undefined) !== (draft.capeId ?? undefined)) {
    changes.push("cape");
  }

  return changes;
}

export function isSkinApplied(
  applied: AppliedState,
  draft: DraftState,
): boolean {
  return Boolean(draft.skinId) && pendingSkinChanges(applied, draft).length === 0;
}

export function canDeleteSkin(
  skin: ISkinEntry | null | undefined,
  applied: AppliedState,
): boolean {
  if (!skin) return false;

  return skin.id !== applied.activeSkin;
}

export function findCape(
  capes: ICape[],
  capeId: string | undefined,
): ICape | null {
  if (!capeId) return null;

  return capes.find((cape) => cape.id === capeId) ?? null;
}

export function exportFileName(name: string, hash: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  const base = cleaned && !isGeneratedSkinName(cleaned) ? cleaned : hash.slice(0, 12);

  return `${base}.png`;
}
