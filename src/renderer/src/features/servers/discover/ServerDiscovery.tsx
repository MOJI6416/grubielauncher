import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CircleAlert,
  Copy,
  ExternalLink,
  Globe,
  Images,
  Loader2,
  Package,
  RotateCw,
  Search,
  Server as ServerIcon,
  TriangleAlert,
  Users,
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
import { cn } from "@/lib/utils";
import type { IVersion as IGameVersion } from "@/types/IVersion";
import type {
  ModrinthServer,
  ModrinthServerImage,
  ModrinthServerSort,
} from "@/types/ModrinthServers";
import { MODRINTH_SERVER_SORTS } from "@/shared/modrinthServers";
import { settingsAtom } from "@renderer/stores/atoms";
import { Hint } from "@renderer/components/Hint";
import { RemoteGalleryViewer } from "@renderer/components/mediaViewer/RemoteGalleryViewer";
import { LoaderLabel } from "@renderer/components/Loaders";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { formatCompactNumber } from "@renderer/features/mods/format";
import { PingBars, StatusDot } from "../ServerVisuals";
import { useServerStatuses } from "../useServerStatuses";
import {
  type ServerFit,
  type ServerFitInstance,
  compatibilityOf,
  serverFit,
  summarizeVersions,
} from "./serverFit";
import { languageName, languageOptions } from "./serverLanguages";
import {
  type ServerDiscoveryRequest,
  useServerDiscovery,
} from "./useServerDiscovery";

const api = window.api;

const ROW_HEIGHT = 56;

export type DiscoveryType = "compatible" | "all" | "vanilla" | "modpack";

export function ServerDiscovery({
  leading,
  instance,
  initialServer,
  isBusy = false,
  offlineReason = null,
  tone = "inset",
  renderActions,
}: {
  leading?: ReactNode;
  instance?: ServerFitInstance;
  initialServer?: ModrinthServer;
  isBusy?: boolean;
  offlineReason?: string | null;
  tone?: "card" | "inset";
  renderActions: (server: ModrinthServer, fit: ServerFit | null) => ReactNode;
}) {
  const { t } = useTranslation();
  const settings = useAtomValue(settingsAtom);
  const language = settings.lang || "en";

  const [rawQuery, setRawQuery] = useState(initialServer?.name ?? "");
  const [query, setQuery] = useState(initialServer?.name ?? "");
  const [type, setType] = useState<DiscoveryType>(
    instance ? "compatible" : "all",
  );
  const [gameVersion, setGameVersion] = useState("");
  const [serverLanguage, setServerLanguage] = useState("");
  const [sort, setSort] = useState<ModrinthServerSort>("relevance");
  const [gameVersions, setGameVersions] = useState<IGameVersion[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    initialServer?.id ?? null,
  );
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(
    null,
  );

  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 350);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    let cancelled = false;

    void api.versions
      .getList("vanilla")
      .then((list) => {
        if (!cancelled) setGameVersions(list ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const isCompatible = type === "compatible" && !!instance;

  const request = useMemo<ServerDiscoveryRequest>(
    () => ({
      query,
      sort,
      language: serverLanguage || undefined,
      ...(isCompatible && instance
        ? { compatible: compatibilityOf(instance) }
        : {
            kind: type === "vanilla" || type === "modpack" ? type : undefined,
            gameVersion: gameVersion || undefined,
          }),
    }),
    [gameVersion, instance, isCompatible, query, serverLanguage, sort, type],
  );

  const discovery = useServerDiscovery(request, !offlineReason);
  const items = discovery.items;
  const active =
    items.find((server) => server.id === activeId) ??
    (initialServer && initialServer.id === activeId ? initialServer : null);

  useEffect(() => {
    if (discovery.isLoading || items.length === 0) return;
    if (activeId && activeId === initialServer?.id) return;
    if (activeId && items.some((server) => server.id === activeId)) return;

    setActiveId(items[0].id);
  }, [activeId, discovery.isLoading, items]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const isResultWave = useEntranceWave(discovery.isLoading);
  const lastVisible = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (!discovery.hasMore || discovery.isLoading || discovery.isLoadingMore) {
      return;
    }
    if (lastVisible < items.length - 4) return;

    discovery.loadMore();
  }, [discovery, items.length, lastVisible]);

  const visibleAddresses = useMemo(
    () =>
      virtualItems
        .map((row) => items[row.index]?.address)
        .filter((address): address is string => !!address),
    [items, virtualItems],
  );
  const statuses = useServerStatuses(visibleAddresses, !offlineReason);

  const languages = useMemo(() => languageOptions(language), [language]);
  const activeFit = active && instance ? serverFit(active, instance) : null;
  const activeStatus = active ? statuses[active.address] : undefined;

  const [galleries, setGalleries] = useState<
    Record<string, ModrinthServerImage[]>
  >({});
  const [isGalleryOpen, setGalleryOpen] = useState(false);
  const activeServerId = active?.id ?? null;
  const hasActiveGallery = activeServerId
    ? activeServerId in galleries
    : false;

  useEffect(() => {
    if (!activeServerId || offlineReason || hasActiveGallery) return;
    let cancelled = false;

    void api.servers
      .discoverGallery(activeServerId)
      .then((images) => {
        if (cancelled || !images) return;
        setGalleries((prev) => ({ ...prev, [activeServerId]: images }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeServerId, hasActiveGallery, offlineReason]);

  const activeGallery = activeServerId ? (galleries[activeServerId] ?? []) : [];
  const galleryImages =
    activeGallery.length > 0
      ? activeGallery
      : active?.bannerUrl
        ? [{ url: active.bannerUrl }]
        : [];
  const bannerUrl = active?.bannerUrl ?? activeGallery[0]?.thumbnail ?? null;

  const surface = tone === "card" ? "bg-card" : "bg-surface-1";
  const raised = tone === "card" ? "bg-surface-3" : "bg-surface-2";

  const types: DiscoveryType[] = instance
    ? ["compatible", "all", "vanilla", "modpack"]
    : ["all", "vanilla", "modpack"];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-center gap-2">
        {leading}

        <div className="relative min-w-28 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
          <Input
            value={rawQuery}
            disabled={isBusy}
            className="h-8 pr-8 pl-8"
            placeholder={t("servers.discover.search")}
            onChange={(event) => setRawQuery(event.target.value)}
          />
          {discovery.isLoading && (
            <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
          )}
        </div>

        <Select
          value={type}
          disabled={isBusy}
          onValueChange={(value) => setType(value as DiscoveryType)}
        >
          <SelectTrigger size="sm" className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`servers.discover.type.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-32 shrink-0">
          <VirtualizedSelect
            size="sm"
            aria-label={t("versions.version")}
            value={
              isCompatible && instance ? instance.gameVersion : gameVersion
            }
            placeholder={t("versions.version")}
            searchPlaceholder={t("common.search")}
            emptyText={t("common.notFound")}
            disabled={isBusy || isCompatible}
            options={
              isCompatible && instance
                ? [{ value: instance.gameVersion, label: instance.gameVersion }]
                : [
                    { value: "", label: t("newInstance.anyVersion") },
                    ...gameVersions.map((item) => ({
                      value: item.id,
                      label: item.id,
                    })),
                  ]
            }
            onValueChange={setGameVersion}
          />
        </div>

        <div className="w-36 shrink-0">
          <VirtualizedSelect
            size="sm"
            aria-label={t("servers.discover.languages")}
            value={serverLanguage}
            placeholder={t("servers.discover.anyLanguage")}
            searchPlaceholder={t("common.search")}
            emptyText={t("common.notFound")}
            disabled={isBusy}
            options={[
              { value: "", label: t("servers.discover.anyLanguage") },
              ...languages,
            ]}
            onValueChange={setServerLanguage}
          />
        </div>

        <Select
          value={sort}
          disabled={isBusy}
          onValueChange={(value) => setSort(value as ModrinthServerSort)}
        >
          <SelectTrigger size="sm" className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODRINTH_SERVER_SORTS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`servers.discover.sort.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] gap-3">
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border",
            surface,
          )}
        >
          <div
            ref={setScrollElement}
            className="min-h-0 flex-1 overflow-y-auto p-1.5"
          >
            {items.length === 0 && discovery.isLoading && !offlineReason ? (
              <ListSkeleton
                rows={9}
                rowClassName="h-14"
                iconClassName="size-10 rounded-lg"
              />
            ) : items.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2">
                  {discovery.error || offlineReason ? (
                    <CircleAlert className="size-5 text-destructive" />
                  ) : (
                    <Search className="size-5 text-faint" />
                  )}
                </span>
                <p className="text-sm font-medium text-foreground">
                  {offlineReason
                    ? t("shell.offline.internet")
                    : discovery.error
                      ? t("servers.discover.failedTitle")
                      : t("servers.discover.emptyTitle")}
                </p>
                <p className="max-w-72 text-xs text-muted-foreground">
                  {offlineReason ??
                    (discovery.error
                      ? t("servers.discover.failedHint")
                      : isCompatible && instance
                        ? t("servers.discover.compatibleEmptyHint", {
                            version: instance.gameVersion,
                          })
                        : t("servers.discover.emptyHint"))}
                </p>
                {discovery.error && !offlineReason ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={discovery.reload}
                  >
                    <RotateCw />
                    {t("common.retry")}
                  </Button>
                ) : (
                  isCompatible && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setType("all")}
                    >
                      {t("servers.discover.showAll")}
                    </Button>
                  )
                )}
              </div>
            ) : (
              <div
                role="listbox"
                aria-label={t("servers.discover.title")}
                className={cn("relative w-full", isResultWave && "result-wave")}
                style={{ height: `${virtualizer.getTotalSize()}px` }}
              >
                {virtualItems.map((row) => {
                  const server = items[row.index];
                  if (!server) return null;

                  const status = statuses[server.address];
                  const fit = instance ? serverFit(server, instance) : null;

                  return (
                    <button
                      key={server.id}
                      type="button"
                      role="option"
                      aria-selected={activeId === server.id}
                      data-wave-row
                      style={
                        {
                          height: `${row.size}px`,
                          transform: `translateY(${row.start}px)`,
                          "--wave-index": row.index,
                        } as CSSProperties
                      }
                      onClick={() => setActiveId(server.id)}
                      className={cn(
                        "absolute top-0 left-0 flex w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors aria-selected:bg-primary-soft",
                        tone === "card"
                          ? "hover:bg-surface-3"
                          : "hover:bg-surface-2",
                      )}
                    >
                      <ServerArt
                        server={server}
                        size="size-10"
                        raised={raised}
                      />

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate text-sm font-medium text-foreground">
                            {server.name}
                          </span>
                          {server.content.kind === "modpack" && (
                            <span className="shrink-0 rounded bg-surface-3 px-1.5 text-[0.65rem] leading-4 text-muted-foreground">
                              {t("servers.discover.modpack")}
                            </span>
                          )}
                          {fit && fit !== "ready" && (
                            <TriangleAlert
                              className="size-3 shrink-0 text-warning"
                              aria-label={t(`servers.discover.fitShort.${fit}`)}
                            />
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {server.summary || server.address}
                        </span>
                      </span>

                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="flex items-center gap-1 font-mono text-xs tabular-nums text-foreground">
                          <Users className="size-3 text-faint" />
                          {formatCompactNumber(
                            server.ping?.playersOnline ?? 0,
                            language,
                          )}
                        </span>
                        {status?.state === "pending" || !status ? (
                          <Loader2 className="size-3 animate-spin text-faint" />
                        ) : (
                          <PingBars
                            latencyMs={status.latencyMs}
                            offline={status.state !== "online"}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {discovery.isLoadingMore && (
            <div className="flex h-7 shrink-0 items-center justify-center gap-2 border-t border-border text-[0.7rem] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("common.searching")}
            </div>
          )}
        </section>

        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border",
            surface,
          )}
        >
          {!active ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <ServerIcon className="size-6 text-faint" />
              <p className="text-xs text-muted-foreground">
                {t("servers.discover.pickHint")}
              </p>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                {bannerUrl && (
                  <button
                    type="button"
                    aria-label={t("common.gallery")}
                    className="group relative h-24 w-full shrink-0 overflow-hidden border-b border-border focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => setGalleryOpen(true)}
                  >
                    <img
                      src={bannerUrl}
                      alt=""
                      draggable={false}
                      className="size-full object-cover transition-opacity group-hover:opacity-85"
                    />
                    {activeGallery.length > 1 && (
                      <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md border border-border bg-surface-1/90 px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                        <Images className="size-3" />
                        <span className="font-mono tabular-nums">
                          {activeGallery.length}
                        </span>
                      </span>
                    )}
                  </button>
                )}
                {isGalleryOpen && galleryImages.length > 0 && (
                  <RemoteGalleryViewer
                    images={galleryImages}
                    startIndex={0}
                    title={active.name}
                    onClose={() => setGalleryOpen(false)}
                  />
                )}

                <div className="flex shrink-0 items-start gap-2.5 p-2.5">
                  <ServerArt server={active} size="size-12" raised={raised} />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <Hint content={active.name} variant="text" truncatedOnly>
                      <span className="truncate text-sm font-semibold text-foreground">
                        {active.name}
                      </span>
                    </Hint>
                    <span className="flex min-w-0 items-center gap-1">
                      <StatusDot
                        state={activeStatus?.state ?? "pending"}
                        className="shrink-0"
                      />
                      <Hint
                        content={active.address}
                        variant="text"
                        truncatedOnly
                      >
                        <span className="min-w-0 truncate font-mono text-[0.7rem] text-muted-foreground">
                          {active.address}
                        </span>
                      </Hint>
                      <Hint content={t("servers.copyAddress")}>
                        <button
                          type="button"
                          aria-label={t("servers.copyAddress")}
                          onClick={() => void copyWithFeedback(active.address)}
                          className="flex size-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:bg-surface-3 hover:text-foreground"
                        >
                          <Copy className="size-3" />
                        </button>
                      </Hint>
                    </span>
                  </div>

                  <Hint content={t("servers.discover.openModrinth")}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 shrink-0"
                      aria-label={t("servers.discover.openModrinth")}
                      onClick={() => void api.shell.openExternal(active.url)}
                    >
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </Hint>
                </div>

                {active.summary && (
                  <p className="shrink-0 px-2.5 pb-2 text-xs leading-snug break-words text-muted-foreground">
                    {active.summary}
                  </p>
                )}

                <ServerContentCard server={active} raised={raised} />

                {active.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 px-2.5 pb-2.5">
                    {active.categories.slice(0, 8).map((category) => (
                      <span
                        key={category}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[0.68rem] text-muted-foreground",
                          raised,
                        )}
                      >
                        {t(`servers.discover.categories.${category}`, {
                          defaultValue: category,
                        })}
                      </span>
                    ))}
                  </div>
                )}

                <dl className="mt-auto divide-y divide-border/60 border-t border-border/60">
                  {[
                    {
                      key: "online",
                      label: t("servers.discover.online"),
                      value: active.ping
                        ? `${formatCount(active.ping.playersOnline, language)}/${formatCount(active.ping.playersMax, language)}`
                        : null,
                    },
                    {
                      key: "ping",
                      label: t("servers.discover.ping"),
                      value:
                        activeStatus?.state === "online" &&
                        activeStatus.latencyMs !== undefined
                          ? `${activeStatus.latencyMs} ${t("servers.ms")}`
                          : activeStatus?.state === "offline"
                            ? t("servers.discover.pingOffline")
                            : null,
                    },
                    {
                      key: "plays",
                      label: t("servers.discover.plays"),
                      value: active.verifiedPlays
                        ? formatCompactNumber(active.verifiedPlays, language)
                        : null,
                    },
                    {
                      key: "follows",
                      label: t("servers.discover.follows"),
                      value: active.follows
                        ? formatCompactNumber(active.follows, language)
                        : null,
                    },
                    {
                      key: "region",
                      label: t("servers.discover.region"),
                      value: active.region
                        ? t(`servers.discover.regions.${active.region}`, {
                            defaultValue: active.region,
                          })
                        : null,
                    },
                    {
                      key: "languages",
                      label: t("servers.discover.languages"),
                      value: active.languages.length
                        ? active.languages
                            .slice(0, 3)
                            .map((code) => languageName(code, language))
                            .join(", ")
                        : null,
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
                        <dd className="ml-auto min-w-0 truncate font-mono text-xs tabular-nums text-foreground">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>

              <div className="grid shrink-0 gap-2 border-t border-border p-2.5">
                {renderActions(active, activeFit)}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function formatCount(value: number, language: string): string {
  try {
    return new Intl.NumberFormat(language).format(value);
  } catch {
    return String(value);
  }
}

function ServerArt({
  server,
  size,
  raised,
}: {
  server: ModrinthServer;
  size: string;
  raised: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border",
        raised,
        size,
      )}
    >
      {server.iconUrl ? (
        <img
          src={server.iconUrl}
          alt=""
          draggable={false}
          loading="lazy"
          className="size-full object-cover"
        />
      ) : (
        <Globe className="size-4 text-faint" />
      )}
    </span>
  );
}

function ServerContentCard({
  server,
  raised,
}: {
  server: ModrinthServer;
  raised: string;
}) {
  const { t } = useTranslation();
  const { content } = server;
  const versions = summarizeVersions(content.gameVersions);

  return (
    <div
      className={cn(
        "mx-2.5 mb-2.5 flex items-center gap-2 rounded-lg border border-border p-2",
        raised,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background/40">
        {content.kind === "modpack" && content.iconUrl ? (
          <img
            src={content.iconUrl}
            alt=""
            draggable={false}
            className="size-full object-cover"
          />
        ) : content.kind === "modpack" ? (
          <Package className="size-4 text-faint" />
        ) : (
          <ServerIcon className="size-4 text-faint" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">
          {content.kind === "modpack"
            ? content.title || t("servers.discover.packOf")
            : t("servers.discover.vanilla")}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[0.68rem] text-faint">
          {content.kind === "modpack" && content.loaders[0] && (
            <LoaderLabel loader={content.loaders[0]} />
          )}
          {versions && (
            <span className="min-w-0 truncate font-mono tabular-nums">
              {versions}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}
