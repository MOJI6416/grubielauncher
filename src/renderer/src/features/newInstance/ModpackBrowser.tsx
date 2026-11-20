import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CircleAlert,
  Download,
  HardDriveDownload,
  Images,
  Loader2,
  Package,
  RotateCw,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import { Hint } from "@renderer/components/Hint";
import { RemoteGalleryViewer } from "@renderer/components/mediaViewer/RemoteGalleryViewer";
import type { Loader } from "@/types/Loader";
import type { IVersion as IGameVersion } from "@/types/IVersion";
import {
  IProject,
  IProjectAuthor,
  IVersion as IProjectVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { settingsAtom } from "@renderer/stores/atoms";
import { LoaderLabel } from "@renderer/components/Loaders";
import {
  useCatalogMeta,
  useCatalogSearch,
} from "@renderer/features/mods/useCatalogSearch";
import { formatDate } from "@renderer/features/mods/format";
import { formatCompactNumber } from "@renderer/utilities/numbers";
import { cn } from "@/lib/utils";
import type { ModpackDownloadStage } from "./downloadModpack";
import { PackStageProgress } from "./PackStageProgress";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { SlidingIndicator } from "@renderer/components/SlidingIndicator";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { PackContentList } from "./PackContentList";
import { usePackContents } from "./usePackContents";

const api = window.api;

const VERSIONS_CHANNEL = "modManager:getVersions";
const CATALOG_LOADERS: Loader[] = ["forge", "neoforge", "fabric", "quilt"];
const MODRINTH_ONLY_LOADERS: Loader[] = ["legacy-fabric", "babric", "ornithe"];
const ROW_HEIGHT = 60;
const DETAIL_TABS = ["overview", "contents"] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

interface DetailState {
  project: IProject | null;
  versions: IProjectVersion[];
  selectedId: string | null;
  isLoading: boolean;
  failed: boolean;
  loadFailed: boolean;
}

const EMPTY_DETAIL: DetailState = {
  project: null,
  versions: [],
  selectedId: null,
  isLoading: false,
  failed: false,
  loadFailed: false,
};

function providerName(provider: Provider): string {
  return provider === Provider.CURSEFORGE ? "CurseForge" : "Modrinth";
}

export function ModpackBrowser({
  isBusy,
  offlineReason,
  stage,
  progressPercent,
  extractPercent,
  onPick,
}: {
  isBusy: boolean;
  offlineReason: string | null;
  stage: ModpackDownloadStage;
  progressPercent: number;
  extractPercent: number | null;
  onPick: (project: IProject, version: IProjectVersion) => void;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const language = settings.lang || "en";

  const [provider, setProvider] = useState<Provider>(Provider.CURSEFORGE);
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");
  const [gameVersion, setGameVersion] = useState("");
  const [loader, setLoader] = useState<Loader | undefined>();
  const [author, setAuthor] = useState<IProjectAuthor | null>(null);
  const [gameVersions, setGameVersions] = useState<IGameVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const tabIndicator = useSlidingIndicator<HTMLDivElement>();
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  const detailRequestRef = useRef(0);
  const versionsFailedAtRef = useRef(0);
  const meta = useCatalogMeta(provider, ProjectType.MODPACK, true);

  useEffect(() => {
    return api.events.onIpcError((payload) => {
      if (payload?.channel !== VERSIONS_CHANNEL) return;

      versionsFailedAtRef.current = Date.now();
      setDetail((prev) =>
        prev.isLoading || !prev.failed || prev.loadFailed
          ? prev
          : { ...prev, loadFailed: true },
      );
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 350);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    setSort(meta.sorts[0] ?? "");
  }, [meta.sorts, provider]);

  useEffect(() => {
    let cancelled = false;

    void api.versions
      .getList("vanilla")
      .then((list) => {
        if (!cancelled) setGameVersions(list ?? []);
      })
      .catch(ignoreFailure);

    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useCatalogSearch(
    {
      provider,
      projectType: ProjectType.MODPACK,
      query,
      sort,
      filters: [],
      gameVersion: gameVersion || undefined,
      loader,
      author: author?.id,
    },
    meta.isReady,
  );

  const items = catalog.items;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isResultWave = useEntranceWave(catalog.isLoading);
  const lastVisible = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (!catalog.hasMore || catalog.isLoading || catalog.isLoadingMore) return;
    if (lastVisible < items.length - 4) return;

    catalog.loadMore();
  }, [catalog, items.length, lastVisible]);

  const openDetail = useCallback(
    async (project: IProject) => {
      const requestId = ++detailRequestRef.current;

      setActiveId(project.id);
      setDetail({
        ...EMPTY_DETAIL,
        project,
        isLoading: true,
      });

      const startedAt = Date.now();

      const [versions, info] = await Promise.all([
        api.modManager
          .getVersions(project.provider, project.id, {
            projectType: ProjectType.MODPACK,
            loader,
            version: gameVersion || undefined,
            modUrl: project.url,
          })
          .catch(ignoreFailure)
          .then((list): IProjectVersion[] => list ?? []),
        api.modManager
          .getProject(project.provider, project.id)
          .catch(ignoreFailure)
          .then((value) => value ?? null),
      ]);

      if (requestId !== detailRequestRef.current) return;

      const loadFailed =
        versions.length === 0 && versionsFailedAtRef.current >= startedAt;

      setDetail({
        project: info ? { ...project, ...info } : project,
        versions,
        selectedId: versions[0]?.id ?? null,
        isLoading: false,
        failed: versions.length === 0,
        loadFailed,
      });
    },
    [gameVersion, loader],
  );

  useEffect(() => {
    detailRequestRef.current += 1;
    setActiveId(null);
    setDetail(EMPTY_DETAIL);
  }, [provider, query, gameVersion, loader, sort, author]);

  const filterByAuthor = (next: IProjectAuthor) => {
    setAuthor(next);
    setRawQuery("");
    setQuery("");
  };

  const selectedVersion = useMemo(
    () => detail.versions.find((item) => item.id === detail.selectedId) ?? null,
    [detail.selectedId, detail.versions],
  );

  const contents = usePackContents(
    detailTab === "contents" ? detail.project : null,
    selectedVersion,
  );

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = DETAIL_TABS.indexOf(detailTab);
    const target =
      event.key === "ArrowRight" || event.key === "ArrowLeft"
        ? (index + 1) % DETAIL_TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? DETAIL_TABS.length - 1
            : null;
    if (target === null) return;

    event.preventDefault();
    setDetailTab(DETAIL_TABS[target]);
    tabIndicator.containerRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      ?.item(target)
      ?.focus();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl
          value={provider}
          disabled={isBusy}
          ariaLabel={t("modManager.source")}
          options={[Provider.CURSEFORGE, Provider.MODRINTH].map((item) => ({
            value: item,
            label: providerName(item),
            icon: <ContentProviderIcon provider={item} className="size-4" />,
          }))}
          onChange={(item) => {
            if (item !== provider) setAuthor(null);
            setProvider(item);
            if (
              item !== Provider.MODRINTH &&
              loader &&
              MODRINTH_ONLY_LOADERS.includes(loader)
            ) {
              setLoader(undefined);
            }
          }}
        />

        <div className="relative min-w-28 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={rawQuery}
            disabled={isBusy}
            className="h-8 pr-8 pl-8"
            placeholder={t("browser.search")}
            onChange={(event) => setRawQuery(event.target.value)}
          />
          {(catalog.isLoading || !meta.isReady) && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
          )}
        </div>

        <div className="w-32 shrink-0">
          <VirtualizedSelect
            size="sm"
            aria-label={t("versions.version")}
            value={gameVersion}
            placeholder={t("versions.version")}
            searchPlaceholder={t("common.search")}
            emptyText={t("common.notFound")}
            disabled={isBusy}
            options={[
              { value: "", label: t("newInstance.anyVersion") },
              ...gameVersions.map((item) => ({
                value: item.id,
                label: item.id,
              })),
            ]}
            onValueChange={setGameVersion}
          />
        </div>

        <Select
          value={loader ?? "any"}
          disabled={isBusy}
          onValueChange={(value) =>
            setLoader(value === "any" ? undefined : (value as Loader))
          }
        >
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">{t("newInstance.anyLoader")}</SelectItem>
            {[
              ...CATALOG_LOADERS,
              ...(provider === Provider.MODRINTH ? MODRINTH_ONLY_LOADERS : []),
            ].map((item) => (
              <SelectItem key={item} value={item}>
                <LoaderLabel loader={item} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SortMenu
          value={sort}
          disabled={isBusy || meta.sorts.length === 0}
          options={meta.sorts.map((value) => ({
            value,
            label: t(`modManager.sorts.${value}`),
          }))}
          onChange={setSort}
        />
      </div>

      {author && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={isBusy}
            className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-surface-2 px-2 text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground disabled:opacity-50"
            onClick={() => setAuthor(null)}
          >
            {t("modManager.authorFilter", { name: author.name })}
            <X className="size-3" />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-3">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          <div
            ref={setScrollElement}
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {items.length === 0 &&
            (catalog.isLoading || !meta.isReady) &&
            !offlineReason ? (
              <ListSkeleton
                rows={9}
                rowClassName="h-[60px]"
                iconClassName="size-11 rounded-lg"
              />
            ) : items.length === 0 ? (
              <Empty className="h-full px-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {catalog.error || offlineReason ? (
                      <CircleAlert className="text-destructive" />
                    ) : (
                      <Search />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {offlineReason
                      ? t("shell.offline.internet")
                      : catalog.error
                        ? t("modManager.searchFailedSource", {
                            source: providerName(provider),
                          })
                        : t("common.notFound")}
                  </EmptyTitle>
                  <EmptyDescription className="max-w-64 text-xs">
                    {offlineReason ??
                      (catalog.error
                        ? t("modManager.searchFailedSourceHint")
                        : query.trim()
                          ? t("modManager.notFoundHint")
                          : gameVersion || loader
                            ? t("newInstance.modpacksNoneForFilters")
                            : author
                              ? t("newInstance.modpacksNoneForAuthor")
                              : t("newInstance.modpacksCatalogEmpty", {
                                  source: providerName(provider),
                                }))}
                  </EmptyDescription>
                </EmptyHeader>
                {(catalog.error ||
                  !(query.trim() || gameVersion || loader || author)) &&
                  !offlineReason && (
                  <EmptyContent>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={catalog.reload}
                    >
                      <RotateCw />
                      {t("common.retry")}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              <div
                className={cn("relative w-full", isResultWave && "result-wave")}
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((row) => {
                  const project = items[row.index];
                  if (!project) return null;

                  const downloads = formatCompactNumber(
                    project.stats?.downloads,
                    language,
                  );
                  const updated = formatDate(
                    project.stats?.dateModified,
                    language,
                  );

                  return (
                    <button
                      key={`${project.provider}-${project.id}`}
                      type="button"
                      disabled={isBusy}
                      aria-selected={activeId === project.id}
                      data-wave-row
                      style={
                        {
                          height: `${row.size}px`,
                          transform: `translateY(${row.start}px)`,
                          "--wave-index": row.index,
                        } as CSSProperties
                      }
                      onClick={() => void openDetail(project)}
                      className="absolute top-0 left-0 flex w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-row-hover aria-selected:bg-row-selected disabled:cursor-not-allowed"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
                        {project.iconUrl ? (
                          <img
                            src={project.iconUrl}
                            alt=""
                            draggable={false}
                            className="size-full object-cover"
                          />
                        ) : (
                          <Package className="size-4 text-faint" />
                        )}
                      </span>

                      <Hint
                        variant="text"
                        truncatedOnly
                        content={
                          <span className="flex flex-col gap-0.5">
                            <span className="font-medium">{project.title}</span>
                            {project.description && (
                              <span>{project.description}</span>
                            )}
                          </span>
                        }
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground">
                            {project.title}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {project.author && (
                              <span className="text-faint">
                                {project.author.name} ·{" "}
                              </span>
                            )}
                            {project.description}
                          </span>
                        </span>
                      </Hint>

                      <span className="flex shrink-0 flex-col items-end gap-0.5 text-2xs text-faint">
                        {downloads && (
                          <span className="flex items-center gap-1 font-mono tabular-nums">
                            <Download className="size-3" />
                            {downloads}
                          </span>
                        )}
                        {updated && <span>{updated}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {catalog.isLoadingMore && (
            <div className="flex h-7 shrink-0 items-center justify-center gap-2 border-t border-border text-2xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("common.searching")}
            </div>
          )}
        </section>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          {!detail.project ? (
            <Empty className="h-full px-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Package />
                </EmptyMedia>
                <EmptyDescription className="text-xs">
                  {t("newInstance.pickModpackHint")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="flex shrink-0 items-center border-b border-border px-2.5">
                <div
                  ref={tabIndicator.containerRef}
                  role="tablist"
                  aria-label={detail.project.title}
                  onKeyDown={handleTabKeyDown}
                  className="relative flex shrink-0 items-center gap-1"
                >
                  {DETAIL_TABS.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      role="tab"
                      aria-selected={detailTab === entry}
                      tabIndex={detailTab === entry ? 0 : -1}
                      data-indicator-active={detailTab === entry}
                      onClick={() => setDetailTab(entry)}
                      className="-mb-px border-b-2 border-transparent px-2 py-2 text-xs whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-selected:text-foreground"
                    >
                      {t(`packContent.tabs.${entry}`)}
                      {entry === "contents" && contents.items.length > 0 && (
                        <span className="ml-1 font-mono text-3xs text-faint">
                          {contents.items.length}
                        </span>
                      )}
                    </button>
                  ))}
                  <SlidingIndicator indicator={tabIndicator} variant="underline" />
                </div>
              </div>

              {detailTab === "contents" ? (
                contents.status === "failed" ? (
                  <Empty className="min-h-0 flex-1 gap-2 px-6">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CircleAlert className="text-destructive" />
                      </EmptyMedia>
                      <EmptyDescription className="text-xs">
                        {t("packContent.failed", {
                          site: providerName(detail.project.provider),
                        })}
                      </EmptyDescription>
                    </EmptyHeader>
                    <Button size="sm" variant="outline" onClick={contents.retry}>
                      <RotateCw />
                      {t("common.retry")}
                    </Button>
                  </Empty>
                ) : (
                  <PackContentList
                    title={t("addVersion.preview.content")}
                    items={contents.items}
                    isLoading={contents.status === "loading" || detail.isLoading}
                    emptyText={t("packContent.empty")}
                    className="rounded-none border-0 bg-transparent"
                  />
                )
              ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {detail.project.gallery?.[0]?.url && (
                  <button
                    type="button"
                    aria-label={t("common.gallery")}
                    className="group relative h-28 w-full shrink-0 overflow-hidden border-b border-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => setGalleryOpen(true)}
                  >
                    <img
                      src={detail.project.gallery[0].url}
                      alt=""
                      draggable={false}
                      className="size-full object-cover transition-opacity group-hover:opacity-85"
                    />
                    {detail.project.gallery.length > 1 && (
                      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md border border-border bg-surface-1/90 px-1.5 py-0.5 text-3xs text-muted-foreground">
                        <Images className="size-3" />
                        <span className="font-mono tabular-nums">
                          {detail.project.gallery.length}
                        </span>
                      </span>
                    )}
                  </button>
                )}
                {isGalleryOpen && detail.project.gallery?.length > 0 && (
                  <RemoteGalleryViewer
                    images={detail.project.gallery}
                    startIndex={0}
                    title={detail.project.title}
                    onClose={() => setGalleryOpen(false)}
                  />
                )}

                <div className="flex shrink-0 items-start gap-2.5 p-2.5">
                  <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2">
                    {detail.project.iconUrl ? (
                      <img
                        src={detail.project.iconUrl}
                        alt=""
                        draggable={false}
                        className="size-full object-cover"
                      />
                    ) : (
                      <Package className="size-5 text-faint" />
                    )}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Hint
                      content={detail.project.title}
                      variant="text"
                      truncatedOnly
                    >
                      <span className="truncate text-sm font-semibold text-foreground">
                        {detail.project.title}
                      </span>
                    </Hint>
                    <span className="flex items-center gap-2 text-2xs text-faint">
                      <ContentProviderIcon
                        provider={detail.project.provider}
                        className="size-3"
                      />
                      {detail.project.author && (
                        <Hint
                          content={t("modManager.authorProjects", {
                            name: detail.project.author.name,
                          })}
                          className="max-w-64"
                        >
                          <button
                            type="button"
                            className="flex max-w-36 min-w-0 items-center gap-1 rounded-sm transition-colors hover:text-foreground"
                            onClick={() => {
                              const next = detail.project?.author;
                              if (next && !isBusy) filterByAuthor(next);
                            }}
                          >
                            <UserRound className="size-3 shrink-0" />
                            <span className="truncate">
                              {detail.project.author.name}
                            </span>
                          </button>
                        </Hint>
                      )}
                      {formatCompactNumber(
                        detail.project.stats?.downloads,
                        language,
                      ) && (
                        <span className="font-mono tabular-nums">
                          {formatCompactNumber(
                            detail.project.stats?.downloads,
                            language,
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <p className="px-2.5 pb-2.5 text-xs leading-snug text-muted-foreground">
                  {detail.project.description}
                </p>

                <dl className="mt-auto divide-y divide-border/60 border-t border-border/60">
                  {[
                    {
                      key: "downloads",
                      label: t("newInstance.stats.downloads"),
                      value: detail.project.stats?.downloads
                        ? formatCompactNumber(
                            detail.project.stats.downloads,
                            language,
                          )
                        : null,
                    },
                    {
                      key: "follows",
                      label: t("newInstance.stats.follows"),
                      value: detail.project.stats?.follows
                        ? formatCompactNumber(
                            detail.project.stats.follows,
                            language,
                          )
                        : null,
                    },
                    {
                      key: "updated",
                      label: t("modManager.statsUpdated"),
                      value: formatDate(
                        detail.project.stats?.dateModified,
                        language,
                      ),
                    },
                  ]
                    .filter((row) => !!row.value)
                    .map((row) => (
                      <div
                        key={row.key}
                        className="flex items-center gap-2 px-2.5 py-1.5"
                      >
                        <dt className="shrink-0 text-xs text-muted-foreground">
                          {row.label}
                        </dt>
                        <Hint content={row.value} variant="text" truncatedOnly>
                          <dd className="ml-auto min-w-0 truncate font-mono text-xs tabular-nums text-foreground">
                            {row.value}
                          </dd>
                        </Hint>
                      </div>
                    ))}
                </dl>
              </div>
              )}

              <div className="shrink-0 border-t border-border p-2.5">
                {detail.isLoading ? (
                  <div aria-hidden className="grid gap-2">
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ) : detail.failed ? (
                  <div className="grid gap-2">
                    <p className="text-xs text-destructive">
                      {detail.loadFailed
                        ? t("newInstance.modpackVersionsFailed")
                        : t("newInstance.noModpackVersions")}
                    </p>
                    {detail.loadFailed && detail.project && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isBusy}
                        onClick={() => {
                          if (detail.project) void openDetail(detail.project);
                        }}
                      >
                        <RotateCw />
                        {t("common.retry")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid min-w-0 gap-2">
                    <VirtualizedSelect
                      className="min-w-0"
                      size="sm"
                      aria-label={t("versions.version")}
                      value={detail.selectedId ?? ""}
                      placeholder={t("versions.version")}
                      searchPlaceholder={t("common.search")}
                      emptyText={t("common.notFound")}
                      disabled={isBusy}
                      options={detail.versions.map((item) => ({
                        value: item.id,
                        label: item.name || item.id,
                      }))}
                      onValueChange={(value) =>
                        setDetail((prev) => ({ ...prev, selectedId: value }))
                      }
                    />

                    {isBusy && stage ? (
                      <PackStageProgress
                        stage={stage}
                        progressPercent={progressPercent}
                        extractPercent={extractPercent}
                      />
                    ) : (
                      <Button
                        type="button"
                        className="h-9 w-full min-w-0"
                        disabled={!selectedVersion || isBusy}
                        onClick={() => {
                          if (!detail.project || !selectedVersion) return;
                          onPick(detail.project, selectedVersion);
                        }}
                      >
                        <HardDriveDownload />
                        <Hint
                          content={t("newInstance.useModpack")}
                          variant="text"
                          truncatedOnly
                        >
                          <span className="min-w-0 truncate">
                            {t("newInstance.useModpack")}
                          </span>
                        </Hint>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
