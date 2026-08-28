import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import { INews, ISponsoredNewsAd } from "@/types/News";
import type { ILauncherReleaseNote } from "@/types/LauncherRelease";
import {
  LAUNCHER_RELEASES_IN_FEED,
  LAUNCHER_RELEASES_SIZE,
  NEWS_PAGE_SIZE,
} from "@/shared/config";
import { networkAtom } from "@renderer/stores/atoms";
import {
  releasesById,
  releasesToNewsItems,
} from "@renderer/features/whatsNew/releaseNews";
import {
  parseHiddenSponsoredAdIds,
  removeHiddenSponsoredAdId,
  serializeHiddenSponsoredAdIds,
} from "@renderer/utilities/newsFeed";
import {
  NewsSource,
  availableSources,
  buildNewsCards,
  filterBySource,
  mergeNewsItems,
  mixFeed,
  newestTime,
  parseLastSeen,
  readNewsPage,
  resolveFeedOutcome,
  splitFeed,
  unreadCount,
} from "./feed";

const api = window.api;

const HIDDEN_SPONSORED_ADS_KEY = "grubie:hidden-sponsored-news-ads";
const LAST_SEEN_KEY = "grubie:news-last-seen";
const reportedSponsoredImpressions = new Set<string>();

export function useNewsFeed() {
  const { t, i18n } = useTranslation();
  const isNetwork = useAtomValue(networkAtom);

  const [news, setNews] = useState<INews[]>([]);
  const [releases, setReleases] = useState<ILauncherReleaseNote[]>([]);
  const [sponsoredAd, setSponsoredAd] = useState<ISponsoredNewsAd | null>(null);
  const [hiddenSponsoredAdIds, setHiddenSponsoredAdIds] = useState<string[]>(
    () =>
      parseHiddenSponsoredAdIds(
        window.localStorage.getItem(HIDDEN_SPONSORED_ADS_KEY),
      ),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [partialError, setPartialError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [source, setSource] = useState<NewsSource | "all">("all");
  const [lastSeen] = useState(() =>
    parseLastSeen(window.localStorage.getItem(LAST_SEEN_KEY)),
  );

  const reqIdRef = useRef(0);

  const releaseItems = useMemo(
    () => releasesToNewsItems(releases, i18n.language),
    [releases, i18n.language],
  );
  const releaseIndex = useMemo(() => releasesById(releases), [releases]);

  const cards = useMemo(
    () =>
      buildNewsCards(mergeNewsItems(releaseItems, news), (item) =>
        item.id ? (releaseIndex.get(item.id) ?? null) : null,
      ),
    [releaseItems, releaseIndex, news],
  );
  const sources = useMemo(() => availableSources(cards), [cards]);
  const mixed = useMemo(
    () => mixFeed(cards, "grubie", LAUNCHER_RELEASES_IN_FEED),
    [cards],
  );
  const visible = useMemo(
    () => (source === "all" ? mixed : filterBySource(cards, source)),
    [cards, mixed, source],
  );
  const unread = useMemo(
    () => unreadCount(mixed, lastSeen),
    [mixed, lastSeen],
  );
  const { hero, secondary, rest } = useMemo(
    () => splitFeed(visible, sponsoredAd ? 2 : 3),
    [visible, sponsoredAd],
  );

  const refresh = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setIsLoading(true);

    const hiddenIds = parseHiddenSponsoredAdIds(
      window.localStorage.getItem(HIDDEN_SPONSORED_ADS_KEY),
    );
    setHiddenSponsoredAdIds(hiddenIds);

    try {
      const [pageResult, releasesResult, sponsoredResult] =
        await Promise.allSettled([
          api.backend.getNewsPage({ limit: NEWS_PAGE_SIZE }),
          api.backend.getLauncherReleases(
            i18n.language,
            LAUNCHER_RELEASES_SIZE,
          ),
          api.backend.getSponsoredNewsAd(i18n.language, hiddenIds),
        ]);
      if (reqIdRef.current !== reqId) return;

      const answer =
        pageResult.status === "fulfilled" ? pageResult.value : null;
      const page = readNewsPage(answer);

      const ours =
        releasesResult.status === "fulfilled"
          ? (releasesResult.value?.items ?? [])
          : [];

      const items = page.items.length
        ? page.items
        : await api.backend.getNews().catch(() => []);
      if (reqIdRef.current !== reqId) return;

      const outcome = resolveFeedOutcome({
        answered: Boolean(answer),
        itemCount: items.length,
        releaseCount: ours.length,
      });
      setHasError(outcome.hasError);
      setPartialError(outcome.partialError);
      setNews(mergeNewsItems([], items));
      setReleases(ours);
      setCursor(page.nextCursor);
      setUpdatedAt(items.length > 0 || ours.length > 0 ? Date.now() : 0);
      setSponsoredAd(
        sponsoredResult.status === "fulfilled" ? sponsoredResult.value : null,
      );
    } catch {
      if (reqIdRef.current !== reqId) return;
      setHasError(true);
      setPartialError(false);
      setNews([]);
      setReleases([]);
      setCursor(null);
      setSponsoredAd(null);
    } finally {
      if (reqIdRef.current === reqId) setIsLoading(false);
    }
  }, [i18n.language]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;

    const reqId = reqIdRef.current;
    setIsLoadingMore(true);

    try {
      const answer = await api.backend.getNewsPage({
        limit: NEWS_PAGE_SIZE,
        cursor,
      });
      if (reqIdRef.current !== reqId) return;

      if (!answer) {
        showFailureToast(t("news.loadFailed"), undefined, {
          channels: ["backend:getNewsPage"],
          fallbackDescription: t("news.loadFailedHint"),
        });
        return;
      }

      const page = readNewsPage(answer);

      setNews((current) => mergeNewsItems(current, page.items));
      setCursor(page.nextCursor);
    } catch (error) {
      if (reqIdRef.current !== reqId) return;
      showFailureToast(t("news.loadFailed"), error, {
        channels: ["backend:getNewsPage"],
        fallbackDescription: t("news.loadFailedHint"),
      });
    } finally {
      if (reqIdRef.current === reqId) setIsLoadingMore(false);
    }
  }, [cursor, t]);

  useEffect(() => {
    if (!isNetwork) {
      setIsLoading(false);
      setHasError(false);
      setPartialError(false);
      setNews([]);
      setReleases([]);
      setCursor(null);
      setUpdatedAt(0);
      setSponsoredAd(null);
      return;
    }

    void refresh();
  }, [isNetwork, refresh]);

  useEffect(() => {
    const newest = newestTime(cards);
    if (!newest) return;
    window.localStorage.setItem(LAST_SEEN_KEY, String(newest));
  }, [cards]);

  useEffect(() => {
    if (!sponsoredAd) return;
    if (reportedSponsoredImpressions.has(sponsoredAd.id)) return;

    reportedSponsoredImpressions.add(sponsoredAd.id);
    void api.backend.recordSponsoredAdImpression(sponsoredAd.id);
  }, [sponsoredAd]);

  useEffect(() => {
    if (source !== "all" && !sources.includes(source)) setSource("all");
  }, [source, sources]);

  const persistHiddenSponsoredAdIds = useCallback((ids: string[]) => {
    setHiddenSponsoredAdIds(ids);
    window.localStorage.setItem(
      HIDDEN_SPONSORED_ADS_KEY,
      serializeHiddenSponsoredAdIds(ids),
    );
  }, []);

  const hideSponsoredAd = useCallback(
    (ad: ISponsoredNewsAd) => {
      persistHiddenSponsoredAdIds(
        Array.from(new Set([...hiddenSponsoredAdIds, ad.id])),
      );
      setSponsoredAd((current) => (current?.id === ad.id ? null : current));

      toast(t("app.adHidden"), {
        action: {
          label: t("app.restoreAd"),
          onClick: () => {
            const currentIds = parseHiddenSponsoredAdIds(
              window.localStorage.getItem(HIDDEN_SPONSORED_ADS_KEY),
            );
            persistHiddenSponsoredAdIds(
              removeHiddenSponsoredAdId(currentIds, ad.id),
            );
            setSponsoredAd(ad);
          },
        },
      });
    },
    [hiddenSponsoredAdIds, persistHiddenSponsoredAdIds, t],
  );

  const restoreHiddenSponsoredAds = useCallback(() => {
    persistHiddenSponsoredAdIds([]);
    toast.success(t("app.hiddenAdsRestored"));
    void refresh();
  }, [refresh, persistHiddenSponsoredAdIds, t]);

  return {
    isNetwork,
    cards,
    sources,
    source,
    setSource,
    hero,
    secondary,
    rest,
    sponsoredAd,
    hiddenSponsoredAdIds,
    lastSeen,
    unread,
    updatedAt,
    cursor,
    isLoading,
    isLoadingMore,
    hasError,
    partialError,
    refresh,
    loadMore,
    hideSponsoredAd,
    restoreHiddenSponsoredAds,
  };
}
