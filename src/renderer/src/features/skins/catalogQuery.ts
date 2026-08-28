import {
  CatalogItemType,
  CatalogListParams,
  CatalogSkinSource,
  CatalogSortOption,
  ICatalogSkin,
} from "@/types/SkinManager";

export type CatalogSource = CatalogSkinSource | "all" | "mine";

export const CATALOG_SORTS: CatalogSortOption[] = ["new", "downloads"];
export const CATALOG_TYPES: CatalogItemType[] = ["skin", "cape", "pack"];

export interface CatalogState {
  source: CatalogSource;
  type: CatalogItemType;
  sort: CatalogSortOption;
  search: string;
  tag: string | null;
}

export const INITIAL_CATALOG_STATE: CatalogState = {
  source: "all",
  type: "skin",
  sort: "new",
  search: "",
  tag: null,
};

export function availableCatalogSources(hasToken: boolean): CatalogSource[] {
  const sources: CatalogSource[] = ["all", "official", "community"];
  if (hasToken) sources.push("mine");

  return sources;
}

export function availableCatalogTypes(source: CatalogSource): CatalogItemType[] {
  if (source === "official") return ["skin", "cape"];

  return CATALOG_TYPES;
}

export function normalizeCatalogState(state: CatalogState): CatalogState {
  const types = availableCatalogTypes(state.source);
  const type = types.includes(state.type) ? state.type : "skin";

  return { ...state, type };
}

export function isOwnCatalog(state: CatalogState): boolean {
  return state.source === "mine";
}

export function hasCatalogFilters(state: CatalogState): boolean {
  return state.search.trim() !== "" || state.tag !== null;
}

export function toCatalogParams(
  state: CatalogState,
  page: number,
  limit: number,
): CatalogListParams {
  const normalized = normalizeCatalogState(state);
  const search = normalized.search.trim();

  return {
    search: search || undefined,
    tag: normalized.tag || undefined,
    source: normalized.source === "all" ? undefined : (normalized.source as CatalogSkinSource),
    type: normalized.type,
    sort: normalized.sort,
    page,
    limit,
  };
}

export function mergeCatalogPage(
  current: ICatalogSkin[],
  incoming: ICatalogSkin[],
  page: number,
): ICatalogSkin[] {
  if (page <= 1) return incoming;

  const seen = new Set(current.map((item) => item.id));

  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

export function catalogPreviewSkinUrl(
  item: ICatalogSkin | null,
  playerSkinUrl?: string,
): string | undefined {
  if (!item || item.type === "cape") return playerSkinUrl;

  return item.skinUrl ?? playerSkinUrl ?? undefined;
}

export const CATALOG_GRID_GAP = 8;
export const CATALOG_GRID_PADDING = 20;
export const CATALOG_TILE_CHROME = 32;
const CATALOG_TILE_PADDING = 12;
const CATALOG_MIN_PREVIEW = 64;

export function catalogColumns(width: number, minTile = 96, gap = 8): number {
  if (!Number.isFinite(width) || width <= 0) return 4;

  return Math.min(8, Math.max(2, Math.floor((width + gap) / (minTile + gap))));
}

export function catalogColumnWidth(
  width: number,
  columns: number,
  gap = CATALOG_GRID_GAP,
): number {
  if (!Number.isFinite(width) || width <= 0 || columns <= 0) return 0;

  return Math.max(0, (width - gap * (columns - 1)) / columns);
}

export function catalogPreviewHeight(columnWidth: number): number {
  if (!Number.isFinite(columnWidth)) return CATALOG_MIN_PREVIEW;

  return Math.max(
    CATALOG_MIN_PREVIEW,
    Math.round(columnWidth - CATALOG_TILE_PADDING),
  );
}

export function catalogTileHeight(columnWidth: number): number {
  return catalogPreviewHeight(columnWidth) + CATALOG_TILE_CHROME;
}

export function catalogHasMore(
  state: CatalogState,
  loaded: number,
  total: number,
): boolean {
  if (isOwnCatalog(state)) return false;

  return loaded > 0 && loaded < total;
}

const IMPORT_SUFFIX = /\s+minecraft\s+skins?$/i;

export function catalogDisplayName(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(IMPORT_SUFFIX, "").trim();

  return stripped || trimmed;
}

const SOURCE_LABELS: Record<string, string> = {
  namemc: "NameMC",
  minecraftskins: "MinecraftSkins",
  planetminecraft: "Planet Minecraft",
};

export function catalogSourceLabel(site: string | null | undefined): string {
  const key = (site ?? "").trim();
  if (key === "") return "";

  return SOURCE_LABELS[key.toLowerCase()] ?? key;
}

export function catalogSourceHref(
  url: string | null | undefined,
): string | null {
  const value = (url ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return null;

  return value;
}

export function isCatalogItemImportable(item: ICatalogSkin | null): boolean {
  if (!item) return false;
  if (item.type === "cape") return Boolean(item.capeUrl);
  if (item.type === "pack") return Boolean(item.skinUrl && item.capeUrl);

  return Boolean(item.skinUrl);
}
