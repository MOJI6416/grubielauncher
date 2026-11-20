import { type CSSProperties, memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Camera, ImageOff, Play, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Hint } from "@renderer/components/Hint";
import { SortMenu } from "@renderer/components/SortMenu";
import { navigate } from "@renderer/navigation/navigate";
import { formatNumber } from "@renderer/utilities/numbers";
import { countFeature } from "@renderer/features/usage/usage";
import { screenshotLabel } from "@renderer/features/instances/instanceOverview";
import {
  ScreenshotViewer,
  type ViewerShot,
} from "@renderer/features/instances/ScreenshotViewer";
import {
  FEED_SORTS,
  type FeedShot,
  type FeedSort,
  feedInstances,
  filterFeed,
  sortFeed,
} from "./feedModel";
import { useScreenshotFeed } from "./useScreenshotFeed";
import { useThumbnail } from "./thumbnails";

const GAP = 8;
const MIN_TILE = 200;
const ALL = "__all__";

const Tile = memo(function Tile({
  shot,
  onOpen,
}: {
  shot: FeedShot;
  onOpen: (shot: FeedShot) => void;
}) {
  const { url, failed } = useThumbnail(shot.path);
  const label = screenshotLabel(shot.name);

  return (
    <button
      type="button"
      aria-label={`${shot.instanceName} · ${label}`}
      onClick={() => onOpen(shot)}
      className="group relative size-full overflow-hidden rounded-lg border border-border bg-surface-3 text-left transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
        />
      ) : failed ? (
        <span className="flex size-full items-center justify-center text-faint">
          <ImageOff className="size-5" />
        </span>
      ) : (
        <Skeleton className="size-full rounded-none" />
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-end gap-2 bg-gradient-to-t from-background/90 to-transparent px-2 pt-6 pb-1.5">
        <Hint content={shot.instanceName} variant="text" truncatedOnly>
          <span className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground">
            {shot.instanceName}
          </span>
        </Hint>
        <span className="shrink-0 font-mono text-3xs whitespace-nowrap text-muted-foreground tabular-nums">
          {label}
        </span>
      </span>
    </button>
  );
});

export function ScreenshotFeed({ instance }: { instance?: string }) {
  const { t, i18n } = useTranslation();
  const { shots } = useScreenshotFeed();
  const [query, setQuery] = useState("");
  const [instanceKey, setInstanceKey] = useState(instance ?? "");
  const [sort, setSort] = useState<FeedSort>("newest");
  const [viewing, setViewing] = useState<string | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  const instances = useMemo(() => feedInstances(shots ?? []), [shots]);
  const visible = useMemo(
    () => sortFeed(filterFeed(shots ?? [], { query, instanceKey }), sort),
    [instanceKey, query, shots, sort],
  );
  const viewerShots = useMemo<ViewerShot[]>(
    () =>
      visible.map((shot) => ({
        name: shot.name,
        path: shot.path,
        folder: shot.folder,
        caption: `${shot.instanceName} · ${shot.name}`,
      })),
    [visible],
  );

  useEffect(() => {
    setInstanceKey(instance ?? "");
  }, [instance]);

  useEffect(() => {
    if (!shots || !instanceKey) return;
    if (!instances.some((entry) => entry.key === instanceKey)) {
      setInstanceKey("");
    }
  }, [instanceKey, instances, shots]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  const columns = Math.max(3, Math.floor((width + GAP) / (MIN_TILE + GAP)));
  const tileWidth = width ? (width - GAP * (columns - 1)) / columns : MIN_TILE;
  const rowHeight = Math.round((tileWidth * 9) / 16) + GAP;
  const rows = Math.ceil(visible.length / columns);

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => scroller,
    estimateSize: () => rowHeight,
    overscan: 2,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, virtualizer]);

  const open = (shot: FeedShot) => {
    countFeature("screenshots.view");
    setViewing(shot.path);
  };

  const total = shots?.length ?? 0;
  const isLoading = shots === null;
  const isFiltered = query.trim() !== "" || instanceKey !== "";

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <header className="flex h-8 shrink-0 items-center gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            disabled={total === 0}
            className="h-8 pl-8"
            placeholder={t("screenshots.feed.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <Select
          value={instanceKey || ALL}
          disabled={instances.length === 0}
          onValueChange={(value) => setInstanceKey(value === ALL ? "" : value)}
        >
          <SelectTrigger size="sm" className="w-56 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("screenshots.feed.allInstances")}</SelectItem>
            {instances.map((entry) => (
              <SelectItem key={entry.key} value={entry.key}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate">{entry.name}</span>
                  <span className="shrink-0 font-mono text-2xs text-faint tabular-nums">
                    {formatNumber(entry.count, i18n.language)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SortMenu
          value={sort}
          disabled={total === 0}
          options={FEED_SORTS.map((value) => ({
            value,
            label: t(`screenshots.feed.sort.${value}`),
          }))}
          onChange={setSort}
        />

        <span className="shrink-0 text-xs whitespace-nowrap text-faint tabular-nums">
          {t("screenshots.feed.count", {
            count: visible.length,
            formatted: formatNumber(visible.length, i18n.language),
          })}
        </span>
      </header>

      <div
        ref={setScroller}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns * 3 }).map((_, index) => (
              <Skeleton key={index} className="aspect-video rounded-lg" />
            ))}
          </div>
        ) : total === 0 ? (
          <Empty className="h-full rounded-xl border border-solid border-border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Camera />
              </EmptyMedia>
              <EmptyTitle>{t("versions.screenshots.empty")}</EmptyTitle>
              <EmptyDescription>{t("screenshots.feed.emptyHint")}</EmptyDescription>
            </EmptyHeader>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ name: "home" })}
            >
              <Play className="size-3.5" />
              {t("screenshots.feed.toInstances")}
            </Button>
          </Empty>
        ) : visible.length === 0 ? (
          <Empty className="h-full rounded-xl border border-solid border-border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t("common.notFound")}</EmptyTitle>
            </EmptyHeader>
            {isFiltered && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setInstanceKey("");
                }}
              >
                {t("common.clearSearch")}
              </Button>
            )}
          </Empty>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((row) => (
              <div
                key={row.index}
                className="absolute top-0 left-0 grid w-full gap-2"
                style={
                  {
                    height: `${rowHeight - GAP}px`,
                    transform: `translateY(${row.start}px)`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  } as CSSProperties
                }
              >
                {visible
                  .slice(row.index * columns, row.index * columns + columns)
                  .map((shot) => (
                    <Tile key={shot.path} shot={shot} onOpen={open} />
                  ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <ScreenshotViewer
          shots={viewerShots}
          initialPath={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}
