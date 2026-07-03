const api = window.api;

import {
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LoaderLabel } from "./Loaders";

import { IServer as IServerSM } from "@/types/ServersList";
import { useTranslation } from "react-i18next";
import { IServerConf } from "@/types/Server";
import {
  Settings,
  Folder,
  ServerCog,
  ChartArea,
  Loader2,
  PackagePlus,
  Play,
  Search,
  CloudDownload,
  LayoutGrid,
  List,
  ArrowDownUp,
  X,
  Tag,
  SearchX,
} from "lucide-react";
import { VersionStatistics } from "./VersionStatistics";
import { IVersionSession, IVersionStatistics } from "@/types/VersionStatistics";
import { IWorldStatsAggregate } from "@/types/World";
import { useAtom, useAtomValue } from "jotai";
import {
  accountAtom,
  accountsAtom,
  addVersionModalAtom,
  authDataAtom,
  consolesMetaAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  networkAtom,
  manualOrderAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  versionsAtom,
  versionsLoadedAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  loadVersionTags,
  saveManualOrder,
  saveVersionTags,
} from "@renderer/utilities/versionOrganize";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RunGameParams } from "@renderer/App";
import { Version } from "@renderer/classes/Version";
import {
  checkDiffenceUpdateData,
  isOwner,
  parseVersionOwner,
} from "@renderer/utilities/version";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LazyDialogFallback } from "./LazyDialogFallback";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

const loadEditVersion = () =>
  import("./Modals/Version/EditVersion").then((module) => ({
    default: module.EditVersion,
  }));
const loadServerControl = () =>
  import("./ServerControl/Control").then((module) => ({
    default: module.ServerControl,
  }));

const LazyEditVersion = lazyWithPreload(loadEditVersion);
const LazyServerControl = lazyWithPreload(loadServerControl);

export interface IProgress {
  value: number;
  title: string;
}

enum LoadingType {
  SERVER = "server",
  INSTALL_SERVER = "install_server",
  INSTALL = "install",
  DELETE = "delete",
  SEARCH = "search",
  SHARE = "share",
  LOAD = "load",
  CHECK = "check",
  SAVE = "save",
  UPDATE = "update",
  VERSIONS = "versions",
  LOADERS = "loaders",
  SYNC = "sync",
  STATISTICS = "statistics",
  CHECK_DIFF_SHARE = "check_diff_share",
}

export type VersionDiffence = "sync" | "new" | "old";

function isInteractiveTarget(target: EventTarget | null, current: HTMLElement) {
  if (!(target instanceof HTMLElement) || target === current) return false;

  const interactive = target.closest(
    'button,a,input,textarea,select,[role="button"],[role="dialog"],[cmdk-root],[data-radix-portal],[data-slot="dialog-overlay"],[data-slot="dialog-content"],[data-slot="select-content"],[data-slot="dropdown-menu-content"],[data-slot="popover-content"],[data-slot="tooltip-content"],[data-radix-popper-content-wrapper]',
  );

  return !!interactive && interactive !== current;
}

function getTimeValue(value: unknown) {
  const time = new Date((value as string | number | Date | undefined) || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getVersionActivityTime(version: Version) {
  return Math.max(
    getTimeValue(version.version.lastLaunch),
    getTimeValue(version.version.lastUpdate),
  );
}

function useFlipList(orderKey: string) {
  const itemsRef = useRef(new Map<string, HTMLDivElement>());
  const lastPosRef = useRef(new Map<string, { left: number; top: number }>());
  const orderKeyRef = useRef(orderKey);

  useLayoutEffect(() => {
    const nextPos = new Map<string, { left: number; top: number }>();
    const orderChanged = orderKeyRef.current !== orderKey;
    orderKeyRef.current = orderKey;

    for (const [key, element] of itemsRef.current) {
      const left = element.offsetLeft;
      const top = element.offsetTop;
      nextPos.set(key, { left, top });

      if (!orderChanged) continue;

      const prev = lastPosRef.current.get(key);
      if (prev && (prev.left !== left || prev.top !== top)) {
        element.animate(
          [
            {
              transform: `translate(${prev.left - left}px, ${prev.top - top}px)`,
            },
            { transform: "translate(0, 0)" },
          ],
          { duration: 250, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      }
    }

    lastPosRef.current = nextPos;
  });

  return (key: string) => (element: HTMLDivElement | null) => {
    if (element) itemsRef.current.set(key, element);
    else itemsRef.current.delete(key);
  };
}

export function Versions({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const [editVersion, setEditVersion] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const setServers = useAtom(versionServersAtom)[1];
  const [versionDiffence, setVersionDiffence] =
    useState<VersionDiffence>("sync");

  const [loadingType, setLoadingType] = useState<LoadingType | null>(null);
  const [isServerManager, setIsServerManager] = useState(false);
  const [server, setServer] = useAtom(serverAtom);
  const [account] = useAtom(accountAtom);
  const [versionFlags, setVersionFlags] = useState<
    Record<string, { hasStatistics: boolean; hasServer: boolean }>
  >({});
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null);
  const [sessions, setSessions] = useState<IVersionSession[]>([]);
  const [worldStats, setWorldStats] = useState<IWorldStatsAggregate | null>(
    null,
  );
  const [isRunning] = useAtom(isRunningAtom);
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);
  const [paths] = useAtom(pathsAtom);
  const { t } = useTranslation();
  const [versions] = useAtom(versionsAtom);
  const [versionsLoaded] = useAtom(versionsLoadedAtom);
  const setIsAddVersionOpen = useAtom(addVersionModalAtom)[1];
  const [isNetwork] = useAtom(networkAtom);
  const [accounts] = useAtom(accountsAtom);
  const [authData] = useAtom(authDataAtom);
  const setIsDownloadedVersion = useAtom(isDownloadedVersionAtom)[1];
  const setIsOwnerVersion = useAtom(isOwnerVersionAtom)[1];
  const consoleMetas = useAtomValue(consolesMetaAtom);

  const selectReqIdRef = useRef(0);
  const hydratedSelectionRef = useRef(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() =>
    localStorage.getItem("grubie:versionsView") === "grid" ? "grid" : "list",
  );

  const setView = (mode: "list" | "grid") => {
    setViewMode(mode);
    localStorage.setItem("grubie:versionsView", mode);
  };

  useEffect(() => {
    if (!selectedVersion) return;
    return schedulePreload(
      [LazyEditVersion.preload, LazyServerControl.preload],
      300,
    );
  }, [selectedVersion]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        (versions || []).map(async (vc) => {
          const key = vc.versionPath || vc.version.name;
          try {
            const [statisticsPath, serverPath] = await Promise.all([
              api.path.join(vc.versionPath, "statistics.json"),
              api.path.join(vc.versionPath, "server"),
            ]);
            const [hasStatistics, hasServer] = await Promise.all([
              api.fs.pathExists(statisticsPath),
              api.fs.pathExists(serverPath),
            ]);
            return [key, { hasStatistics, hasServer }] as const;
          } catch {
            return [key, { hasStatistics: false, hasServer: false }] as const;
          }
        }),
      );
      if (!cancelled) setVersionFlags(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [versions]);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"activity" | "name" | "manual">(() => {
    const saved = localStorage.getItem("grubie:versionsSort");
    return saved === "name" || saved === "manual" ? saved : "activity";
  });
  const [manualOrder, setManualOrder] = useAtom(manualOrderAtom);
  const dragKeyRef = useRef<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<{
    kind: "loader" | "tag";
    value: string;
  } | null>(null);
  const [versionTags, setVersionTags] = useState<Record<string, string[]>>(() =>
    loadVersionTags(),
  );
  const [tagsEditor, setTagsEditor] = useState<{
    key: string;
    name: string;
  } | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  const setSort = (value: "activity" | "name" | "manual") => {
    setSortBy(value);
    localStorage.setItem("grubie:versionsSort", value);
  };

  const addTag = (key: string, raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    setVersionTags((prev) => {
      const existing = prev[key] || [];
      if (existing.some((x) => x.toLowerCase() === tag.toLowerCase())) {
        return prev;
      }
      const next = { ...prev, [key]: [...existing, tag] };
      saveVersionTags(next);
      return next;
    });
  };

  const removeTag = (key: string, tag: string) => {
    setVersionTags((prev) => {
      const filtered = (prev[key] || []).filter((x) => x !== tag);
      const next = { ...prev };
      if (filtered.length) next[key] = filtered;
      else delete next[key];
      saveVersionTags(next);
      return next;
    });
  };

  const sortedVersions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = (versions || []).filter((vc) => {
      const key = vc.versionPath || vc.version.name;
      const matchesQuery =
        !query || vc.version.name.toLowerCase().includes(query);
      const matchesFilter =
        !activeFilter ||
        (activeFilter.kind === "loader"
          ? vc.version.loader.name === activeFilter.value
          : (versionTags[key] || []).includes(activeFilter.value));
      return matchesQuery && matchesFilter;
    });

    if (sortBy === "manual") {
      const idx = (vc: Version) => {
        const i = manualOrder.indexOf(vc.versionPath || vc.version.name);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      list.sort(
        (a, b) => idx(a) - idx(b) || a.version.name.localeCompare(b.version.name),
      );
      return list;
    }

    list.sort((a, b) => {
      const aRunning = consoleMetas.some(
        (console) =>
          console.versionName == a.version.name && console.status == "running",
      );
      const bRunning = consoleMetas.some(
        (console) =>
          console.versionName == b.version.name && console.status == "running",
      );

      if (aRunning !== bRunning) return aRunning ? -1 : 1;

      if (sortBy === "name") {
        return a.version.name.localeCompare(b.version.name);
      }

      const activityDiff =
        getVersionActivityTime(b) - getVersionActivityTime(a);
      if (activityDiff !== 0) return activityDiff;

      return a.version.name.localeCompare(b.version.name);
    });
    return list;
  }, [
    consoleMetas,
    versions,
    searchQuery,
    sortBy,
    activeFilter,
    versionTags,
    manualOrder,
  ]);

  const orderKey = sortedVersions
    .map((vc) => vc.versionPath || vc.version.name)
    .join("|");
  const flipItemRef = useFlipList(orderKey);

  const availableLoaders = useMemo(
    () =>
      Array.from(new Set((versions || []).map((vc) => vc.version.loader.name))),
    [versions],
  );

  const allTags = useMemo(
    () => Array.from(new Set(Object.values(versionTags).flat())).sort(),
    [versionTags],
  );

  const reorderVersions = (fromKey: string, toKey: string) => {
    const keys = sortedVersions.map((vc) => vc.versionPath || vc.version.name);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, fromKey);
    setManualOrder(next);
    saveManualOrder(next);
  };

  const dragProps = (itemKey: string) =>
    sortBy === "manual"
      ? {
          draggable: true,
          onDragStart: (event: DragEvent<HTMLDivElement>) => {
            dragKeyRef.current = itemKey;
            event.dataTransfer.effectAllowed = "move";
            try {
              event.dataTransfer.setData("text/plain", itemKey);
            } catch {}
          },
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            const from = dragKeyRef.current;
            dragKeyRef.current = null;
            if (from && from !== itemKey) reorderVersions(from, itemKey);
          },
        }
      : {};

  const renderTagChips = (key: string, max: number) => {
    const tags = versionTags[key];
    if (!tags || tags.length === 0) return null;
    const shown = tags.slice(0, max);
    const extra = tags.length - shown.length;
    return (
      <>
        {shown.map((tag) => (
          <Badge
            key={tag}
            variant="outline"
            className="shrink-0 rounded-md border-primary/30 bg-primary/10 px-1.5 font-normal text-primary"
          >
            {tag}
          </Badge>
        ))}
        {extra > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            +{extra}
          </span>
        )}
      </>
    );
  };

  const clearSelectedVersion = () => {
    selectReqIdRef.current++;
    setSelectedVersion(undefined);
    setIsDownloadedVersion(false);
    setIsOwnerVersion(false);
    setServer(undefined);
    setStatisticsOpen(false);
    setStatistics(null);
    setSessions([]);
    setWorldStats(null);
    setVersionDiffence("sync");
  };

  const selectVersion = async (vc: Version, ownerOk: boolean) => {
    const reqId = ++selectReqIdRef.current;

    setSelectedVersion(vc);
    setIsDownloadedVersion(vc.version.downloadedVersion);
    setIsOwnerVersion(ownerOk);

    try {
      const serverPath = await api.path.join(vc.versionPath, "server");
      const serverConf = await api.path.join(serverPath, "conf.json");

      const isExists = await api.fs.pathExists(serverPath);
      if (reqId !== selectReqIdRef.current) return;

      if (isExists) {
        const conf: IServerConf = await api.fs.readJSON<IServerConf>(
          serverConf,
          "utf-8",
        );
        if (reqId !== selectReqIdRef.current) return;
        setServer(conf);
      } else {
        setServer(undefined);
      }

      const statisticsPath = await api.path.join(
        vc.versionPath,
        "statistics.json",
      );
      const isStatisticsExists = await api.fs.pathExists(statisticsPath);
      if (reqId !== selectReqIdRef.current) return;
      setVersionFlags((prev) => ({
        ...prev,
        [vc.versionPath || vc.version.name]: {
          hasStatistics: isStatisticsExists,
          hasServer: isExists,
        },
      }));
    } catch {
      if (reqId !== selectReqIdRef.current) return;
      setServer(undefined);
      setVersionFlags((prev) => ({
        ...prev,
        [vc.versionPath || vc.version.name]: {
          hasStatistics: false,
          hasServer: false,
        },
      }));
    }
  };

  useEffect(() => {
    if (hydratedSelectionRef.current) return;
    if (!versionsLoaded || !account || !selectedVersion) return;

    hydratedSelectionRef.current = true;
    const current =
      versions.find(
        (v) => v.version.name === selectedVersion.version.name,
      ) || selectedVersion;
    void selectVersion(current, isOwner(current.version.owner, account));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionsLoaded, account, selectedVersion, versions]);

  const cardActions = (
    vc: Version,
    ownerOk: boolean,
    isRunningInstance: boolean,
  ) => {
    const isSelected = selectedVersion?.version.name === vc.version.name;
    const itemKey = vc.versionPath || vc.version.name;
    return (
      <>
        <Button
          size="icon-lg"
          disabled={!account || isRunning}
          title={
            isRunningInstance
              ? t("versions.playAnotherInstance")
              : t("nav.play")
          }
          aria-label={
            isRunningInstance
              ? t("versions.playAnotherInstance")
              : t("nav.play")
          }
          onClick={(event) => {
            event.stopPropagation();
            if (!isSelected) {
              void selectVersion(vc, ownerOk);
            }
            void runGame({ version: vc });
          }}
        >
          <Play className="size-4" />
        </Button>

        {isSelected && (
          <>
            {versionFlags[itemKey]?.hasStatistics && vc.versionPath && (
              <Button
                variant="outline"
                size="icon-lg"
                className="bg-background/85 hover:bg-background"
                disabled={!ownerOk}
                title={t("versionStatistics.title")}
                aria-label={t("versionStatistics.title")}
                onMouseEnter={() => preload(LazyEditVersion.preload)}
                onFocus={() => preload(LazyEditVersion.preload)}
                onClick={async () => {
                  const filePath = await api.path.join(
                    vc.versionPath,
                    "statistics.json",
                  );

                  try {
                    const exists = await api.fs.pathExists(filePath);
                    if (!exists) return;

                    setIsLoading(true);
                    setLoadingType(LoadingType.STATISTICS);

                    const data = await api.fs.readJSON<IVersionStatistics>(
                      filePath,
                      "utf-8",
                    );

                    const sessionsPath = await api.path.join(
                      vc.versionPath,
                      "sessions.json",
                    );
                    let loadedSessions: IVersionSession[] = [];
                    try {
                      if (await api.fs.pathExists(sessionsPath)) {
                        loadedSessions = await api.fs.readJSON<
                          IVersionSession[]
                        >(sessionsPath, "utf-8");
                      }
                    } catch {
                      loadedSessions = [];
                    }

                    let loadedWorldStats: IWorldStatsAggregate | null = null;
                    if (account) {
                      try {
                        loadedWorldStats =
                          await api.worlds.loadVersionStatistics(
                            vc.versionPath,
                            account,
                          );
                      } catch {
                        loadedWorldStats = null;
                      }
                    }

                    setStatistics(data);
                    setSessions(
                      Array.isArray(loadedSessions) ? loadedSessions : [],
                    );
                    setWorldStats(loadedWorldStats);
                    setStatisticsOpen(true);
                  } catch {
                    try {
                      await api.fs.rimraf(filePath);
                      setVersionFlags((prev) => ({
                        ...prev,
                        [itemKey]: {
                          hasStatistics: false,
                          hasServer: prev[itemKey]?.hasServer ?? false,
                        },
                      }));
                    } catch {}
                    toast.error(t("versionStatistics.error"));
                  } finally {
                    setIsLoading(false);
                    setLoadingType(null);
                  }
                }}
              >
                {isLoading && loadingType == LoadingType.STATISTICS ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ChartArea className="size-4" />
                )}
              </Button>
            )}

            <Button
              variant="outline"
              size="icon-lg"
              className="bg-background/85 hover:bg-background"
              title={t("common.openFolder")}
              aria-label={t("common.openFolder")}
              onClick={async () => {
                try {
                  await api.shell.openPath(vc.versionPath);
                } catch {}
              }}
            >
              <Folder className="size-4" />
            </Button>

            {versionFlags[itemKey]?.hasServer && (
              <Button
                variant="outline"
                size="icon-lg"
                className="bg-background/85 hover:bg-background"
                title={t("versions.serverManager")}
                aria-label={t("versions.serverManager")}
                onMouseEnter={() => preload(LazyServerControl.preload)}
                onFocus={() => preload(LazyServerControl.preload)}
                onClick={() => setIsServerManager(true)}
              >
                <ServerCog className="size-4" />
              </Button>
            )}

            <Button
              variant="outline"
              size="icon-lg"
              className="bg-background/85 hover:bg-background"
              title={t("versions.tags.manage")}
              aria-label={t("versions.tags.manage")}
              onClick={() =>
                setTagsEditor({ key: itemKey, name: vc.version.name })
              }
            >
              <Tag className="size-4" />
            </Button>

            <Button
              variant="outline"
              size="icon-lg"
              className="bg-background/85 hover:bg-background"
              disabled={isRunning || isRunningInstance}
              title={t("settings.title")}
              aria-label={t("settings.title")}
              onMouseEnter={() => preload(LazyEditVersion.preload)}
              onFocus={() => preload(LazyEditVersion.preload)}
              onClick={async () => {
                setLoadingType(LoadingType.LOAD);
                setIsLoading(true);

                try {
                  let servers: IServerSM[] = [];

                  const serversPath = await api.path.join(
                    vc.versionPath,
                    "servers.dat",
                  );

                  try {
                    const data = await api.servers.read(serversPath);
                    servers = data;
                    setServers(data);
                  } catch {
                    servers = [];
                    setServers([]);
                  }

                  if (vc.version.shareCode && ownerOk && isNetwork) {
                    try {
                      const modpackData = await api.backend.getModpack(
                        account?.accessToken || "",
                        vc.version.shareCode,
                      );

                      if (modpackData.status == "not_found") {
                        vc.version.shareCode = undefined;
                        vc.version.downloadedVersion = false;
                        await vc.save();
                      } else if (modpackData.data) {
                        const modpack = modpackData.data;

                        if (
                          vc.version.downloadedVersion &&
                          authData?.sub &&
                          authData.sub == String(modpack.owner?._id ?? "")
                        ) {
                          vc.version.downloadedVersion = false;
                          await vc.save();
                          setIsDownloadedVersion(false);
                        }

                        let status: VersionDiffence = "sync";

                        if (modpack.build) {
                          if (
                            vc.version.downloadedVersion &&
                            modpack.build < vc.version.build
                          ) {
                            status = "new";
                          } else if (modpack.build > vc.version.build) {
                            status = "old";
                          }
                        }

                        if (status == "sync") {
                          const diff = await checkDiffenceUpdateData(
                            {
                              mods: vc.version.loader.mods,
                              runArguments: vc.version.runArguments || {
                                game: "",
                                jvm: "",
                              },
                              servers,
                              version: vc.version,
                              versionPath: vc.versionPath,
                              logo: vc.version.image || "",
                              quickServer: vc.version.quickServer || "",
                            },
                            account?.accessToken || "",
                            modpack,
                          );

                          if (diff) {
                            status = !vc.version.downloadedVersion
                              ? "new"
                              : "old";
                          }
                        }

                        setVersionDiffence(status);
                      }
                    } catch {}
                  }

                  setEditVersion(true);
                } finally {
                  setLoadingType(null);
                  setIsLoading(false);
                }
              }}
            >
              {isLoading && loadingType == LoadingType.LOAD ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Settings className="size-4" />
              )}
            </Button>
          </>
        )}
      </>
    );
  };

  return (
    <>
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card p-2.5 text-card-foreground shadow-sm">
        {(versions?.length ?? 0) > 0 && (
          <>
            <div className="mb-2 flex shrink-0 items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  placeholder={t("versions.searchPlaceholder")}
                  className="h-9 pl-8"
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              {selectedVersion && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="size-9"
                  aria-label={t("versions.deselect")}
                  title={t("versions.deselect")}
                  onClick={clearSelectedVersion}
                >
                  <X className="size-4" />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="size-9"
                    aria-label={t("versions.sort.label")}
                    title={t("versions.sort.label")}
                  >
                    <ArrowDownUp className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={sortBy}
                    onValueChange={(value) =>
                      setSort(value as "activity" | "name" | "manual")
                    }
                  >
                    <DropdownMenuRadioItem value="activity">
                      {t("versions.sort.activity")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name">
                      {t("versions.sort.name")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">
                      {t("versions.sort.manual")}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-background p-0.5">
                <Button
                  size="icon-sm"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  aria-label={t("versions.viewList")}
                  title={t("versions.viewList")}
                  onClick={() => setView("list")}
                >
                  <List className="size-4" />
                </Button>
                <Button
                  size="icon-sm"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  aria-label={t("versions.viewGrid")}
                  title={t("versions.viewGrid")}
                  onClick={() => setView("grid")}
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>
            </div>
            {(availableLoaders.length >= 2 || allTags.length > 0) && (
              <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  variant={activeFilter === null ? "outline" : "secondary"}
                  className="h-7"
                  onClick={() => setActiveFilter(null)}
                >
                  {t("versions.filterAll")}
                </Button>
                {availableLoaders.length >= 2 &&
                  availableLoaders.map((loaderName) => {
                    const active =
                      activeFilter?.kind === "loader" &&
                      activeFilter.value === loaderName;
                    return (
                      <Button
                        key={"loader-" + loaderName}
                        size="sm"
                        variant={active ? "outline" : "secondary"}
                        className="h-7"
                        onClick={() =>
                          setActiveFilter(
                            active
                              ? null
                              : { kind: "loader", value: loaderName },
                          )
                        }
                      >
                        <LoaderLabel loader={loaderName} />
                      </Button>
                    );
                  })}
                {allTags.map((tag) => {
                  const active =
                    activeFilter?.kind === "tag" && activeFilter.value === tag;
                  return (
                    <Button
                      key={"tag-" + tag}
                      size="sm"
                      variant={active ? "outline" : "secondary"}
                      className="h-7 gap-1"
                      onClick={() =>
                        setActiveFilter(
                          active ? null : { kind: "tag", value: tag },
                        )
                      }
                    >
                      <Tag className="size-3" />
                      {tag}
                    </Button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {!versionsLoaded ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : sortedVersions.length == 0 ? (
          <Empty className="h-full flex-1 border bg-muted/20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {(versions?.length ?? 0) > 0 ? <SearchX /> : <PackagePlus />}
              </EmptyMedia>
              <EmptyTitle>
                {(versions?.length ?? 0) > 0
                  ? t("versions.noResults")
                  : t("versions.noVersions")}
              </EmptyTitle>
            </EmptyHeader>
            {(versions?.length ?? 0) > 0 ? (
              <Button
                variant="outline"
                className="mt-1"
                onClick={() => {
                  setSearchQuery("");
                  setActiveFilter(null);
                }}
              >
                {t("versions.clearFilters")}
              </Button>
            ) : (
              <Button
                className="mt-1"
                disabled={!account}
                onClick={() => setIsAddVersionOpen(true)}
              >
                <PackagePlus className="size-4" />
                {t("nav.addVersion")}
              </Button>
            )}
          </Empty>
        ) : (
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <TooltipProvider>
              <div
                className={cn(
                  viewMode === "grid"
                    ? "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2.5"
                    : "flex flex-col gap-2",
                )}
              >
                {sortedVersions.map((vc) => {
                  const isSelected =
                    selectedVersion?.version.name === vc.version.name;
                  const isRunningInstance = consoleMetas.some(
                    (c) =>
                      c.versionName == vc.version.name && c.status == "running",
                  );

                  const ownerOk = isOwner(vc.version.owner, account);
                  const ownerInfo = parseVersionOwner(vc.version.owner);
                  const ownerAvatar =
                    ownerInfo && !ownerOk
                      ? accounts?.find(
                          (a) =>
                            a.type == ownerInfo.type &&
                            a.nickname == ownerInfo.nickname,
                        )
                      : undefined;

                  const itemKey = vc.versionPath || vc.version.name;

                  if (viewMode === "grid") {
                    return (
                      <div
                      key={itemKey}
                      ref={flipItemRef(itemKey)}
                      className={
                        sortBy === "manual"
                          ? "cursor-grab active:cursor-grabbing"
                          : undefined
                      }
                      {...dragProps(itemKey)}
                    >
                        <Card
                          className={cn(
                            "group relative flex h-44 min-h-0 w-full flex-col gap-0 overflow-hidden rounded-xl py-0 shadow-none transition-all",
                            isSelected
                              ? "border-primary bg-accent shadow-sm ring-1 ring-primary/20"
                              : "bg-card hover:border-primary/30 hover:bg-accent/55 hover:shadow-md",
                            !isRunning && !!account && !isSelected
                              ? "cursor-pointer"
                              : "cursor-default",
                          )}
                          role={
                            !isRunning && !!account && !isSelected
                              ? "button"
                              : undefined
                          }
                          tabIndex={
                            !isRunning && !!account && !isSelected ? 0 : undefined
                          }
                          aria-selected={isSelected}
                          onClick={async (event: MouseEvent<HTMLDivElement>) => {
                            if (
                              isInteractiveTarget(
                                event.target,
                                event.currentTarget,
                              )
                            )
                              return;
                            if (!account || isLoading || isRunning) return;
                            if (isSelected) return;
                            await selectVersion(vc, ownerOk);
                          }}
                          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key !== "Enter" && event.key !== " ")
                              return;
                            event.preventDefault();
                            event.currentTarget.click();
                          }}
                          onContextMenu={(
                            event: MouseEvent<HTMLDivElement>,
                          ) => {
                            if (!isSelected) return;
                            if (
                              isInteractiveTarget(
                                event.target,
                                event.currentTarget,
                              )
                            )
                              return;
                            event.preventDefault();
                            clearSelectedVersion();
                          }}
                        >
                          <div className="relative flex h-24 w-full shrink-0 items-center justify-center overflow-hidden bg-muted">
                            {vc.version.image ? (
                              <>
                                <img
                                  src={vc.version.image}
                                  aria-hidden
                                  draggable={false}
                                  className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl select-none"
                                />
                                <img
                                  src={vc.version.image}
                                  draggable={false}
                                  className="relative size-20 rounded-2xl object-cover shadow-lg ring-1 ring-primary/15 transition-transform duration-300 select-none group-hover:scale-105"
                                  alt={vc.version.name}
                                />
                              </>
                            ) : (
                              <div className="relative flex size-20 items-center justify-center rounded-2xl border bg-card text-xl font-medium text-muted-foreground shadow-sm">
                                {vc.version.name.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            {!ownerOk && ownerInfo && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="absolute top-2 right-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    aria-label={t("versions.ownerTooltip", {
                                      nickname: ownerInfo.nickname,
                                    })}
                                  >
                                    <Avatar className="size-5 border border-border bg-card shadow-sm ring-2 ring-card">
                                      <AvatarImage
                                        src={ownerAvatar?.image}
                                        alt={ownerInfo.nickname}
                                      />
                                      <AvatarFallback className="text-[0.55rem]">
                                        {ownerInfo.nickname
                                          .slice(0, 2)
                                          .toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("versions.ownerTooltip", {
                                    nickname: ownerInfo.nickname,
                                  })}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {isRunningInstance && (
                              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
                                <span className="size-1.5 animate-pulse rounded-full bg-white" />
                                {t("versions.running")}
                              </div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-end gap-1.5 bg-gradient-to-t from-background/80 to-transparent p-2">
                              {cardActions(vc, ownerOk, isRunningInstance)}
                            </div>
                          </div>

                          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-2.5">
                            <p className="truncate text-sm leading-tight font-medium text-foreground">
                              {vc.version.name}
                            </p>
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge
                                variant="outline"
                                className="max-w-24 shrink-0 rounded-md border-border bg-background font-normal"
                              >
                                <LoaderLabel
                                  loader={vc.version.loader.name}
                                  textClassName="whitespace-nowrap"
                                />
                              </Badge>
                              <Badge
                                variant="outline"
                                className="max-w-24 truncate rounded-md border-border bg-background font-normal"
                                title={vc.version.version.id}
                              >
                                {vc.version.version.id}
                              </Badge>
                              {vc.version.downloadedVersion && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-md border-sky-500/30 bg-sky-500/10 px-1.5 text-sky-600 dark:text-sky-400"
                                  title={t("versions.downloadedLabel")}
                                >
                                  <CloudDownload className="size-3.5" />
                                </Badge>
                              )}
                              {renderTagChips(itemKey, 3)}
                            </div>
                          </div>
                        </Card>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={itemKey}
                      ref={flipItemRef(itemKey)}
                      className={
                        sortBy === "manual"
                          ? "cursor-grab active:cursor-grabbing"
                          : undefined
                      }
                      {...dragProps(itemKey)}
                    >
                    <Card
                      className={cn(
                        "group h-20 min-h-0 w-full gap-0 overflow-hidden rounded-xl py-0 shadow-none transition-all",
                        isSelected
                          ? "border-primary bg-accent shadow-sm ring-1 ring-primary/20"
                          : "bg-card hover:border-primary/30 hover:bg-accent/55 hover:shadow-md",
                        !isRunning && !!account && !isSelected
                          ? "cursor-pointer"
                          : "cursor-default",
                      )}
                      role={
                        !isRunning && !!account && !isSelected
                          ? "button"
                          : undefined
                      }
                      tabIndex={
                        !isRunning && !!account && !isSelected ? 0 : undefined
                      }
                      aria-selected={isSelected}
                      onClick={async (event: MouseEvent<HTMLDivElement>) => {
                        if (
                          isInteractiveTarget(event.target, event.currentTarget)
                        )
                          return;
                        if (!account || isLoading || isRunning) return;
                        if (isSelected) return;

                        await selectVersion(vc, ownerOk);
                      }}
                      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.currentTarget.click();
                      }}
                      onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
                        if (!isSelected) return;
                        if (
                          isInteractiveTarget(event.target, event.currentTarget)
                        )
                          return;

                        event.preventDefault();
                        clearSelectedVersion();
                      }}
                    >
                      <CardContent className="h-full p-3">
                        <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="flex min-w-0 items-center gap-3.5">
                            <div className="relative shrink-0">
                              {vc.version.image ? (
                                <img
                                  src={vc.version.image}
                                  width={52}
                                  height={52}
                                  draggable={false}
                                  className="size-[52px] rounded-xl border bg-muted object-cover select-none"
                                  alt={vc.version.name}
                                />
                              ) : (
                                <div className="flex size-[52px] items-center justify-center rounded-xl border bg-muted text-base text-muted-foreground">
                                  {vc.version.name.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                              {!ownerOk && ownerInfo && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="absolute -right-1 -top-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={t("versions.ownerTooltip", {
                                        nickname: ownerInfo.nickname,
                                      })}
                                    >
                                      <Avatar className="size-5 border border-border bg-card shadow-sm ring-2 ring-card">
                                        <AvatarImage
                                          src={ownerAvatar?.image}
                                          alt={ownerInfo.nickname}
                                        />
                                        <AvatarFallback className="text-[0.55rem]">
                                          {ownerInfo.nickname
                                            .slice(0, 2)
                                            .toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("versions.ownerTooltip", {
                                      nickname: ownerInfo.nickname,
                                    })}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <p className="truncate text-base leading-tight font-medium text-foreground">
                                {vc.version.name}
                              </p>
                              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                <Badge
                                  variant="outline"
                                  className="max-w-28 shrink-0 rounded-md border-border bg-background font-normal"
                                >
                                  <LoaderLabel
                                    loader={vc.version.loader.name}
                                    textClassName="whitespace-nowrap"
                                  />
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="max-w-32 truncate rounded-md border-border bg-background font-normal"
                                  title={vc.version.version.id}
                                >
                                  {vc.version.version.id}
                                </Badge>

                                {vc.version.downloadedVersion && (
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 rounded-md border-sky-500/30 bg-sky-500/10 px-1.5 text-sky-600 dark:text-sky-400"
                                    title={t("versions.downloadedLabel")}
                                  >
                                    <CloudDownload className="size-3.5" />
                                  </Badge>
                                )}

                                {isRunningInstance && (
                                  <Badge className="border-emerald-600/30 bg-emerald-600/15 text-emerald-500">
                                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                    {t("versions.running")}
                                  </Badge>
                                )}
                                {renderTagChips(itemKey, 2)}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {cardActions(vc, ownerOk, isRunningInstance)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </ScrollArea>
        )}
      </section>

      {editVersion && selectedVersion && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyEditVersion
            closeModal={async () => {
              setEditVersion(false);
              try {
                if (paths.launcher) {
                  await api.fs.rimraf(
                    await api.path.join(paths.launcher, "temp"),
                  );
                }
              } catch {}
            }}
            vd={versionDiffence}
            runGame={runGame}
          />
        </Suspense>
      )}

      {statisticsOpen && statistics && (
        <VersionStatistics
          onClose={() => {
            setStatisticsOpen(false);
            setStatistics(null);
            setSessions([]);
            setWorldStats(null);
          }}
          statistics={statistics}
          sessions={sessions}
          worldStats={worldStats}
        />
      )}

      {isServerManager && server && selectedVersion && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyServerControl
            onClose={() => setIsServerManager(false)}
            onDelete={() => setServer(undefined)}
          />
        </Suspense>
      )}

      {tagsEditor && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setTagsEditor(null);
              setTagDraft("");
            }
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex min-w-0 items-center gap-2">
                <Tag className="size-5 shrink-0" />
                <span className="truncate">
                  {t("versions.tags.title", { name: tagsEditor.name })}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap gap-1.5">
              {(versionTags[tagsEditor.key] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("versions.tags.empty")}
                </p>
              ) : (
                (versionTags[tagsEditor.key] || []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      aria-label={t("versions.tags.remove")}
                      onClick={() => removeTag(tagsEditor.key, tag)}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                addTag(tagsEditor.key, tagDraft);
                setTagDraft("");
              }}
            >
              <Input
                value={tagDraft}
                placeholder={t("versions.tags.add")}
                maxLength={24}
                onChange={(event) => setTagDraft(event.target.value)}
              />
            </form>

            {allTags.filter(
              (tag) => !(versionTags[tagsEditor.key] || []).includes(tag),
            ).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {allTags
                  .filter(
                    (tag) => !(versionTags[tagsEditor.key] || []).includes(tag),
                  )
                  .map((tag) => (
                    <Button
                      key={tag}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      onClick={() => addTag(tagsEditor.key, tag)}
                    >
                      + {tag}
                    </Button>
                  ))}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => {
                  setTagsEditor(null);
                  setTagDraft("");
                }}
              >
                {t("common.close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
