import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  CircleAlert,
  CloudOff,
  Loader2,
  Newspaper,
  RefreshCcw,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { formatRelative } from "@renderer/utilities/date";
import { NewsCard } from "@renderer/features/news/feed";
import {
  GridCard,
  HeroCard,
  ListCard,
  SponsoredCard,
} from "@renderer/features/news/NewsCards";
import { MilestoneNewsCard } from "@renderer/features/news/MilestoneNewsCard";
import { NewsBodySkeleton } from "@renderer/features/news/NewsFeedSkeleton";
import { useNewsFeed } from "@renderer/features/news/useNewsFeed";
import { showMilestoneInFeed } from "@renderer/features/whatsNew/milestone";
import { useCurrentRelease } from "@renderer/features/whatsNew/useCurrentRelease";

export function NewsScreen() {
  const { t } = useTranslation();
  const {
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
  } = useNewsFeed();

  const currentRelease = useCurrentRelease();
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const markImageFailed = useCallback((url?: string) => {
    if (!url) return;
    setFailedImages((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }, []);

  const showSource = sources.length > 1;
  const cardProps = (card: NewsCard) => ({
    card,
    showSource,
    isNew: lastSeen > 0 && card.time > lastSeen,
    failed: failedImages.has(card.item.image),
    onFailed: () => markImageFailed(card.item.image),
  });

  const body = !isNetwork ? (
    <Empty className="h-full border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CloudOff />
        </EmptyMedia>
        <EmptyTitle>{t("news.offlineTitle")}</EmptyTitle>
        <EmptyDescription>{t("news.offlineHint")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  ) : isLoading && !cards.length ? (
    <NewsBodySkeleton />
  ) : !cards.length ? (
    <Empty className="h-full border border-dashed border-border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Newspaper />
        </EmptyMedia>
        <EmptyTitle>
          {hasError ? t("news.loadFailed") : t("news.empty")}
        </EmptyTitle>
        <EmptyDescription>
          {hasError ? t("news.loadFailedHint") : t("news.emptyHint")}
        </EmptyDescription>
      </EmptyHeader>
      {hasError && (
        <Button variant="secondary" onClick={() => void refresh()}>
          <RefreshCcw />
          {t("news.retry")}
        </Button>
      )}
    </Empty>
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="grid grid-cols-12 gap-3">
        {hero && (
          <div className="col-span-7 h-[15rem]">
            <HeroCard {...cardProps(hero)} />
          </div>
        )}

        <div className="col-span-5 flex flex-col gap-3">
          {secondary.map((card) => (
            <ListCard key={card.key} {...cardProps(card)} />
          ))}

          {sponsoredAd && (
            <SponsoredCard
              ad={sponsoredAd}
              failed={failedImages.has(sponsoredAd.image)}
              onFailed={() => markImageFailed(sponsoredAd.image)}
              onHide={() => hideSponsoredAd(sponsoredAd)}
            />
          )}
        </div>
      </div>

      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-3">
          {rest.map((card) => (
            <GridCard key={card.key} {...cardProps(card)} />
          ))}
        </div>
      )}

      {cursor && (
        <Button
          variant="outline"
          className="mt-3 h-9 w-full"
          disabled={isLoadingMore}
          onClick={() => void loadMore()}
        >
          {isLoadingMore ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ChevronDown className="size-4" />
          )}
          {t("news.loadMore")}
        </Button>
      )}
    </div>
  );

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex h-8 shrink-0 items-center gap-2">
        {unread > 0 && (
          <span className="flex h-6 shrink-0 items-center rounded-md bg-success/15 px-2 text-[0.7rem] font-medium text-success">
            {t("news.unread", { count: unread })}
          </span>
        )}

        {showSource && (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
            {(["all", ...sources] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={source === value}
                onClick={() => setSource(value)}
                className="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground"
              >
                {value === "all"
                  ? t("news.sources.all")
                  : t(`news.sources.${value}`)}
              </button>
            ))}
          </div>
        )}

        {partialError ? (
          <Hint content={t("news.loadFailedHint")}>
            <span className="flex h-6 min-w-0 items-center gap-1 rounded-md bg-warning/15 px-2 text-[0.7rem] font-medium text-warning">
              <CircleAlert className="size-3 shrink-0" />
              <span className="min-w-0 truncate">
                {t("news.partialFailed")}
              </span>
            </span>
          </Hint>
        ) : (
          updatedAt > 0 && (
            <span className="min-w-0 truncate text-[0.7rem] text-faint">
              {t("news.updated", {
                value: formatRelative(new Date(updatedAt)),
              })}
            </span>
          )
        )}

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {hiddenSponsoredAdIds.length > 0 && (
            <Hint content={t("app.restoreHiddenAds")}>
              <Button
                size="icon"
                variant="ghost"
                disabled={isLoading}
                onClick={restoreHiddenSponsoredAds}
                aria-label={t("app.restoreHiddenAds")}
              >
                <Undo2 className="size-4" />
              </Button>
            </Hint>
          )}

          <Hint content={t("news.refresh")}>
            <Button
              size="icon"
              variant="secondary"
              disabled={isLoading || !isNetwork}
              onClick={() => void refresh()}
              aria-label={t("news.refresh")}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCcw className="size-4" />
              )}
            </Button>
          </Hint>
        </span>
      </header>

      {currentRelease && showMilestoneInFeed(currentRelease) && (
        <MilestoneNewsCard release={currentRelease} />
      )}

      {body}
    </section>
  );
}
