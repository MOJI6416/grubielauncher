import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import {
  ArrowDownWideNarrow,
  Download,
  ExternalLink,
  ImageOff,
  Loader2,
  Search,
  ServerCrash,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { ICatalogSkin } from "@/types/SkinManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import { cn } from "@/lib/utils";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { Hint } from "@renderer/components/Hint";
import { showFailureToast } from "@renderer/utilities/failures";
import { formatDay } from "@renderer/utilities/date";
import { SkinHead } from "./SkinHead";
import { SkinStage } from "./SkinStage";
import {
  availableCatalogSources,
  availableCatalogTypes,
  catalogColumns,
  catalogColumnWidth,
  catalogDisplayName,
  catalogHasMore,
  catalogPreviewHeight,
  catalogPreviewSkinUrl,
  catalogSourceHref,
  catalogSourceLabel,
  catalogTileHeight,
  CatalogState,
  CATALOG_GRID_GAP,
  CATALOG_GRID_PADDING,
  CATALOG_SORTS,
  hasCatalogFilters,
  INITIAL_CATALOG_STATE,
  isCatalogItemImportable,
  isOwnCatalog,
  mergeCatalogPage,
  normalizeCatalogState,
  toCatalogParams,
} from "./catalogQuery";

const api = window.api;
const PAGE_SIZE = 60;

const STATUS_META = {
  pending: { key: "manageSkins.statusPending", variant: "secondary" },
  rejected: { key: "manageSkins.statusRejected", variant: "destructive" },
  approved: { key: "manageSkins.statusApproved", variant: "default" },
} as const;

function statusMeta(status?: ICatalogSkin["status"]) {
  return STATUS_META[status ?? "approved"] ?? STATUS_META.approved;
}

function CatalogPreview({
  item,
  size,
}: {
  item: ICatalogSkin;
  size: number;
}) {
  const source =
    item.previewUrl ?? (item.type === "cape" ? item.capeUrl : null);

  if (source) {
    return (
      <img
        src={source}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
      />
    );
  }

  return (
    <SkinHead
      url={item.skinUrl}
      size={Math.min(48, size)}
      alt={item.name}
      className="relative"
    />
  );
}

function CatalogAttribution({ item }: { item: ICatalogSkin }) {
  const { t } = useTranslation();

  const site = catalogSourceLabel(item.sourceSite);
  const href = catalogSourceHref(item.sourceUrl);
  const added = item.createdAt ? formatDay(new Date(item.createdAt)) : "";

  if (!site && !added) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-faint">
      {site ? (
        href ? (
          <Hint content={href}>
            <button
              type="button"
              onClick={() => void api.shell.openExternal(href)}
              className="inline-flex min-w-0 items-center gap-1 rounded transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">
                {t("manageSkins.catalogSource", { site })}
              </span>
            </button>
          </Hint>
        ) : (
          <span className="min-w-0 truncate">
            {t("manageSkins.catalogSource", { site })}
          </span>
        )
      ) : null}

      {site && added ? <span className="shrink-0">·</span> : null}

      {added ? (
        <Hint content={t("manageSkins.catalogAdded")}>
          <span className="shrink-0 tabular-nums">{added}</span>
        </Hint>
      ) : null}
    </div>
  );
}

function CatalogTile({
  item,
  isSelected,
  isMine,
  previewHeight,
  onSelect,
}: {
  item: ICatalogSkin;
  isSelected: boolean;
  isMine: boolean;
  previewHeight: number;
  onSelect: (item: ICatalogSkin) => void;
}) {
  const { t } = useTranslation();

  const added = item.createdAt ? formatDay(new Date(item.createdAt)) : "";

  return (
    <Hint content={added ? `${item.name} · ${added}` : item.name} variant="text">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(item)}
        className={cn(
          "relative flex h-full flex-col items-center gap-1 overflow-hidden rounded-xl border border-border bg-surface-2 p-1.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          isSelected
            ? "border-primary/60 bg-primary-soft"
            : "hover:bg-surface-3",
        )}
      >
        <span
          className="relative flex w-full shrink-0 items-center justify-center"
          style={{ height: `${previewHeight}px` }}
        >
          <CatalogPreview item={item} size={previewHeight} />

          <span className="absolute bottom-0 left-0 inline-flex items-center gap-0.5 rounded-md bg-background/75 px-1 text-[10px] text-faint tabular-nums backdrop-blur">
            <Download className="size-2.5" />
            {item.downloads ?? 0}
          </span>
        </span>

        <span className="w-full truncate text-center text-[11px] leading-4 text-muted-foreground">
          {catalogDisplayName(item.name)}
        </span>

        {isMine ? (
          <Badge
            variant={statusMeta(item.status).variant}
            className="absolute top-1 right-1 px-1 text-[9px]"
          >
            {t(statusMeta(item.status).key)}
          </Badge>
        ) : null}
      </button>
    </Hint>
  );
}

export function CatalogPanel({
  onImport,
  isOnline,
  disabled,
  backendToken,
  initialSkinId,
  playerSkinUrl,
  modeSwitch,
}: {
  onImport: (skin: ICatalogSkin) => Promise<void>;
  isOnline: boolean;
  disabled: boolean;
  backendToken?: string;
  initialSkinId?: string | null;
  playerSkinUrl?: string;
  modeSwitch: ReactNode;
}) {
  const { t } = useTranslation();

  const [state, setState] = useState<CatalogState>(INITIAL_CATALOG_STATE);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [items, setItems] = useState<ICatalogSkin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isFailed, setIsFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [isExhausted, setIsExhausted] = useState(false);
  const [selected, setSelected] = useState<ICatalogSkin | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ICatalogSkin | null>(null);
  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const pinnedRef = useRef<string | null>(null);

  const isMine = isOwnCatalog(state);
  const sources = availableCatalogSources(Boolean(backendToken));
  const types = availableCatalogTypes(state.source);

  const patch = useCallback((next: Partial<CatalogState>) => {
    setState((prev) => normalizeCatalogState({ ...prev, ...next }));
  }, []);

  const tagSelectOptions = useMemo(() => {
    const names =
      state.tag && !tagOptions.includes(state.tag)
        ? [state.tag, ...tagOptions]
        : tagOptions;

    return [
      { value: "", label: t("manageSkins.tagsAll") },
      ...names.map((name) => ({ value: name, label: `#${name}` })),
    ];
  }, [state.tag, tagOptions, t]);

  useEffect(() => {
    let cancelled = false;
    void api.skins.tags.suggest("", 100).then((names) => {
      if (!cancelled) setTagOptions(names);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!listElement) return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setGridWidth(Math.floor(box.width));
    });

    observer.observe(listElement);
    return () => observer.disconnect();
  }, [listElement]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(state.search.trim()), 400);
    return () => clearTimeout(id);
  }, [state.search]);

  const filterSignature = `${debouncedSearch}|${state.tag}|${state.source}|${state.type}|${state.sort}`;

  useEffect(() => {
    setPage(1);
    setIsExhausted(false);
    setIsFailed(false);
    listElement?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      try {
        if (isMine) {
          if (!backendToken) {
            setItems([]);
            setTotal(0);
            setSelected(null);
            setIsFailed(true);
            return;
          }

          const data = await api.skins.community.mine(backendToken);
          if (cancelled) return;
          if (!data) {
            setIsFailed(true);
            setItems([]);
            setTotal(0);
            setSelected(null);
            return;
          }

          setIsFailed(false);
          setItems(data.items);
          setTotal(data.items.length);
          setSelected((current) =>
            pinnedRef.current && current?.id === pinnedRef.current
              ? current
              : (data.items.find((item) => item.id === current?.id) ??
                data.items[0] ??
                null),
          );
          return;
        }

        const data = await api.skins.catalog.list(
          toCatalogParams(
            { ...state, search: debouncedSearch },
            page,
            PAGE_SIZE,
          ),
        );
        if (cancelled) return;
        if (!data) {
          setIsFailed(true);
          setIsExhausted(true);
          if (page === 1) {
            setItems([]);
            setTotal(0);
            setSelected(null);
          }
          return;
        }

        setIsFailed(false);
        setTotal(data.total);
        setItems((prev) => mergeCatalogPage(prev, data.items, page));
        if (page > 1) setIsExhausted(data.items.length === 0);

        if (page === 1) {
          setSelected((current) =>
            pinnedRef.current && current?.id === pinnedRef.current
              ? current
              : (data.items.find((item) => item.id === current?.id) ??
                data.items[0] ??
                null),
          );
        }
      } catch {
        if (!cancelled) {
          setIsFailed(true);
          setIsExhausted(true);
          if (page === 1) {
            setItems([]);
            setTotal(0);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSignature, page, backendToken, reloadToken]);

  useEffect(() => {
    if (!initialSkinId) return;

    let cancelled = false;
    void api.skins.catalog.get(initialSkinId).then((skin) => {
      if (cancelled) return;
      if (!skin) {
        showFailureToast(t("manageSkins.catalogLinkError"), null, {
          channels: ["skins:catalogItem"],
        });
        return;
      }

      pinnedRef.current = skin.id;
      setSelected(skin);
      patch({ type: skin.type, search: skin.name });
    });

    return () => {
      cancelled = true;
    };
  }, [initialSkinId, patch, t]);

  const handleRetryPage = useCallback(() => {
    setIsFailed(false);
    setReloadToken((prev) => prev + 1);
  }, []);

  const handleImport = useCallback(
    async (skin: ICatalogSkin) => {
      setImportingId(skin.id);
      try {
        await onImport(skin);
      } finally {
        setImportingId(null);
      }
    },
    [onImport],
  );

  const handleDeleteMine = useCallback(
    async (skin: ICatalogSkin) => {
      if (!backendToken) return;

      setDeletingId(skin.id);
      try {
        const result = await api.skins.community.delete(backendToken, skin.id);
        if (!result.ok) {
          showFailureToast(t("manageSkins.removeFromGalleryError"), null, {
            channels: ["skins:communityDelete"],
          });
          return;
        }

        setItems((prev) => prev.filter((item) => item.id !== skin.id));
        setSelected((current) => (current?.id === skin.id ? null : current));
        setTotal((prev) => Math.max(0, prev - 1));
        setConfirmDelete(null);
        toast.success(t("manageSkins.removedFromGallery"));
      } finally {
        setDeletingId(null);
      }
    },
    [backendToken, t],
  );

  const innerWidth = gridWidth - CATALOG_GRID_PADDING;
  const columns = catalogColumns(innerWidth);
  const columnWidth = catalogColumnWidth(innerWidth, columns);
  const previewHeight = catalogPreviewHeight(columnWidth);
  const tileHeight = catalogTileHeight(columnWidth);
  const rowCount = Math.ceil(items.length / columns);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => listElement,
    estimateSize: () => tileHeight + CATALOG_GRID_GAP,
    overscan: 4,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, tileHeight]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVisibleRow = virtualRows[virtualRows.length - 1]?.index ?? -1;
  const hasMore =
    !isExhausted && catalogHasMore(state, items.length, total);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    if (lastVisibleRow < rowCount - 2) return;

    setPage((prev) => prev + 1);
  }, [hasMore, isLoading, lastVisibleRow, rowCount]);

  const isLoadingMore = isLoading && page > 1 && items.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        {modeSwitch}

        <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
          {sources.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => patch({ source: value })}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                state.source === value
                  ? "bg-surface-3 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`manageSkins.source_${value}`)}
            </button>
          ))}
        </div>

        {!isMine ? (
          <>
            <div className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
              {types.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => patch({ type: value })}
                  className={cn(
                    "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                    state.type === value
                      ? "bg-surface-3 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`manageSkins.type_${value}`)}
                </button>
              ))}
            </div>

            <div className="relative ml-auto min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={state.search}
                onChange={(event) => patch({ search: event.target.value })}
                placeholder={t("common.search")}
                className="h-8 pr-8 pl-8"
              />
              {hasCatalogFilters(state) ? (
                <Hint content={t("manageSkins.resetFilters")}>
                  <button
                    type="button"
                    aria-label={t("manageSkins.resetFilters")}
                    onClick={() => patch({ search: "", tag: null })}
                    className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </Hint>
              ) : null}
            </div>

            <div className="w-32 shrink-0">
              <VirtualizedSelect
                value={state.tag ?? ""}
                onValueChange={(value) => patch({ tag: value || null })}
                options={tagSelectOptions}
                placeholder={t("manageSkins.tagsAll")}
                searchPlaceholder={t("manageSkins.tagsSearch")}
                emptyText={t("manageSkins.tagsEmpty")}
                aria-label={t("manageSkins.tagsAll")}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <ArrowDownWideNarrow />
                  {t(`manageSkins.sort_${state.sort}`)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuRadioGroup
                  value={state.sort}
                  onValueChange={(value) =>
                    patch({ sort: value as CatalogState["sort"] })
                  }
                >
                  {CATALOG_SORTS.map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {t(`manageSkins.sort_${value}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1">
          {isLoading && items.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <Empty className="min-h-0 flex-1">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {isFailed ? (
                    <ServerCrash />
                  ) : isOnline ? (
                    <ImageOff />
                  ) : (
                    <WifiOff />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {isFailed
                    ? t("manageSkins.catalogLoadError")
                    : isMine
                      ? t("manageSkins.myEmpty")
                      : isOnline
                        ? t("manageSkins.catalogEmpty")
                        : t("manageSkins.catalogOffline")}
                </EmptyTitle>
                {isFailed ? (
                  <EmptyDescription>
                    {isMine && !backendToken
                      ? t("manageSkins.catalogLoadErrorAuth")
                      : t("manageSkins.catalogLoadErrorHint")}
                  </EmptyDescription>
                ) : isMine ? (
                  <EmptyDescription>
                    {t("manageSkins.myEmptyHint")}
                  </EmptyDescription>
                ) : isOnline && hasCatalogFilters(state) ? (
                  <EmptyDescription>
                    {t("manageSkins.noMatchesHint")}
                  </EmptyDescription>
                ) : null}
              </EmptyHeader>
              {isFailed ? (
                <Button
                  variant="secondary"
                  disabled={isLoading}
                  onClick={() => setReloadToken((prev) => prev + 1)}
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : null}
                  {t("common.retry")}
                </Button>
              ) : !isMine && hasCatalogFilters(state) ? (
                <Button
                  variant="secondary"
                  onClick={() => patch({ search: "", tag: null })}
                >
                  {t("manageSkins.resetFilters")}
                </Button>
              ) : null}
            </Empty>
          ) : (
            <>
              <div
                ref={setListElement}
                className="min-h-0 flex-1 overflow-y-auto p-2.5"
              >
                <div
                  className="relative w-full"
                  style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
                >
                  {virtualRows.map((virtualRow) => (
                    <div
                      key={virtualRow.key}
                      role="presentation"
                      className="absolute top-0 left-0 grid w-full"
                      style={{
                        height: `${tileHeight}px`,
                        gap: `${CATALOG_GRID_GAP}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                      }}
                    >
                      {items
                        .slice(
                          virtualRow.index * columns,
                          virtualRow.index * columns + columns,
                        )
                        .map((item) => (
                          <CatalogTile
                            key={item.id}
                            item={item}
                            isMine={isMine}
                            isSelected={item.id === selected?.id}
                            previewHeight={previewHeight}
                            onSelect={setSelected}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              </div>

              <Collapse show={isLoadingMore || (isFailed && !isLoading)}>
                <div className="flex h-8 items-center justify-center gap-2 border-t border-border text-xs text-muted-foreground">
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {t("manageSkins.catalogLoadingMore")}
                    </>
                  ) : (
                    <>
                      <ServerCrash className="size-3.5 text-destructive" />
                      {t("manageSkins.catalogMoreError")}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6"
                        onClick={handleRetryPage}
                      >
                        {t("common.retry")}
                      </Button>
                    </>
                  )}
                </div>
              </Collapse>
            </>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2.5">
          <SkinStage
            className="min-h-0 flex-1"
            skinUrl={catalogPreviewSkinUrl(selected, playerSkinUrl)}
            capeUrl={selected?.capeUrl ?? undefined}
            model={selected?.model ?? "auto"}
            minHeight={200}
            defaultAutoRotate={Boolean(selected) && selected?.type !== "skin"}
          />

          <div className="shrink-0 rounded-xl border border-border bg-surface-2 p-3">
            {selected ? (
              <div className="grid gap-2">
                <div className="min-w-0">
                  <Hint content={selected.name} variant="text">
                    <p className="truncate text-sm font-medium">
                      {catalogDisplayName(selected.name)}
                    </p>
                  </Hint>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {selected.model === "slim"
                        ? t("manageSkins.slim")
                        : t("manageSkins.classic")}
                      {!isMine && selected.authorName
                        ? ` · ${selected.authorName}`
                        : ""}
                    </span>
                    <span className="shrink-0">·</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 tabular-nums">
                      <Download className="size-3" />
                      {selected.downloads ?? 0}
                    </span>
                  </p>
                </div>

                <CatalogAttribution item={selected} />

                {selected.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.slice(0, 6).map((tagName) => (
                      <button
                        key={tagName}
                        type="button"
                        disabled={isMine}
                        onClick={() => patch({ tag: tagName })}
                        className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors enabled:hover:bg-surface-3 disabled:opacity-70"
                      >
                        #{tagName}
                      </button>
                    ))}
                  </div>
                ) : null}

                {isMine ? (
                  <>
                    {selected.status === "rejected" &&
                    selected.rejectionReason ? (
                      <div className="rounded-lg border border-destructive/40 bg-surface-1 p-2">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          {t("manageSkins.rejectionReason")}
                        </p>
                        <p className="text-xs text-foreground">
                          {selected.rejectionReason}
                        </p>
                      </div>
                    ) : null}
                    {selected.status === "rejected" ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingId !== null}
                        onClick={() => setConfirmDelete(selected)}
                      >
                        {deletingId === selected.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        {t("manageSkins.removeFromGallery")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <Button
                    disabled={
                      disabled ||
                      !isOnline ||
                      importingId !== null ||
                      !isCatalogItemImportable(selected)
                    }
                    onClick={() => void handleImport(selected)}
                  >
                    {importingId === selected.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Download />
                    )}
                    {t("manageSkins.catalogTake")}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("manageSkins.catalogPickHint")}
              </p>
            )}
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <Confirmation
          title={t("manageSkins.removeFromGallery")}
          reversible={false}
          content={[
            {
              text: t("manageSkins.removeFromGalleryConfirm", {
                name: catalogDisplayName(confirmDelete.name),
              }),
            },
          ]}
          onClose={() => setConfirmDelete(null)}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setConfirmDelete(null),
            },
            {
              text: t("manageSkins.removeFromGallery"),
              color: "danger",
              onClick: () => handleDeleteMine(confirmDelete),
            },
          ]}
        />
      ) : null}
    </div>
  );
}
