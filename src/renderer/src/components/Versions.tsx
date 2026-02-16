const api = window.api;

import { useMemo, useRef, useState } from "react";
import { loaders } from "./Loaders";

import { IServer as IServerSM } from "@/types/ServersList";
import { useTranslation } from "react-i18next";
import { IServerConf } from "@/types/Server";
import { ServerControl } from "./ServerControl/Control";
import { Settings, Folder, ServerCog, ChartArea } from "lucide-react";
import { VersionStatistics } from "./VersionStatistics";
import { IVersionStatistics } from "@/types/VersionStatistics";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  consolesAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  versionsAtom,
  versionServersAtom,
} from "@renderer/stores/atoms";
import { EditVersion } from "./Modals/Version/EditVersion";
import {
  addToast,
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  Image,
  ScrollShadow,
} from "@heroui/react";
import { RunGameParams } from "@renderer/App";
import { checkDiffenceUpdateData, isOwner } from "@renderer/utilities/version";

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
  const [isNetwork] = useAtom(networkAtom);
  const [accounts] = useAtom(accountsAtom);
  const setIsDownloadedVersion = useAtom(isDownloadedVersionAtom)[1];
  const setIsOwnerVersion = useAtom(isOwnerVersionAtom)[1];
  const [consoles] = useAtom(consolesAtom);

  const selectReqIdRef = useRef(0);

  const sortedVersions = useMemo(() => {
    const list = [...(versions || [])];
    list.sort((a, b) => {
      const aTime = new Date(a.version.lastLaunch || 0).getTime();
      const bTime = new Date(b.version.lastLaunch || 0).getTime();
      const at = Number.isFinite(aTime) ? aTime : 0;
      const bt = Number.isFinite(bTime) ? bTime : 0;
      return bt - at;
    });
    return list;
  }, [versions]);

  return (
    <>
      <div className="w-full h-full">
        {sortedVersions.length == 0 ? (
          <div className="flex items-start space-x-4 w-full">
            <Alert color="warning" title={t("versions.noVersions")} />
          </div>
        ) : (
          <ScrollShadow className="h-full">
            {sortedVersions.map((vc) => {
              const isSelected =
                selectedVersion?.version.name === vc.version.name;
              const isRunningInstance = consoles.consoles.some(
                (c) =>
                  c.versionName == vc.version.name && c.status == "running",
              );

              const ownerOk = isOwner(vc.version.owner, account);
              const ownerParts = vc.version.owner?.split("_");
              const ownerAvatar =
                vc.version.owner && !ownerOk && ownerParts?.length === 2
                  ? accounts?.find(
                      (a) =>
                        a.type == ownerParts[0] && a.nickname == ownerParts[1],
                    )
                  : undefined;

              const loaderInfo =
                loaders[vc.version.loader.name] || loaders["vanilla"];

              return (
                <Card
                  className={`w-full mb-2 ${isSelected ? "border-primary-200 border-1" : ""}`}
                  key={vc.versionPath || vc.version.name}
                  isPressable={!isRunning && !!account && !isSelected}
                  onPress={async () => {
                    if (!account || isLoading || isRunning) return;

                    const reqId = ++selectReqIdRef.current;

                    setSelectedVersion(vc);
                    setIsDownloadedVersion(vc.version.downloadedVersion);
                    setIsOwnerVersion(ownerOk);

                    try {
                      const serverPath = await api.path.join(
                        vc.versionPath,
                        "server",
                      );
                      const serverConf = await api.path.join(
                        serverPath,
                        "conf.json",
                      );

                      const isExists = await api.fs.pathExists(serverPath);
                      if (reqId !== selectReqIdRef.current) return;

                      if (isExists) {
                        const conf: IServerConf =
                          await api.fs.readJSON<IServerConf>(
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
                      const isStatisticsExists =
                        await api.fs.pathExists(statisticsPath);
                      if (reqId !== selectReqIdRef.current) return;
                      setIsStatistics(isStatisticsExists);
                    } catch {
                      if (reqId !== selectReqIdRef.current) return;
                      setServer(undefined);
                      setIsStatistics(false);
                    }
                  }}
                >
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4 items-center min-w-0">
                        {ownerAvatar && (
                          <Avatar
                            src={ownerAvatar.image}
                            name={ownerAvatar.nickname}
                            size="sm"
                          />
                        )}
                        {vc.version.image && (
                          <Image
                            src={vc.version.image}
                            width={44}
                            height={44}
                            className="h-11 w-11"
                          />
                        )}
                        <p className="truncate flex-grow">{vc.version.name}</p>
                        <p className={loaderInfo?.style || ""}>
                          {loaderInfo?.name || vc.version.loader.name}
                        </p>
                        <p>{vc.version.version.id}</p>
                      </div>

                      {isSelected && (
                        <div className="flex gap-1 items-center">
                          {isStatistics && vc.versionPath && (
                            <Button
                              variant="flat"
                              isIconOnly
                              isLoading={
                                isLoading &&
                                loadingType == LoadingType.STATISTICS
                              }
                              isDisabled={!ownerOk}
                              onPress={async () => {
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
                                  addToast({
                                    title: t("versionStatistics.error"),
                                    color: "danger",
                                  });
                                } finally {
                                  setIsLoading(false);
                                  setLoadingType(null);
                                }
                              }}
                            >
                              <ChartArea size={22} />
                            </Button>
                          )}

                          <Button
                            variant="flat"
                            isIconOnly
                            onPress={async () => {
                              try {
                                await api.shell.openPath(vc.versionPath);
                              } catch {}
                            }}
                          >
                            <Folder size={22} />
                          </Button>

                          {server && (
                            <Button
                              variant="flat"
                              isIconOnly
                              isDisabled={!ownerOk}
                              onPress={() => setIsServerManager(true)}
                            >
                              <ServerCog size={22} />
                            </Button>
                          )}

                          <Button
                            variant="flat"
                            isIconOnly
                            isLoading={
                              isLoading && loadingType == LoadingType.LOAD
                            }
                            isDisabled={isRunning || isRunningInstance}
                            onPress={async () => {
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
                                                vc.version.quickServer || "",
                                            },
                                            account?.accessToken || "",
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
                            <Settings size={22} />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </ScrollShadow>
        )}
      </div>

      {editVersion && selectedVersion && (
        <EditVersion
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
        <ServerControl
          onClose={() => setIsServerManager(false)}
          onDelete={() => setServer(undefined)}
        />
      )}
    </>
  );
}
