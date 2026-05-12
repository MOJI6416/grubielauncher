import { INews } from "@/types/News";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, EyeClosed, Loader2, Newspaper, RefreshCcw } from "lucide-react";
import { useAtom } from "jotai";
import { networkAtom } from "@renderer/stores/atoms";
import { useTranslation } from "react-i18next";

const api = window.api;

export function NewsFeed() {
  const [isNetwork] = useAtom(networkAtom);
  const [news, setNews] = useState<INews[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const { t } = useTranslation();

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

  const fetchNews = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setIsLoading(true);

    try {
      const result: INews[] = await api.backend.getNews();
      if (reqIdRef.current !== reqId) return;
      setNews(Array.isArray(result) ? result : []);
    } catch {
      if (reqIdRef.current !== reqId) return;
      setNews([]);
    } finally {
      if (reqIdRef.current === reqId) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isNetwork) {
      setIsLoading(false);
      setNews([]);
      return;
    }

    fetchNews();
  }, [isNetwork, fetchNews]);

  const handleNewsWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!emblaApi || news.length === 0) return;

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
    [emblaApi, news.length],
  );

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
                onClick={() => setIsVisible((v) => !v)}
                aria-label={isVisible ? "Hide news" : "Show news"}
              >
                {!isVisible ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeClosed className="size-4" />
                )}
              </Button>

              {isVisible && (
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
                  {news.length > 0
                    ? news.map((item) => (
                        <div
                          key={item.url}
                          className="min-w-0 shrink-0 grow-0 basis-full sm:basis-[calc((100%-0.5rem)/2)] lg:basis-[calc((100%-2rem)/5)]"
                        >
                          <button
                            type="button"
                            className="group flex h-28 w-full cursor-pointer flex-col overflow-hidden rounded-lg border bg-muted/30 text-left outline-none transition-all hover:border-primary/40 hover:bg-muted/50 hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            onClick={async () => {
                              try {
                                await api.shell.openExternal(item.url);
                              } catch {}
                            }}
                          >
                            <div className="relative h-20 overflow-hidden bg-muted">
                              <img
                                src={item.image}
                                alt={item.imageAltText || item.title}
                                className="h-full w-full object-cover select-none transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                                draggable={false}
                              />
                            </div>
                            <div className="flex min-h-0 flex-1 items-center px-2.5 py-1.5">
                              <p className="truncate text-xs font-medium leading-4 text-foreground select-none">
                                {item.title}
                              </p>
                            </div>
                          </button>
                        </div>
                      ))
                    : [1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className="min-w-0 shrink-0 grow-0 basis-full sm:basis-[calc((100%-0.5rem)/2)] lg:basis-[calc((100%-2rem)/5)]"
                        >
                          <Skeleton className="h-28 w-full rounded-lg" />
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
