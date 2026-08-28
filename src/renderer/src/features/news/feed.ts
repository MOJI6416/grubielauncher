import type { INews, INewsPage } from "@/types/News";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";

export type NewsSource = "minecraft" | "grubie" | "other";

export type NewsKind =
  | "release"
  | "snapshot"
  | "prerelease"
  | "candidate"
  | "deepDive"
  | "tournament"
  | "marketplace"
  | "realms"
  | "article";

export interface NewsCard {
  key: string;
  item: INews;
  source: NewsSource;
  host: string;
  kind: NewsKind;
  version: string;
  summary: string;
  time: number;
  release: ILauncherReleaseNote | null;
}

export type ReleaseLookup = (item: INews) => ILauncherReleaseNote | null;

export interface NewsSplit {
  hero: NewsCard | null;
  secondary: NewsCard[];
  rest: NewsCard[];
}

export const SECONDARY_SLOTS = 3;

const MINECRAFT_HOSTS = ["minecraft.net", "mojang.com"];
const GRUBIE_HOSTS = ["grubielauncher.com"];

export function newsHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function newsSource(url: string): NewsSource {
  const host = newsHost(url);
  if (!host) return "other";

  if (MINECRAFT_HOSTS.some((known) => host.endsWith(known))) return "minecraft";
  if (GRUBIE_HOSTS.some((known) => host.endsWith(known))) return "grubie";
  return "other";
}

export function newsVersion(title: string): string {
  const weekly = /\b(\d{2}w\d{1,2}[a-z]{1,2})\b/i.exec(title);
  if (weekly) return weekly[1].toLowerCase();

  const semver = /\b(\d+\.\d+(?:\.\d+)?)\b/.exec(title);
  return semver ? semver[1] : "";
}

function hasTag(item: INews, needle: string): boolean {
  return (item.tags ?? []).some((tag) => tag.includes(needle));
}

export function newsKind(item: INews): NewsKind {
  const title = item.title ?? "";

  if (/release\s*candidate|\brc\d/i.test(title)) return "candidate";
  if (/pre[-\s]?release/i.test(title)) return "prerelease";
  if (/snapshot/i.test(title)) return "snapshot";
  if (/^minecraft\s+\d+\.\d+/i.test(title.trim())) return "release";

  if (hasTag(item, "deep-dives")) return "deepDive";
  if (hasTag(item, "tournament")) return "tournament";
  if (hasTag(item, "marketplace")) return "marketplace";
  if (hasTag(item, "realms")) return "realms";

  return "article";
}

export function newsSummary(item: INews): string {
  const description = (item.description ?? "").trim();
  if (!description) return "";
  if (description === item.title.trim()) return "";
  return description;
}

export function newsItemKey(item: INews): string {
  return item.id || item.url || item.title;
}

export function toNewsCard(
  item: INews,
  index: number,
  releaseOf?: ReleaseLookup,
): NewsCard {
  return {
    key: `${newsItemKey(item)}-${index}`,
    item,
    source: newsSource(item.url ?? ""),
    host: newsHost(item.url ?? ""),
    kind: newsKind(item),
    version: newsVersion(item.title ?? ""),
    summary: newsSummary(item),
    time: Number.isFinite(item.time) ? item.time * 1000 : 0,
    release: releaseOf?.(item) ?? null,
  };
}

export function buildNewsCards(
  news: INews[],
  releaseOf?: ReleaseLookup,
): NewsCard[] {
  return news
    .filter((item) => item && typeof item.title === "string" && item.url)
    .map((item, index) => toNewsCard(item, index, releaseOf))
    .sort((a, b) => b.time - a.time);
}

export function mergeNewsItems(previous: INews[], next: INews[]): INews[] {
  const seen = new Set(previous.map(newsItemKey));
  const merged = [...previous];

  for (const item of next) {
    if (!item || typeof item.title !== "string" || !item.url) continue;

    const key = newsItemKey(item);
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(item);
  }

  return merged;
}

export interface NewsPageResult {
  items: INews[];
  nextCursor: string | null;
}

export function readNewsPage(page: INewsPage | null | undefined): NewsPageResult {
  const items = Array.isArray(page?.items) ? page.items : [];
  const cursor = typeof page?.nextCursor === "string" ? page.nextCursor : "";

  return {
    items,
    nextCursor: items.length > 0 && cursor ? cursor : null,
  };
}

export function availableSources(cards: NewsCard[]): NewsSource[] {
  const order: NewsSource[] = ["grubie", "minecraft", "other"];
  const present = new Set(cards.map((card) => card.source));
  return order.filter((source) => present.has(source));
}

export function filterBySource(
  cards: NewsCard[],
  source: NewsSource | "all",
): NewsCard[] {
  if (source === "all") return cards;
  return cards.filter((card) => card.source === source);
}

export function capSource(
  cards: NewsCard[],
  source: NewsSource,
  max: number,
): NewsCard[] {
  let kept = 0;

  return cards.filter((card) => {
    if (card.source !== source) return true;
    kept += 1;
    return kept <= max;
  });
}

export function mixFeed(
  cards: NewsCard[],
  source: NewsSource,
  max: number,
): NewsCard[] {
  if (!cards.some((card) => card.source !== source)) return cards;
  return capSource(cards, source, max);
}

export function unreadCount(cards: NewsCard[], lastSeen: number): number {
  if (!lastSeen) return 0;
  return cards.filter((card) => card.time > lastSeen).length;
}

export function newestTime(cards: NewsCard[]): number {
  return cards.reduce((max, card) => Math.max(max, card.time), 0);
}

export function splitFeed(cards: NewsCard[], secondary = SECONDARY_SLOTS): NewsSplit {
  if (!cards.length) return { hero: null, secondary: [], rest: [] };

  return {
    hero: cards[0],
    secondary: cards.slice(1, 1 + secondary),
    rest: cards.slice(1 + secondary),
  };
}

export function parseLastSeen(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface FeedOutcome {
  hasError: boolean;
  partialError: boolean;
}

export function resolveFeedOutcome(input: {
  answered: boolean;
  itemCount: number;
  releaseCount: number;
}): FeedOutcome {
  const failed = !input.answered && input.itemCount === 0;

  return {
    hasError: failed && input.releaseCount === 0,
    partialError: failed && input.releaseCount > 0,
  };
}
