import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  Check,
  Copy,
  Download,
  GripVertical,
  HardDriveDownload,
  Loader2,
  MonitorDown,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Trash,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { IServer } from "@/types/ServersList";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SortMenu } from "@renderer/components/SortMenu";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { showUndoToast } from "@renderer/utilities/undoToast";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import {
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import type { ModrinthServer } from "@/types/ModrinthServers";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import type { RunGameParams } from "@renderer/features/launch/types";
import { MotdText, PingBars, ServerFavicon, StatusDot } from "./ServerVisuals";
import { ServerDetails } from "./ServerDetails";
import { ServerEditor } from "./ServerEditor";
import { ServerImport } from "./ServerImport";
import { parseMotd } from "./motd";
import { checkServerCompatibility } from "./compat";
import { describePingError, runWithConcurrency } from "./ping";
import {
  ServerSort,
  countOnline,
  filterServers,
  findDuplicateAddress,
  reorder,
  sortServers,
} from "./serverList";
import { DiscoverSwitch } from "./discover/DiscoverSwitch";
import { ServerDiscovery } from "./discover/ServerDiscovery";
import {
  type ServerFit,
  fitInstanceOf,
  serverEntryOf,
  summarizeVersions,
} from "./discover/serverFit";
import { ServerPingState, toPingState } from "./types";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { createDesktopShortcut } from "@renderer/features/instances/instanceActions";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { ContentProviderIcon } from "@renderer/components/ContentProviderIcon";
import { countFeature } from "@renderer/features/usage/usage";
import {
  FriendHeads,
  ServerFriendsSection,
  useFriendsByServer,
} from "@renderer/features/friends/ServerFriends";
import { friendsOn } from "@renderer/features/friends/friendsOnServers";

const api = window.api;

const SORTS: ServerSort[] = ["manual", "name", "players", "ping"];

type ServersView = "mine" | "discover";

export function ServersPanel({
  servers,
  setServers,
  quickConnectIp,
  setQuickConnectIp,
  runGame,
  onPlayed,
  isAdding,
}: {
  servers: IServer[];
  setServers: React.Dispatch<React.SetStateAction<IServer[]>>;
  quickConnectIp: string | undefined;
  setQuickConnectIp: (ip: string) => void;
  runGame?: (params: RunGameParams) => Promise<void>;
  onPlayed: () => void;
  isAdding?: boolean;
}) {
  const { t } = useTranslation();
  const redact = useRedact();
  const isDownloadedVersion = useAtomValue(isDownloadedVersionAtom);
  const isOwnerVersion = useAtomValue(isOwnerVersionAtom);
  const selectedVersion = useAtomValue(selectedVersionAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const friendsByServer = useFriendsByServer();

  const [statuses, setStatuses] = useState<Record<string, ServerPingState>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ServerSort>("manual");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"details" | "create" | "edit">("details");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [view, setView] = useState<ServersView>("mine");

  const runsRef = useRef(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(new Set<string>());
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const listRef = useRef<HTMLDivElement | null>(null);

  const readOnly = !isAdding && (isDownloadedVersion || !isOwnerVersion);
  const canQuickConnect = selectedVersion?.isQuickPlayMultiplayer === true;
  const instanceVersion = selectedVersion?.version.version.id;
  const fitInstance = useMemo(
    () =>
      selectedVersion ? fitInstanceOf(selectedVersion.version) : undefined,
    [selectedVersion],
  );

  const addresses = useMemo(
    () => servers.map((server) => server.ip).filter(Boolean),
    [servers],
  );
  const serverKeys = useMemo(() => {
    const seen = new Map<string, number>();
    return servers.map((server) => {
      const base = server.ip || server.name || "server";
      const occurrence = seen.get(base) ?? 0;
      seen.set(base, occurrence + 1);
      return occurrence ? `${base}#${occurrence}` : base;
    });
  }, [servers]);
  const serverKeySet = useMemo(() => new Set(serverKeys), [serverKeys]);
  const addressKey = addresses.join("|");

  const ping = useCallback(async (addresses: string[]) => {
    const targets = addresses.filter(
      (address) => !inFlightRef.current.has(address),
    );
    if (!targets.length) return;

    for (const address of targets) inFlightRef.current.add(address);

    setStatuses((prev) => {
      const next = { ...prev };
      for (const address of targets) {
        next[address] = { ...next[address], state: "pending" };
      }
      return next;
    });

    runsRef.current += 1;
    setIsRefreshing(true);

    await runWithConcurrency(
      targets,
      5,
      (address) => api.servers.ping(address),
      (address, result) => {
        inFlightRef.current.delete(address);
        if (!mountedRef.current) return;
        setStatuses((prev) => ({ ...prev, [address]: toPingState(result) }));
      },
    );

    for (const address of targets) inFlightRef.current.delete(address);

    runsRef.current -= 1;
    if (mountedRef.current && runsRef.current <= 0) setIsRefreshing(false);
  }, []);

  useEffect(() => {
    const targets = (addressKey ? addressKey.split("|") : []).filter(
      (address) =>
        !inFlightRef.current.has(address) && !statusesRef.current[address],
    );

    void ping(targets);
  }, [addressKey, ping]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (selected >= servers.length)
      setSelected(Math.max(0, servers.length - 1));
  }, [servers.length, selected]);

  const visible = useMemo(() => {
    const filtered = filterServers(servers, query);
    return sortServers(filtered, sort, statuses);
  }, [servers, query, sort, statuses]);

  const onlineCount = countOnline(servers, statuses);
  const current = servers[selected];
  const canReorder = !readOnly && sort === "manual" && !query.trim();

  const play = useCallback(
    (server: IServer) => {
      if (!runGame || !selectedVersion) return;

      countFeature("launch.server");
      void runGame({
        version: selectedVersion,
        quick: { multiplayer: server.ip },
      });
      onPlayed();
    },
    [runGame, selectedVersion, onPlayed],
  );

  const createShortcut = useCallback(
    (server: IServer) => {
      if (!selectedVersion) return;
      void createDesktopShortcut(selectedVersion, t, {
        server: server.ip,
        label: server.name || server.ip,
      });
    },
    [selectedVersion, t],
  );

  const addDiscovered = useCallback(
    (server: ModrinthServer) => {
      countFeature("servers.discoverAdd");
      setServers((prev) =>
        findDuplicateAddress(prev, server.address) >= 0
          ? prev
          : [...prev, serverEntryOf(server)],
      );
      toast.success(t("servers.added"));
    },
    [setServers, t],
  );

  const copyAddress = useCallback(
    async (server: IServer) => {
      await copyWithFeedback(server.ip);
    },
    [t],
  );

  const removeServer = useCallback(
    (index: number) => {
      const removed = servers[index];
      if (!removed) return;

      setServers((prev) => prev.filter((_, i) => i !== index));
      setSelected((current) => (index < current ? current - 1 : current));
      setMode("details");

      showUndoToast(
        t("servers.deleted"),
        () =>
          setServers((prev) => {
            if (prev.includes(removed)) return prev;
            const next = [...prev];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          }),
      );
    },
    [servers, setServers, t],
  );

  const move = useCallback(
    (from: number, to: number) => {
      if (!canReorder) return;
      if (to < 0 || to >= servers.length) return;

      setServers((prev) => reorder(prev, from, to));
      setSelected(to);
    },
    [canReorder, servers.length, setServers],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;

      if (event.altKey) {
        if (event.shiftKey) move(selected, step > 0 ? servers.length - 1 : 0);
        else move(selected, selected + step);
        return;
      }

      const order = visible.map((server) => servers.indexOf(server));
      const position = order.indexOf(selected);
      const next =
        order[Math.min(order.length - 1, Math.max(0, position + step))];
      if (next !== undefined) setSelected(next);
      return;
    }

    if (event.key === "Enter" && current) {
      event.preventDefault();
      play(current);
      return;
    }

    if (event.key === "Delete" && current && !readOnly) {
      event.preventDefault();
      removeServer(selected);
    }
  };

  const viewSwitch = isAdding ? null : (
    <DiscoverSwitch
      value={view}
      onChange={setView}
      items={[
        {
          id: "mine",
          label: t("servers.discover.mine"),
          icon: <ServerIcon className="size-4" />,
          count: servers.length,
        },
        {
          id: "discover",
          label: "Modrinth",
          icon: <ContentProviderIcon provider="modrinth" className="size-4" />,
        },
      ]}
    />
  );

  if (view === "discover" && !isAdding) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ServerDiscovery
          leading={viewSwitch}
          instance={fitInstance}
          tone="card"
          offlineReason={
            isInternetOnline ? null : t("newInstance.blockers.internet")
          }
          renderActions={(server, fit) => (
            <DiscoverActions
              server={server}
              fit={fit}
              instanceVersion={instanceVersion}
              inList={findDuplicateAddress(servers, server.address) >= 0}
              readOnly={readOnly}
              canPlay={!!runGame && !!selectedVersion}
              onPlay={() => {
                if (!runGame || !selectedVersion) return;
                countFeature("launch.server");
                void runGame({
                  version: selectedVersion,
                  quick: { multiplayer: server.address },
                });
                onPlayed();
              }}
              onAdd={() => addDiscovered(server)}
              onCreate={() =>
                openNewInstance({ source: "server", modrinthServer: server })
              }
            />
          )}
        />
      </div>
    );
  }

  const header = (
    <div className="flex shrink-0 items-center gap-2">
      {viewSwitch}

      <Input
        value={query}
        placeholder={t("common.search")}
        className="h-8 min-w-0 flex-1"
        onChange={(event) => setQuery(event.target.value)}
      />

      <SortMenu
        value={sort}
        options={SORTS.map((value) => ({
          value,
          label: t(`servers.sort.${value}`),
        }))}
        onChange={setSort}
      />

      <span className="shrink-0 text-xs whitespace-nowrap text-faint tabular-nums">
        {t("servers.onlineOf", {
          online: onlineCount,
          total: servers.length,
        })}
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        <Hint content={t("common.update")}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8"
            aria-label={t("common.update")}
            disabled={isRefreshing || !addresses.length}
            onClick={() => void ping(addresses)}
          >
            <RefreshCw
              className={cn("size-3.5", isRefreshing && "animate-spin")}
            />
          </Button>
        </Hint>

        {!readOnly && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setIsImporting(true)}
            >
              <Download className="size-3.5" />
              {t("servers.import")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setMode("create")}
            >
              <Plus className="size-3.5" />
              {t("servers.add")}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const emptyState = (
    <Empty className="h-full border-0 bg-transparent">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ServerIcon />
        </EmptyMedia>
        <EmptyTitle>{t("servers.noServers")}</EmptyTitle>
        <EmptyDescription>{t("servers.noServersHint")}</EmptyDescription>
      </EmptyHeader>
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode("create")}>
            <Plus className="size-3.5" />
            {t("servers.add")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsImporting(true)}
          >
            <Download className="size-3.5" />
            {t("servers.import")}
          </Button>
        </div>
      )}
    </Empty>
  );

  const showDetails = servers.length > 0 || mode !== "details";

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        {header}

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-3",
            showDetails ? "grid-cols-[minmax(0,1fr)_21rem]" : "grid-cols-1",
          )}
        >
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
          {!servers.length ? (
            emptyState
          ) : !visible.length ? (
            <Empty className="h-full border-0 bg-transparent">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>{t("common.notFound")}</EmptyTitle>
              </EmptyHeader>
              <Button size="sm" variant="outline" onClick={() => setQuery("")}>
                {t("common.clearSearch")}
              </Button>
            </Empty>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div
                ref={listRef}
                role="listbox"
                tabIndex={0}
                aria-label={t("servers.title")}
                onKeyDown={handleKeyDown}
                className="flex flex-col gap-0.5 p-1.5 outline-none"
              >
                <RemovalList sourceKeys={serverKeySet}>
                {visible.map((server) => {
                  const index = servers.indexOf(server);
                  const itemKey = serverKeys[index];
                  const status = statuses[server.ip];
                  const offlineLabel =
                    status?.state === "offline"
                      ? describePingError(status.result?.error) === "dns"
                        ? t("servers.statusNotFound")
                        : t("servers.statusOffline")
                      : "";
                  const spans = parseMotd(status?.result?.descriptionRaw);
                  const mismatch =
                    checkServerCompatibility(
                      status?.result?.versionName,
                      instanceVersion,
                    ) === "mismatch";

                  return (
                    <RemovalItem key={itemKey} itemKey={itemKey}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <div
                          role="option"
                          aria-selected={index === selected}
                          draggable={canReorder}
                          onDragStart={() => setDragIndex(index)}
                          onDragEnd={() => setDragIndex(null)}
                          onDragOver={(event) => {
                            if (dragIndex === null || dragIndex === index)
                              return;
                            event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (dragIndex === null) return;
                            move(dragIndex, index);
                            setDragIndex(null);
                          }}
                          onClick={() => {
                            setSelected(index);
                            setMode("details");
                          }}
                          onDoubleClick={() => play(server)}
                          className={cn(
                            "group flex h-14 min-w-0 cursor-default items-center gap-2.5 rounded-lg px-2 transition-colors",
                            index === selected
                              ? "bg-row-selected"
                              : "hover:bg-row-hover",
                            dragIndex === index && "opacity-40",
                          )}
                        >
                          <GripVertical
                            className={cn(
                              "size-3.5 shrink-0 text-faint transition-opacity",
                              canReorder
                                ? "opacity-0 group-hover:opacity-100"
                                : "opacity-0",
                            )}
                          />

                          <ServerFavicon
                            icon={status?.result?.favicon ?? server.icon}
                            size={36}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                              <Hint
                                content={redact.text(server.name)}
                                variant="text"
                                truncatedOnly
                              >
                                <span className="min-w-0 truncate text-sm font-medium">
                                  {redact.text(server.name)}
                                </span>
                              </Hint>
                              {quickConnectIp === server.ip && (
                                <Zap className="size-3 shrink-0 text-warning" />
                              )}
                              {mismatch && (
                                <Hint content={t("servers.incompatibleShort")}>
                                  <TriangleAlert
                                    className="size-3 shrink-0 text-warning"
                                    aria-label={t("servers.incompatibleShort")}
                                  />
                                </Hint>
                              )}
                            </div>

                            {status?.state === "online" && spans.length ? (
                              <MotdText
                                spans={spans}
                                className="text-xs leading-4"
                              />
                            ) : (
                              <Hint
                                content={redact.value(server.ip)}
                                variant="text"
                                truncatedOnly
                              >
                                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                  <StatusDot
                                    state={status?.state ?? "pending"}
                                  />
                                  <span className="min-w-0 truncate font-mono">
                                    {redact.value(server.ip)}
                                  </span>
                                </span>
                              </Hint>
                            )}
                          </div>

                          <FriendHeads
                            friends={friendsOn(friendsByServer, server.ip)}
                          />

                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="font-mono text-xs whitespace-nowrap tabular-nums">
                              {status?.result?.players
                                ? `${status.result.players.online}/${status.result.players.max}`
                                : offlineLabel}
                            </span>
                            <span className="font-mono text-3xs text-faint tabular-nums">
                              {status?.state === "online" &&
                              status.latencyMs !== undefined
                                ? `${status.latencyMs} ${t("servers.ms")}`
                                : ""}
                            </span>
                          </div>

                          {status?.state === "pending" ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-faint" />
                          ) : (
                            <PingBars
                              latencyMs={status?.latencyMs}
                              offline={status?.state !== "online"}
                              className="shrink-0"
                            />
                          )}
                        </div>
                      </ContextMenuTrigger>

                      <ContextMenuContent className="w-52">
                        <ContextMenuItem
                          disabled={!runGame}
                          onSelect={() => play(server)}
                        >
                          <Play />
                          {t("servers.join")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => void copyAddress(server)}
                        >
                          <Copy />
                          {t("servers.copyAddress")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          disabled={!selectedVersion}
                          onSelect={() => createShortcut(server)}
                        >
                          <MonitorDown />
                          {t("servers.createShortcut")}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          disabled={readOnly}
                          onSelect={() => {
                            setSelected(index);
                            setMode("edit");
                          }}
                        >
                          <Pencil />
                          {t("common.edit")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          variant="destructive"
                          disabled={readOnly}
                          onSelect={() => removeServer(index)}
                        >
                          <Trash />
                          {t("common.delete")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                    </RemovalItem>
                  );
                })}
                </RemovalList>
              </div>
            </ScrollArea>
          )}
        </section>

        {showDetails && (
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
            {mode !== "details" ? (
              <ServerEditor
                servers={servers}
                editIndex={mode === "edit" ? selected : null}
                onCancel={() => setMode("details")}
                onSubmit={(server) => {
                  if (mode !== "edit") countFeature("servers.add");
                  if (mode === "edit") {
                    setServers((prev) =>
                      prev.map((entry, index) =>
                        index === selected ? server : entry,
                      ),
                    );
                  } else {
                    setServers((prev) => [...prev, server]);
                    setSelected(servers.length);
                    toast.success(t("servers.added"));
                  }

                  setMode("details");
                }}
              />
            ) : current ? (
              <ServerDetails
                server={current}
                status={statuses[current.ip]}
                instanceVersion={instanceVersion}
                readOnly={readOnly}
                canPlay={!!runGame}
                canQuickConnect={canQuickConnect}
                isQuickConnect={quickConnectIp === current.ip}
                onPlay={() => play(current)}
                onEdit={() => setMode("edit")}
                onDelete={() => removeServer(selected)}
                onCopy={() => void copyAddress(current)}
                onShortcut={
                  selectedVersion ? () => createShortcut(current) : undefined
                }
                onRecheck={() => void ping([current.ip])}
                onChangeTextures={(value) =>
                  setServers((prev) =>
                    prev.map((entry, index) =>
                      index === selected
                        ? { ...entry, acceptTextures: value }
                        : entry,
                    ),
                  )
                }
                onToggleQuickConnect={() =>
                  setQuickConnectIp(
                    quickConnectIp === current.ip ? "" : current.ip,
                  )
                }
                friends={
                  <ServerFriendsSection
                    groups={friendsByServer}
                    address={current.ip}
                  />
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                {t("servers.selectHint")}
              </div>
            )}
          </aside>
        )}
        </div>
      </div>

      {isImporting && (
        <ServerImport
          servers={servers}
          onClose={() => setIsImporting(false)}
          onImport={(imported) => {
            countFeature("servers.import");
            setServers((prev) => [...prev, ...imported]);
            setIsImporting(false);
            toast.success(
              t("servers.imported", {
                count: imported.length,
                total: imported.length,
              }),
            );
          }}
        />
      )}

    </>
  );
}

function DiscoverActions({
  server,
  fit,
  instanceVersion,
  inList,
  readOnly,
  canPlay,
  onPlay,
  onAdd,
  onCreate,
}: {
  server: ModrinthServer;
  fit: ServerFit | null;
  instanceVersion: string | undefined;
  inList: boolean;
  readOnly: boolean;
  canPlay: boolean;
  onPlay: () => void;
  onAdd: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const { content } = server;

  const note =
    fit === "packVersion"
      ? t("servers.discover.fit.packVersion")
      : fit === "otherVersion"
        ? t("servers.discover.fit.otherVersion", {
            version: instanceVersion,
            versions: summarizeVersions(content.gameVersions),
          })
        : fit === "needsPack"
          ? t("servers.discover.fit.needsPack", {
              title:
                (content.kind === "modpack" ? content.title : null) ??
                server.name,
            })
          : null;

  const canJoin = fit === "ready" || fit === "packVersion";

  return (
    <>
      {note && (
        <p className="flex items-start gap-1.5 text-2xs leading-snug text-warning">
          <TriangleAlert className="mt-px size-3 shrink-0" />
          <span className="min-w-0">{note}</span>
        </p>
      )}

      <div className="flex items-center gap-2">
        {canJoin ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-9 min-w-0 flex-1"
            disabled={!canPlay}
            onClick={onPlay}
          >
            <Play className="size-4" />
            <Hint content={t("servers.join")} variant="text" truncatedOnly>
              <span className="truncate">{t("servers.join")}</span>
            </Hint>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-9 min-w-0 flex-1 shrink"
            onClick={onCreate}
          >
            <HardDriveDownload className="size-4" />
            <Hint
              content={t("servers.discover.createInstance")}
              variant="text"
              truncatedOnly
            >
              <span className="truncate">
                {t("servers.discover.createInstance")}
              </span>
            </Hint>
          </Button>
        )}

        {!readOnly && fit !== "needsPack" && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 shrink-0"
            disabled={inList}
            onClick={onAdd}
          >
            {inList ? (
              <Check className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {inList ? t("servers.discover.inList") : t("servers.discover.add")}
          </Button>
        )}
      </div>
    </>
  );
}
