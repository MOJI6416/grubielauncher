import { INews, ISponsoredNewsAd } from "@/types/News";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Eye,
  EyeClosed,
  ExternalLink,
  Loader2,
  Newspaper,
  RefreshCcw,
  Undo2,
  X,
} from "lucide-react";
import { useAtom } from "jotai";
import { networkAtom } from "@renderer/stores/atoms";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  buildNewsFeedItems,
  parseHiddenSponsoredAdIds,
  removeHiddenSponsoredAdId,
  serializeHiddenSponsoredAdIds,
} from "@renderer/utilities/newsFeed";

const api = window.api;
const HIDDEN_SPONSORED_ADS_KEY = "grubie:hidden-sponsored-news-ads";
const reportedSponsoredImpressions = new Set<string>();

export function NewsFeed() {
  const [isNetwork] = useAtom(networkAtom);
  const [news, setNews] = useState<INews[]>([]);
  const [sponsoredAd, setSponsoredAd] = useState<ISponsoredNewsAd | null>(null);
  const [hiddenSponsoredAdIds, setHiddenSponsoredAdIds] = useState<string[]>(
    () =>
      parseHiddenSponsoredAdIds(
        window.localStorage.getItem(HIDDEN_SPONSORED_ADS_KEY),
      ),
  );
  const [isVisible, setIsVisible] = useState(
    () => localStorage.getItem("newsFeedVisible") === "true",
  );
  const [isLoading, setIsLoading] = useState(false);

  const { t, i18n } = useTranslation();

  const autoplayRef = useRef(
    Autoplay({
      delay: 10000,
      stopOnInteraction: false,
      stopOnMouseEnter: true,
    }),
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      align: "start",
      containScroll: "trimSnaps",
      dragFree: false,
      loop: false,
      slidesToScroll: 1,
    },
    [autoplayRef.current],
  );

  const reqIdRef = useRef(0);
  const wheelLockRef = useRef(0);

  const feedItems = useMemo(
    () => buildNewsFeedItems(news, sponsoredAd),
    [news, sponsoredAd],
  );

  const fetchNews = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    const hiddenIds = parseHiddenSponsoredAdIds(
      window.localStorage.getItem(HIDDEN_SPONSORED_ADS_KEY),
    );
    setHiddenSponsoredAdIds(hiddenIds);

    try {
      const [newsResult, sponsoredResult] = await Promise.allSettled([
        api.backend.getNews(),
        api.backend.getSponsoredNewsAd(i18n.language, hiddenIds),
      ]);
      if (reqIdRef.current !== reqId) return;

      setNews(
        newsResult.status === "fulfilled" && Array.isArray(newsResult.value)
          ? newsResult.value
          : [],
      );
      setSponsoredAd(
        sponsoredResult.status === "fulfilled" ? sponsoredResult.value : null,
      );
    } catch {
      if (reqIdRef.current !== reqId) return;
      setNews([]);
      setSponsoredAd(null);
    } finally {
      if (reqIdRef.current === reqId) setIsLoading(false);
    }
  }, [i18n.language]);

  useEffect(() => {
    if (!isNetwork) {
      setIsLoading(false);
      setNews([]);
      setSponsoredAd(null);
      return;
    }

    fetchNews();
  }, [isNetwork, fetchNews]);

  useEffect(() => {
    if (!isVisible || !sponsoredAd) return;
    if (reportedSponsoredImpressions.has(sponsoredAd.id)) return;

    reportedSponsoredImpressions.add(sponsoredAd.id);
    void api.backend.recordSponsoredAdImpression(sponsoredAd.id);
  }, [isVisible, sponsoredAd]);

  const handleNewsWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!emblaApi || feedItems.length === 0) return;

      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (Math.abs(delta) < 8) return;

      event.preventDefault();

      const now = Date.now();
      if (now - wheelLockRef.current < 240) return;
      wheelLockRef.current = now;

      if (delta > 0) emblaApi.scrollNext();
      else emblaApi.scrollPrev();
    },
    [emblaApi, feedItems.length],
  );

  const persistHiddenSponsoredAdIds = useCallback((ids: string[]) => {
    setHiddenSponsoredAdIds(ids);
    window.localStorage.setItem(
      HIDDEN_SPONSORED_ADS_KEY,
      serializeHiddenSponsoredAdIds(ids),
    );
  }, []);

  const handleHideSponsoredAd = useCallback(
    (ad: ISponsoredNewsAd) => {
      const nextIds = Array.from(new Set([...hiddenSponsoredAdIds, ad.id]));
      persistHiddenSponsoredAdIds(nextIds);
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

  const handleRestoreHiddenSponsoredAds = useCallback(() => {
    persistHiddenSponsoredAdIds([]);
    toast.success(t("app.hiddenAdsRestored"));
    void fetchNews();
  }, [fetchNews, persistHiddenSponsoredAdIds, t]);

  return (
    <>
      {isNetwork && (
        <section className="mx-4 mb-3 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div
            className={`flex items-center justify-between gap-3 px-3 py-2 ${
              isVisible ? "border-b" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                <Newspaper className="size-4 text-muted-foreground" />
              </span>
              <p className="truncate text-base font-semibold">
                {t("app.newsFeed")}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="secondary"
                disabled={isLoading}
                onClick={() =>
                  setIsVisible((v) => {
                    localStorage.setItem("newsFeedVisible", String(!v));
                    return !v;
                  })
                }
                aria-label={isVisible ? "Hide news" : "Show news"}
              >
                {!isVisible ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeClosed className="size-4" />
                )}
              </Button>

              {isVisible && (
                <>
                  <TooltipProvider delayDuration={250}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            size="icon"
                            variant="secondary"
                            disabled={
                              isLoading || hiddenSponsoredAdIds.length === 0
                            }
                            onClick={handleRestoreHiddenSponsoredAds}
                            aria-label={t("app.restoreHiddenAds")}
                          >
                            <Undo2 className="size-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("app.restoreHiddenAds")}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <Button
                    size="icon"
                    variant="secondary"
                    disabled={isLoading}
                    onClick={fetchNews}
                    aria-label="Refresh news"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="size-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>

          {isVisible && (
            <div className="px-3 pb-3">
              <div
                className="overflow-hidden"
                ref={emblaRef}
                onWheel={handleNewsWheel}
              >
                <div className="flex gap-2 pt-3">
                  {feedItems.length > 0
                    ? feedItems.map((feedItem, index) => (
                        <div
                          key={
                            feedItem.type === "news"
                              ? `news-${index}-${feedItem.item.url}`
                              : `sponsored-${feedItem.item.id}`
                          }
                          className="min-w-0 shrink-0 grow-0 basis-full sm:basis-[calc((100%-0.5rem)/2)] lg:basis-[calc((100%-2rem)/5)]"
                        >
                          {feedItem.type === "news" ? (
                            <button
                              type="button"
                              className="group relative block h-24 w-full cursor-pointer overflow-hidden rounded-lg border text-left outline-none transition-all hover:border-primary/40 hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              onClick={async () => {
                                try {
                                  await api.shell.openExternal(
                                    feedItem.item.url,
                                  );
                                } catch {}
                              }}
                            >
                              <img
                                src={feedItem.item.image}
                                alt={
                                  feedItem.item.imageAltText ||
                                  feedItem.item.title
                                }
                                className="absolute inset-0 h-full w-full object-cover select-none transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                draggable={false}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                              <ExternalLink className="absolute right-2 top-2 size-3.5 text-white/80 opacity-0 transition-opacity group-hover:opacity-100" />
                              <div className="absolute inset-x-0 bottom-0 p-2.5">
                                {feedItem.item.author && (
                                  <p className="truncate text-[10px] font-medium tracking-wide text-white/70 uppercase select-none">
                                    {feedItem.item.author}
                                  </p>
                                )}
                                <p className="line-clamp-2 text-xs font-medium leading-4 text-white select-none">
                                  {feedItem.item.title}
                                </p>
                              </div>
                            </button>
                          ) : (
                            <div className="group relative h-24 overflow-hidden rounded-lg border transition-all hover:border-primary/40 hover:shadow-sm">
                              <button
                                type="button"
                                className="block h-full w-full cursor-pointer text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                onClick={async () => {
                                  try {
                                    await api.backend.recordSponsoredAdClick(
                                      feedItem.item.id,
                                    );
                                    await api.shell.openExternal(
                                      feedItem.item.targetUrl,
                                    );
                                  } catch {}
                                }}
                              >
                                {feedItem.item.image ? (
                                  <img
                                    src={feedItem.item.image}
                                    alt={feedItem.item.title}
                                    className="absolute inset-0 h-full w-full object-cover select-none transition-transform duration-300 group-hover:scale-105"
                                    loading="lazy"
                                    draggable={false}
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                    <Newspaper className="size-6 text-muted-foreground" />
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
                                <Badge className="absolute left-2 top-2 h-4 px-1.5 text-[10px]">
                                  {t("app.sponsored")}
                                </Badge>
                                <div className="absolute inset-x-0 bottom-0 p-2.5">
                                  <p className="line-clamp-1 text-xs font-medium leading-4 text-white select-none">
                                    {feedItem.item.title}
                                  </p>
                                  <p className="flex items-center gap-1 truncate text-[10px] leading-3 text-white/70 select-none">
                                    <span className="truncate">
                                      {feedItem.item.cta}
                                    </span>
                                    <ExternalLink className="size-3 shrink-0" />
                                  </p>
                                </div>
                              </button>
                              <Button
                                type="button"
                                size="icon-xs"
                                variant="secondary"
                                className="absolute right-1.5 top-1.5 opacity-90"
                                aria-label={t("app.hideAd")}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleHideSponsoredAd(feedItem.item);
                                }}
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    : [1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className="min-w-0 shrink-0 grow-0 basis-full sm:basis-[calc((100%-0.5rem)/2)] lg:basis-[calc((100%-2rem)/5)]"
                        >
                          <Skeleton className="h-24 w-full rounded-lg" />
                        </div>
                      ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
