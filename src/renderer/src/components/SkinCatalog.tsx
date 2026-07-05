import {
  CatalogItemType,
  CatalogListParams,
  CatalogSkinSource,
  CatalogSortOption,
  ICatalogSkin,
} from "@/types/SkinManager";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ImageOff, Loader2, Search, Trash2, X } from "lucide-react";
import SkinCanvas from "./SkinCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

function SkinFace({ url, name }: { url: string; name: string }) {
  return (
    <div
      role="img"
      aria-label={name}
      className="size-14 shrink-0 rounded-md [image-rendering:pixelated]"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "448px auto",
        backgroundPosition: "-56px -56px",
      }}
    />
  );
}

export function SkinCatalog({
  onImport,
  isOnline,
  disabled,
  backendToken,
  initialSkinId,
  playerSkinUrl,
}: {
  onImport: (skin: ICatalogSkin) => Promise<void>;
  isOnline: boolean;
  disabled: boolean;
  backendToken?: string;
  initialSkinId?: string | null;
  playerSkinUrl?: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [source, setSource] = useState<CatalogSkinSource | "all" | "mine">(
    "all",
  );
  const [itemType, setItemType] = useState<CatalogItemType>("skin");
  const [sort, setSort] = useState<CatalogSortOption>("new");
  const [items, setItems] = useState<ICatalogSkin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<ICatalogSkin | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pinnedSelectionRef = useRef<string | null>(null);

  const isMine = source === "mine";
  const sources: Array<CatalogSkinSource | "all" | "mine"> = backendToken
    ? ["all", "official", "community", "mine"]
    : ["all", "official", "community"];

  const tagSelectOptions = useMemo(() => {
    const names =
      tag && !tagOptions.includes(tag) ? [tag, ...tagOptions] : tagOptions;
    return [
      { value: "", label: t("manageSkins.tagsAll") },
      ...names.map((name) => ({ value: name, label: `#${name}` })),
    ];
  }, [tagOptions, tag, t]);

  useEffect(() => {
    let cancelled = false;
    api.skins.tags.suggest("", 100).then((names) => {
      if (!cancelled) setTagOptions(names);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debounced, tag, source, itemType, sort]);

  useEffect(() => {
    if (source === "official" && itemType === "pack") setItemType("skin");
  }, [source, itemType]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      try {
        if (source === "mine") {
          if (!backendToken) {
            setItems([]);
            setTotal(0);
            setSelected(null);
            return;
          }
          const data = await api.skins.community.mine(backendToken);
          if (cancelled) return;
          setItems(data.items);
          setTotal(data.items.length);
          setSelected((current) => {
            if (
              pinnedSelectionRef.current &&
              current?.id === pinnedSelectionRef.current
            ) {
              return current;
            }
            return (
              data.items.find((item) => item.id === current?.id) ??
              data.items[0] ??
              null
            );
          });
          return;
        }

        const params: CatalogListParams = {
          search: debounced || undefined,
          tag: tag || undefined,
          source: source === "all" ? undefined : source,
          type: itemType,
          sort,
          page,
          limit: PAGE_SIZE,
        };
        const data = await api.skins.catalog.list(params);
        if (cancelled) return;
        setTotal(data.total);
        if (page === 1) {
          setItems(data.items);
          setSelected((current) => {
            if (
              pinnedSelectionRef.current &&
              current?.id === pinnedSelectionRef.current
            ) {
              return current;
            }
            return (
              data.items.find((item) => item.id === current?.id) ??
              data.items[0] ??
              null
            );
          });
        } else {
          setItems((prev) => [...prev, ...data.items]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced, tag, source, itemType, sort, page, backendToken]);

  useEffect(() => {
    if (!initialSkinId) return;
    let cancelled = false;
    api.skins.catalog.get(initialSkinId).then((skin) => {
      if (cancelled || !skin) return;
      pinnedSelectionRef.current = skin.id;
      setSelected(skin);
      setItemType(skin.type);
      setSearch(skin.name);
    });
    return () => {
      cancelled = true;
    };
  }, [initialSkinId]);

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
        if (!result.ok) return;
        setItems((prev) => prev.filter((item) => item.id !== skin.id));
        setSelected((current) =>
          current?.id === skin.id ? null : current,
        );
        setTotal((prev) => Math.max(0, prev - 1));
      } finally {
        setDeletingId(null);
      }
    },
    [backendToken],
  );

  const hasMore = !isMine && items.length < total;

  return (
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_290px]">
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-card p-0.5">
            {sources.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSource(value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  source === value
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`manageSkins.source_${value}`)}
              </button>
            ))}
          </div>

          {!isMine && (
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              {(source === "official"
                ? (["skin", "cape"] as const)
                : (["skin", "cape", "pack"] as const)
              ).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setItemType(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    itemType === value
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`manageSkins.type_${value}`)}
                </button>
              ))}
            </div>
          )}

          {!isMine && (
            <div className="inline-flex rounded-lg border bg-card p-0.5">
              {(["new", "downloads"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSort(value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    sort === value
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`manageSkins.sort_${value}`)}
                </button>
              ))}
            </div>
          )}
        </div>

        {!isMine && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("manageSkins.catalogSearch")}
                className="pl-8 pr-8"
              />
              {(search || tag) && (
                <button
                  type="button"
                  title={t("manageSkins.resetFilters")}
                  onClick={() => {
                    setSearch("");
                    setTag(null);
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="w-36 shrink-0">
              <VirtualizedSelect
                value={tag ?? ""}
                onValueChange={(value) => setTag(value || null)}
                options={tagSelectOptions}
                placeholder={t("manageSkins.tagsAll")}
                searchPlaceholder={t("manageSkins.tagsSearch")}
                emptyText={t("manageSkins.tagsEmpty")}
                aria-label={t("manageSkins.tagsAll")}
              />
            </div>
          </div>
        )}

        {isLoading && items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border bg-card">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <Empty className="flex-1 rounded-xl border bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImageOff />
              </EmptyMedia>
              <EmptyTitle>
                {isMine
                  ? t("manageSkins.myEmpty")
                  : isOnline
                    ? t("manageSkins.catalogEmpty")
                    : t("manageSkins.catalogOffline")}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-full min-h-0 flex-1 rounded-xl border bg-card">
            <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4">
              {items.map((skin) => {
                const isSelected = skin.id === selected?.id;
                return (
                  <Card
                    key={skin.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(skin)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setSelected(skin);
                    }}
                    className={cn(
                      "relative w-full cursor-pointer gap-0 overflow-hidden border bg-card py-0 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring/50",
                      isSelected &&
                        "border-primary bg-primary/10 ring-2 ring-primary/60",
                    )}
                  >
                    <CardContent className="p-1.5">
                      <div className="relative flex items-center justify-center">
                        {skin.previewUrl ? (
                          <img
                            src={skin.previewUrl}
                            alt={skin.name}
                            loading="lazy"
                            className="h-24 w-auto max-w-full shrink-0 object-contain [image-rendering:pixelated]"
                          />
                        ) : skin.type === "cape" && skin.capeUrl ? (
                          <img
                            src={skin.capeUrl}
                            alt={skin.name}
                            loading="lazy"
                            className="h-24 w-auto shrink-0 object-contain [image-rendering:pixelated]"
                          />
                        ) : skin.skinUrl ? (
                          <SkinFace url={skin.skinUrl} name={skin.name} />
                        ) : null}
                        <span className="absolute bottom-0 left-0 inline-flex items-center gap-0.5 rounded-md bg-background/75 px-1 py-0.5 text-[10px] text-muted-foreground backdrop-blur">
                          <Download className="size-2.5" />
                          {skin.downloads ?? 0}
                        </span>
                        {isMine ? (
                          <Badge
                            variant={statusMeta(skin.status).variant}
                            className="absolute top-0 right-0 px-1 text-[9px]"
                          >
                            {t(statusMeta(skin.status).key)}
                          </Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}

        {hasMore && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            {isLoading && <Loader2 className="size-4 animate-spin" />}
            {t("manageSkins.catalogLoadMore")}
          </Button>
        )}
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
          <CardContent className="grid h-full min-h-0 p-3">
            <div className="flex h-full min-h-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/30 p-1">
              {selected ? (
                <SkinCanvas
                  skinUrl={
                    selected.type === "cape"
                      ? (playerSkinUrl ?? "steve")
                      : (selected.skinUrl ?? "steve")
                  }
                  capeUrl={selected.capeUrl ?? undefined}
                  height={320}
                  width={230}
                />
              ) : (
                <ImageOff className="size-9 text-muted-foreground" />
              )}
            </div>
          </CardContent>
        </Card>

        {selected && (
          <Card className="gap-0 py-0">
            <CardContent className="grid gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selected.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">
                    {selected.model === "slim"
                      ? t("manageSkins.slim")
                      : t("manageSkins.classic")}
                    {!isMine && selected.authorName
                      ? ` · ${selected.authorName}`
                      : ""}
                  </span>
                  <span className="shrink-0">·</span>
                  <span className="flex shrink-0 items-center gap-1">
                    <Download className="size-3" />
                    {selected.downloads ?? 0}
                  </span>
                </div>
                {selected.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {selected.tags.map((tagName) => (
                      <button
                        key={tagName}
                        type="button"
                        disabled={isMine}
                        onClick={() => setTag(tagName)}
                        className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors enabled:hover:border-primary/50 enabled:hover:bg-accent disabled:opacity-70"
                      >
                        #{tagName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isMine ? (
                <>
                  <Badge
                    variant={statusMeta(selected.status).variant}
                    className="w-fit"
                  >
                    {t(statusMeta(selected.status).key)}
                  </Badge>
                  {selected.status === "rejected" &&
                    selected.rejectionReason && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                        <p className="text-[10px] font-medium text-muted-foreground">
                          {t("manageSkins.rejectionReason")}
                        </p>
                        <p className="text-xs text-foreground">
                          {selected.rejectionReason}
                        </p>
                      </div>
                    )}
                  {selected.status === "rejected" && (
                    <Button
                      variant="destructive"
                      disabled={deletingId !== null}
                      onClick={() => handleDeleteMine(selected)}
                    >
                      {deletingId === selected.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                      {t("manageSkins.removeFromGallery")}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  disabled={disabled || !isOnline || importingId !== null}
                  onClick={() => handleImport(selected)}
                >
                  {importingId === selected.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {t("manageSkins.catalogTake")}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
