import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  Check,
  Copy,
  Download,
  Gamepad2,
  GripVertical,
  HardDriveDownload,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Trash,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { SiModrinth } from "react-icons/si";
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
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { MotdText, PingBars, ServerFavicon, StatusDot } from "./ServerVisuals";
import { ServerDetails } from "./ServerDetails";
import { ServerEditor } from "./ServerEditor";
import { ServerImport } from "./ServerImport";
import { parseMotd } from "./motd";
import { checkServerCompatibility } from "./compat";
import { runWithConcurrency } from "./ping";
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
import { useRedact } from "@renderer/features/streamer/streamerMode";

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

  const [statuses, setStatuses] = useState<Record<string, ServerPingState>>({});
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ServerSort>("manual");
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"details" | "create" | "edit">("details");
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
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

      void runGame({
        version: selectedVersion,
        quick: { multiplayer: server.ip },
      });
      onPlayed();
    },
    [runGame, selectedVersion, onPlayed],
  );

  const addDiscovered = useCallback(
    (server: ModrinthServer) => {
      setServers((prev) =>
        findDuplicateAddress(prev, server.address) >= 0
          ? prev
          : [...prev, serverEntryOf(server)],
      );
      toast.success(t("servers.added"), {
        description: t("servers.pendingSave"),
      });
    },
    [setServers, t],
  );

  const copyAddress = useCallback(
    async (server: IServer) => {
      await copyWithFeedback(server.ip);
    },
    [t],
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
      setDeleteIndex(selected);
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
          icon: <SiModrinth className="size-4" />,
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

      <Select
        value={sort}
        onValueChange={(value) => setSort(value as ServerSort)}
      >
        <SelectTrigger size="sm" className="h-8 w-36 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`servers.sort.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Hint
        content={t("servers.onlineOf", {
          online: onlineCount,
          total: servers.length,
        })}
      >
        <span className="shrink-0 font-mono text-xs text-faint tabular-nums">
          {onlineCount}/{servers.length}
        </span>
      </Hint>

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
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t("common.notFound")}
            </div>
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
                {visible.map((server) => {
                  const index = servers.indexOf(server);
                  const status = statuses[server.ip];
                  const spans = parseMotd(status?.result?.descriptionRaw);
                  const mismatch =
                    checkServerCompatibility(
                      status?.result?.versionName,
                      instanceVersion,
                    ) === "mismatch";

                  return (
                    <ContextMenu key={`${server.ip}-${index}`}>
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
                              ? "bg-primary-soft"
                              : "hover:bg-accent/35",
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
                                <TriangleAlert
                                  className="size-3 shrink-0 text-warning"
                                  aria-label={t("servers.incompatibleShort")}
                                />
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

                          <div className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="font-mono text-xs tabular-nums">
                              {status?.result?.players
                                ? `${status.result.players.online}/${status.result.players.max}`
                                : status?.state === "offline"
                                  ? t("servers.statusOffline")
                                  : ""}
                            </span>
                            <span className="font-mono text-[0.65rem] text-faint tabular-nums">
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
                          <Zap />
                          {t("servers.join")}
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() => void copyAddress(server)}
                        >
                          <Copy />
                          {t("servers.copyAddress")}
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
                          onSelect={() => setDeleteIndex(index)}
                        >
                          <Trash />
                          {t("common.delete")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}

                {!readOnly && !query.trim() && (
                  <button
                    type="button"
                    onClick={() => setMode("create")}
                    className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-dashed text-xs text-faint transition-colors hover:border-border hover:bg-accent/25 hover:text-muted-foreground"
                  >
                    <Plus className="size-3.5" />
                    {t("servers.addAnother")}
                  </button>
                )}
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
                  if (mode === "edit") {
                    setServers((prev) =>
                      prev.map((entry, index) =>
                        index === selected ? server : entry,
                      ),
                    );
                  } else {
                    setServers((prev) => [...prev, server]);
                    setSelected(servers.length);
                    toast.success(t("servers.added"), {
                      description: t("servers.pendingSave"),
                    });
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
                onDelete={() => setDeleteIndex(selected)}
                onCopy={() => void copyAddress(current)}
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
            setServers((prev) => [...prev, ...imported]);
            setIsImporting(false);
            toast.success(t("servers.imported", { count: imported.length }), {
              description: t("servers.pendingSave"),
            });
          }}
        />
      )}

      {deleteIndex !== null && servers[deleteIndex] && (
        <Confirmation
          title={t("servers.deleteTitle")}
          content={[
            {
              text: t("servers.confirmation", {
                name: servers[deleteIndex].name,
              }),
            },
            { text: t("servers.deleteHint") },
          ]}
          buttons={[
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => {
                const index = deleteIndex;
                setServers((prev) => prev.filter((_, i) => i !== index));
                setSelected((current) =>
                  index < current ? current - 1 : current,
                );
                setDeleteIndex(null);
                setMode("details");
                toast.success(t("servers.deleted"), {
                  description: t("servers.pendingSave"),
                });
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setDeleteIndex(null),
            },
          ]}
          onClose={() => setDeleteIndex(null)}
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
        <p className="flex items-start gap-1.5 text-[0.7rem] leading-snug text-warning">
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
            <Gamepad2 className="size-4" />
            <span className="truncate">{t("servers.join")}</span>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-9 min-w-0 flex-1 shrink"
            onClick={onCreate}
          >
            <HardDriveDownload className="size-4" />
            <span className="truncate">
              {t("servers.discover.createInstance")}
            </span>
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
