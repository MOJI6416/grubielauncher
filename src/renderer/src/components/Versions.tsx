const api = window.api;

import {
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
} from "lucide-react";
import { VersionStatistics } from "./VersionStatistics";
import { IVersionStatistics } from "@/types/VersionStatistics";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  addVersionModalAtom,
  authDataAtom,
  consolesAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  networkAtom,
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

function useFlipList() {
  const itemsRef = useRef(new Map<string, HTMLDivElement>());
  const lastTopsRef = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const nextTops = new Map<string, number>();

    for (const [key, element] of itemsRef.current) {
      const top = element.offsetTop;
      nextTops.set(key, top);

      const prevTop = lastTopsRef.current.get(key);
      if (prevTop != null && prevTop !== top) {
        element.animate(
          [
            { transform: `translateY(${prevTop - top}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 250, easing: "cubic-bezier(0.2, 0, 0, 1)" },
        );
      }
    }

    lastTopsRef.current = nextTops;
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
  const [isStatistics, setIsStatistics] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null);
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
  const [consoles] = useAtom(consolesAtom);

  const selectReqIdRef = useRef(0);
  const flipItemRef = useFlipList();

  useEffect(() => {
    if (!selectedVersion) return;
    return schedulePreload(
      [LazyEditVersion.preload, LazyServerControl.preload],
      300,
    );
  }, [selectedVersion]);

  const [searchQuery, setSearchQuery] = useState("");

  const sortedVersions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = (versions || []).filter(
      (vc) => !query || vc.version.name.toLowerCase().includes(query),
    );
    list.sort((a, b) => {
      const aRunning = consoles.consoles.some(
        (console) =>
          console.versionName == a.version.name && console.status == "running",
      );
      const bRunning = consoles.consoles.some(
        (console) =>
          console.versionName == b.version.name && console.status == "running",
      );

      if (aRunning !== bRunning) return aRunning ? -1 : 1;

      const activityDiff =
        getVersionActivityTime(b) - getVersionActivityTime(a);
      if (activityDiff !== 0) return activityDiff;

      return a.version.name.localeCompare(b.version.name);
    });
    return list;
  }, [consoles.consoles, versions, searchQuery]);

  const clearSelectedVersion = () => {
    selectReqIdRef.current++;
    setSelectedVersion(undefined);
    setIsDownloadedVersion(false);
    setIsOwnerVersion(false);
    setServer(undefined);
    setIsStatistics(false);
    setStatisticsOpen(false);
    setStatistics(null);
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
      setIsStatistics(isStatisticsExists);
    } catch {
      if (reqId !== selectReqIdRef.current) return;
      setServer(undefined);
      setIsStatistics(false);
    }
  };

  return (
    <>
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card p-2.5 text-card-foreground shadow-sm">
        {((versions?.length ?? 0) >= 6 || searchQuery) && (
          <div className="relative mb-2 shrink-0">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              placeholder={t("versions.searchPlaceholder")}
              className="h-9 pl-8"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>
        )}
        {!versionsLoaded ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-[4.5rem] w-full rounded-xl" />
            ))}
          </div>
        ) : sortedVersions.length == 0 ? (
          <Empty className="h-full flex-1 border bg-muted/20">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackagePlus />
              </EmptyMedia>
              <EmptyTitle>{t("versions.noVersions")}</EmptyTitle>
            </EmptyHeader>
            {!searchQuery && (
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
              <div className="flex flex-col gap-2">
                {sortedVersions.map((vc) => {
                  const isSelected =
                    selectedVersion?.version.name === vc.version.name;
                  const isRunningInstance = consoles.consoles.some(
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

                  return (
                    <div key={itemKey} ref={flipItemRef(itemKey)}>
                    <Card
                      className={cn(
                        "group h-[4.5rem] min-h-0 w-full gap-0 overflow-hidden rounded-xl py-0 shadow-none transition-all",
                        isSelected
                          ? "border-primary bg-accent shadow-sm ring-1 ring-primary/20"
                          : "bg-card hover:border-primary/30 hover:bg-accent/55",
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
                      <CardContent className="h-full p-2.5">
                        <div className="grid h-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="relative shrink-0">
                              {vc.version.image ? (
                                <img
                                  src={vc.version.image}
                                  width={48}
                                  height={48}
                                  className="size-12 rounded-lg border bg-muted object-cover"
                                  alt={vc.version.name}
                                />
                              ) : (
                                <div className="flex size-12 items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
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

                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                              <p className="truncate text-sm font-medium text-foreground">
                                {vc.version.name}
                              </p>
                              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                <LoaderLabel
                                  loader={vc.version.loader.name}
                                  className="max-w-24 shrink-0"
                                  textClassName="whitespace-nowrap"
                                />
                                <Badge
                                  variant="outline"
                                  className="max-w-32 truncate rounded-md font-normal"
                                  title={vc.version.version.id}
                                >
                                  {vc.version.version.id}
                                </Badge>

                                {isRunningInstance && (
                                  <Badge className="border-emerald-600/30 bg-emerald-600/15 text-emerald-500">
                                    <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                                    {t("versions.running")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "shrink-0 items-center gap-1.5",
                              isSelected ? "flex" : "hidden group-hover:flex",
                            )}
                          >
                            <Button
                              size="icon-lg"
                              className="bg-emerald-600 text-white hover:bg-emerald-500"
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
                              {isStatistics && vc.versionPath && (
                                <Button
                                  variant="outline"
                                  size="icon-lg"
                                  className="bg-background/85 hover:bg-background"
                                  disabled={!ownerOk}
                                  title={t("versionStatistics.title")}
                                  aria-label={t("versionStatistics.title")}
                                  onMouseEnter={() =>
                                    preload(LazyEditVersion.preload)
                                  }
                                  onFocus={() =>
                                    preload(LazyEditVersion.preload)
                                  }
                                  onClick={async () => {
                                    const filePath = await api.path.join(
                                      vc.versionPath,
                                      "statistics.json",
                                    );

                                    try {
                                      const exists =
                                        await api.fs.pathExists(filePath);
                                      if (!exists) return;

                                      setIsLoading(true);
                                      setLoadingType(LoadingType.STATISTICS);

                                      const data =
                                        await api.fs.readJSON<IVersionStatistics>(
                                          filePath,
                                          "utf-8",
                                        );

                                      setStatistics(data);
                                      setStatisticsOpen(true);
                                    } catch {
                                      try {
                                        await api.fs.rimraf(filePath);
                                        setIsStatistics(false);
                                      } catch {}
                                      toast.error(t("versionStatistics.error"));
                                    } finally {
                                      setIsLoading(false);
                                      setLoadingType(null);
                                    }
                                  }}
                                >
                                  {isLoading &&
                                  loadingType == LoadingType.STATISTICS ? (
                                    <Loader2
                                      className="size-4 animate-spin"
                                    />
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

                              {server && (
                                <Button
                                  variant="outline"
                                  size="icon-lg"
                                  className="bg-background/85 hover:bg-background"
                                  title={t("versions.serverManager")}
                                  aria-label={t("versions.serverManager")}
                                  onMouseEnter={() =>
                                    preload(LazyServerControl.preload)
                                  }
                                  onFocus={() =>
                                    preload(LazyServerControl.preload)
                                  }
                                  onClick={() => setIsServerManager(true)}
                                >
                                  <ServerCog className="size-4" />
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="icon-lg"
                                className="bg-background/85 hover:bg-background"
                                disabled={isRunning || isRunningInstance}
                                title={t("settings.title")}
                                aria-label={t("settings.title")}
                                onMouseEnter={() =>
                                  preload(LazyEditVersion.preload)
                                }
                                onFocus={() =>
                                  preload(LazyEditVersion.preload)
                                }
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
                                      const data =
                                        await api.servers.read(serversPath);
                                      servers = data;
                                      setServers(data);
                                    } catch {
                                      servers = [];
                                      setServers([]);
                                    }

                                    if (
                                      vc.version.shareCode &&
                                      ownerOk &&
                                      isNetwork
                                    ) {
                                      try {
                                        const modpackData =
                                          await api.backend.getModpack(
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
                                            authData.sub ==
                                              String(modpack.owner?._id ?? "")
                                          ) {
                                            vc.version.downloadedVersion =
                                              false;
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
                                            } else if (
                                              modpack.build > vc.version.build
                                            ) {
                                              status = "old";
                                            }
                                          }

                                          if (status == "sync") {
                                            const diff =
                                              await checkDiffenceUpdateData(
                                                {
                                                  mods: vc.version.loader.mods,
                                                  runArguments: vc.version
                                                    .runArguments || {
                                                    game: "",
                                                    jvm: "",
                                                  },
                                                  servers,
                                                  version: vc.version,
                                                  versionPath: vc.versionPath,
                                                  logo: vc.version.image || "",
                                                  quickServer:
                                                    vc.version.quickServer ||
                                                    "",
                                                },
                                                account?.accessToken || "",
                                                modpack,
                                              );

                                            if (diff) {
                                              status = !vc.version
                                                .downloadedVersion
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
                                {isLoading &&
                                loadingType == LoadingType.LOAD ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Settings className="size-4" />
                                )}
                              </Button>
                              </>
                            )}
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
          }}
          statistics={statistics}
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
    </>
  );
}
