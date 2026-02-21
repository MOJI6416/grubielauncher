import { Presence } from "discord-rpc";
import { useCallback, useEffect, useRef, useState } from "react";
import { Versions } from "./components/Versions";
import { Nav } from "./components/Nav";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { Friends, IFriendRequest } from "./components/Friends/Friends";
import { IUser } from "../../types/IUser";
import { IVersionStatistics } from "../../types/VersionStatistics";
import { useAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  consolesAtom,
  friendRequestsAtom,
  friendSocketAtom,
  isFriendsConnectedAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  localFriendsAtom,
  networkAtom,
  pathsAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "./stores/atoms";
import { Confirmation } from "./components/Modals/Confirmation";
import { addToast } from "@heroui/toast";
import { LANGUAGES, TSettings } from "@/types/Settings";
import { IAccountConf } from "@/types/Account";
import { IServer } from "@/types/ServersList";
import { NewsFeed } from "./components/NewsFeed";
import { IConsole } from "@/types/Console";
import {
  BlockedMods,
  checkBlockedMods,
  IBlockedMod,
} from "./components/Modals/BlockedMods";
import { Version } from "./classes/Version";
import {
  checkDiffenceUpdateData,
  readVerions,
  syncShare,
} from "./utilities/version";
import { Mods } from "./classes/Mods";
import { DownloaderInfo } from "@/types/Downloader";
import { DownloadProgress } from "./components/DownloadProgress";
import { BACKEND_URL } from "@/shared/config";
import { IRefreshTokenResponse } from "@/types/Auth";

const api = window.api;

export interface RunGameParams {
  skipUpdate?: boolean;
  version?: Version;
  instance?: number;
  quick?: {
    single?: string;
    multiplayer?: string;
  };
}

function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(((...args: any[]) => fnRef.current(...args)) as T, []);
}

function App() {
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const setIsRunning = useAtom(isRunningAtom)[1];

  const [isFriends, setIsFriends] = useState(false);

  const [friendSocket, setFriendSocket] = useAtom(friendSocketAtom);
  const [_, setFriendRequests] = useAtom(friendRequestsAtom);
  const [selectedFriend] = useAtom(selectedFriendAtom);
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom);
  const [, setIsFriendsConnected] = useAtom(isFriendsConnectedAtom);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"update" | undefined>(
    undefined,
  );

  const [paths, setPaths] = useAtom(pathsAtom);
  const [, setIsNetwork] = useAtom(networkAtom);
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [isUpdateModal, setIsUpdateModal] = useState(false);
  const [servers, setServers] = useState<IServer[]>([]);
  const [authData] = useAtom(authDataAtom);
  const [consoles, setConsoles] = useAtom(consolesAtom);
  const [versions, setVersions] = useAtom(versionsAtom);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [downloder, setDownloader] = useState<DownloaderInfo | null>(null);

  const onlineSocket = useRef<Socket | null>(null);

  const { t, i18n } = useTranslation();

  const tRef = useLatestRef(t);
  const selectedAccountRef = useLatestRef(selectedAccount);
  const settingsRef = useLatestRef(settings);
  const pathsRef = useLatestRef(paths);
  const selectedVersionRef = useLatestRef(selectedVersion);
  const accountsRef = useLatestRef(accounts);
  const authDataRef = useLatestRef(authData);
  const consolesRef = useLatestRef(consoles);
  const versionsRef = useLatestRef(versions);
  const friendSocketRef = useLatestRef(friendSocket);
  const selectedFriendRef = useLatestRef(selectedFriend);
  const localFriendsRef = useLatestRef(localFriends);
  const isOwnerVersionRef = useLatestRef(isOwnerVersion);
  const serversRef = useLatestRef(servers);

  useEffect(() => {
    onlineSocket.current?.disconnect();
    onlineSocket.current = null;

    const socket = io(`${BACKEND_URL}/online`, {
      transports: ["websocket"],
      reconnection: true,
    });

    onlineSocket.current = socket;

    const onConnect = () => setIsNetwork(true);
    const onDisconnect = () => setIsNetwork(false);
    const onConnectError = () => setIsNetwork(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.disconnect();
      onlineSocket.current = null;
    };
  }, [setIsNetwork]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const p = await api.other.getPaths();
        if (cancelled) return;

        setPaths(p);

        const [s] = await Promise.all([
          getSettings(p.launcher),
          getAccounts(p.launcher),
        ]);
        if (cancelled) return;

        const versionsPath = await api.path.join(p.minecraft, "versions");

        if (await api.fs.pathExists(versionsPath)) {
          const acc = selectedAccountRef.current ?? null;
          const v = await readVerions(p.launcher, s, acc);
          if (!cancelled) setVersions(v);
        } else {
          await api.fs.ensure(versionsPath);
        }
      } catch (err) {
        console.error("Init error:", err);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [setPaths, setVersions]);

  useEffect(() => {
    let cancelled = false;

    const refreshVersionsBySettings = async () => {
      try {
        const p = pathsRef.current;
        const s = settingsRef.current;

        if (!p?.launcher || !p?.minecraft) return;

        const versionsPath = await api.path.join(p.minecraft, "versions");
        if (!(await api.fs.pathExists(versionsPath))) return;

        const acc = selectedAccountRef.current ?? null;

        const v = await readVerions(p.launcher, s, acc);
        if (!cancelled) setVersions(v);
      } catch (err) {
        console.error("Refresh versions by settings error:", err);
      }
    };

    refreshVersionsBySettings();

    return () => {
      cancelled = true;
    };
  }, [settings, setVersions]);

  useEffect(() => {
    const updatePlayingTime = async (time: number) => {
      try {
        const a = selectedAccountRef.current;
        const ad = authDataRef.current;
        if (!ad || !a || !a.accessToken) return;

        const user = await api.backend.getUser(a.accessToken || "", ad.sub);
        if (!user) return;

        await api.backend.updateUser(a.accessToken || "", user._id, {
          playTime: user.playTime + time,
        });
      } catch (err) {
        console.log(err);
      }
    };

    api.events.onConsoleChangeStatus(async (versionName, instance, status) => {
      const current = consolesRef.current.consoles.find(
        (c) => c.versionName === versionName && c.instance === instance,
      );
      const startTimeForCalc = current?.startTime ?? 0;

      setConsoles((prev) => {
        const idx = prev.consoles.findIndex(
          (c) => c.versionName === versionName && c.instance === instance,
        );
        if (idx === -1) return prev;

        const next = [...prev.consoles];
        next[idx] = { ...next[idx], status };
        return { consoles: next };
      });

      if (status !== "stopped" || !startTimeForCalc) return;

      const time = Date.now() - startTimeForCalc;
      const playTime = Math.floor(time / 1000);

      await updatePlayingTime(playTime);

      if (isOwnerVersionRef.current) {
        const v = versionsRef.current.find(
          (vv) => vv.version.name == versionName,
        );
        if (!v) return;

        const statPath = await api.path.join(v.versionPath, "statistics.json");
        const statIsExists = await api.fs.pathExists(statPath);

        let statData: IVersionStatistics = {
          lastLaunched: new Date(),
          launches: 1,
          playTime,
        };

        if (statIsExists) {
          const existed: IVersionStatistics = await api.fs.readJSON(
            statPath,
            "utf-8",
          );
          statData = {
            lastLaunched: new Date(),
            launches: (existed.launches || 0) + 1,
            playTime: (existed.playTime || 0) + playTime,
          };
        }

        await api.fs.writeJSON(statPath, statData);
      }
    });

    api.events.onConsoleMessage(async (versionName, instance, message) => {
      setConsoles((prev) => {
        const idx = prev.consoles.findIndex(
          (c) => c.versionName === versionName && c.instance === instance,
        );
        if (idx === -1) return prev;

        const next = [...prev.consoles];
        next[idx] = {
          ...next[idx],
          messages: [...next[idx].messages, message],
        };
        return { consoles: next };
      });
    });

    api.events.onConsoleClear(async (versionName, instance) => {
      setConsoles((prev) => {
        const idx = prev.consoles.findIndex(
          (c) => c.versionName === versionName && c.instance === instance,
        );
        if (idx === -1) return prev;

        const next = [...prev.consoles];
        next[idx] = {
          ...next[idx],
          messages: [],
          startTime: Date.now(),
        };
        return { consoles: next };
      });
    });

    api.events.onLaunch(() => {
      setSelectedVersion(undefined);
      setIsRunning(false);
    });

    api.events.onFriendUpdate((data) => {
      friendSocketRef.current?.emit("friendUpdate", { ...data });
    });

    api.events.onDownloaderInfo((info) => {
      setDownloader(info);
    });

    return () => {
      api.events.removeAllListeners("consoleMessage");
      api.events.removeAllListeners("consoleClear");
      api.events.removeAllListeners("launch");
      api.events.removeAllListeners("friendUpdate");
      api.events.removeAllListeners("consoleChangeStatus");
      api.events.removeAllListeners("downloaderInfo");
    };
  }, [setConsoles, setSelectedVersion, setIsRunning]);

  useEffect(() => {
    setIsFriends(false);

    const ad = authData;
    const acc = selectedAccount;

    if (!ad || !acc?.accessToken) {
      friendSocketRef.current?.disconnect();
      setFriendSocket(undefined);
      setIsFriendsConnected(false);
      return;
    }

    friendSocketRef.current?.disconnect();

    const socketIo = io(`${BACKEND_URL}/friends`, {
      auth: {
        token: acc.accessToken,
      },
    });

    setFriendSocket(socketIo);
    setLocalFriends(acc.friends || []);

    return () => {
      socketIo.disconnect();
      setIsFriendsConnected(false);
      setFriendSocket(undefined);
    };
  }, [
    authData?.sub,
    selectedAccount?.accessToken,
    setFriendSocket,
    setLocalFriends,
    setIsFriendsConnected,
  ]);

  useEffect(() => {
    if (!friendSocket) return;

    const onFriendRequest = async (data: IFriendRequest) => {
      setFriendRequests((prev) => [...prev, data]);

      if (data.type == "recipient") {
        const options: Electron.NotificationConstructorOptions = {
          title: tRef.current("friends.newRequest"),
          body: `${data.user.nickname} ${tRef.current("friends.sentRequest")}`,
          icon: data.user.image || "",
        };
        await api.other.notify(options);
      }

      if (data.type == "requester") {
        addToast({
          title: tRef.current("friends.requestSent"),
          color: "success",
        });
      }
    };

    const onFriendRequestRemove = async (data: {
      requestId: string;
      type: "accept" | "reject";
      user: IUser;
    }) => {
      const { requestId, type, user } = data;

      setFriendRequests((prev) => prev.filter((r) => r.requestId != requestId));

      const ad = authDataRef.current;

      if (user._id != ad?.sub) {
        if (type == "accept") {
          const options: Electron.NotificationConstructorOptions = {
            title: tRef.current("friends.requestAccepted"),
            body: `${user.nickname} ${tRef.current("friends.acceptedRequest")}`,
            icon: user.image || "",
          };
          await api.other.notify(options);
        } else {
          const options: Electron.NotificationConstructorOptions = {
            title: tRef.current("friends.requestDeclined"),
            body: `${user.nickname} ${tRef.current("friends.declidedRequest")}`,
            icon: user.image || "",
          };
          await api.other.notify(options);
        }
      } else {
        if (type == "accept")
          addToast({
            color: "success",
            title: tRef.current("friends.requestAccepted"),
          });
        else
          addToast({
            color: "success",
            title: tRef.current("friends.requestDeclined"),
          });
      }
    };

    const onMessageNotification = async (user: IUser) => {
      const lf = localFriendsRef.current.find((x) => x.id == user._id);
      if (lf?.isMuted) return;

      if (user._id == selectedFriendRef.current) return;

      const options: Electron.NotificationConstructorOptions = {
        title: tRef.current("friends.newMessage"),
        body: `${user.nickname} ${tRef.current("friends.sentMessage")}`,
        icon: user.image || "",
      };

      await api.other.notify(options);
      addToast({
        title: tRef.current("friends.newMessage"),
        description: `${user.nickname} ${tRef.current("friends.sentMessage")}`,
      });
    };

    const onConnect = () => {
      setIsFriendsConnected(true);
    };

    const onDisconnect = () => {
      setIsFriends(false);
      setIsFriendsConnected(false);
    };

    friendSocket.on("friendRequest", onFriendRequest);
    friendSocket.on("friendRequestRemove", onFriendRequestRemove);
    friendSocket.on("messageNotification", onMessageNotification);
    friendSocket.on("connect", onConnect);
    friendSocket.on("disconnect", onDisconnect);

    return () => {
      friendSocket.off("friendRequest", onFriendRequest);
      friendSocket.off("friendRequestRemove", onFriendRequestRemove);
      friendSocket.off("messageNotification", onMessageNotification);
      friendSocket.off("connect", onConnect);
      friendSocket.off("disconnect", onDisconnect);
    };
  }, [friendSocket, setFriendRequests, setIsFriendsConnected]);

  async function getSettings(launcherPath: string) {
    const systemLocate: string = await api.other.getLocale();
    const l = LANGUAGES.find((l) => systemLocate.includes(l.code));

    const settingsConfPath = await api.path.join(launcherPath, "settings.json");

    let data: TSettings;
    if (await api.fs.pathExists(settingsConfPath)) {
      data = await api.fs.readJSON(settingsConfPath, "utf-8");
    } else {
      data = {
        xmx: 2048,
        lang: l?.code || i18n.language,
        devMode: false,
        downloadLimit: 6,
      };

      await api.fs.writeJSON(settingsConfPath, data);
    }

    setSettings(data);
    i18n.changeLanguage(data.lang || l?.code || i18n.language);
    return data;
  }

  async function getAccounts(launcherPath: string) {
    const accountsConfPath = await api.path.join(launcherPath, "accounts.json");

    if (!(await api.fs.pathExists(accountsConfPath))) {
      const data: IAccountConf = {
        accounts: [],
        lastPlayed: null,
      };

      setAccounts(data.accounts);
      await api.fs.writeFile(accountsConfPath, JSON.stringify(data), "utf-8");
      return null;
    }

    const data: IAccountConf = await api.fs.readJSON(accountsConfPath, "utf-8");

    setAccounts(data.accounts);

    const fallback = data.accounts[0] ?? null;

    if (data.lastPlayed) {
      const lastPlayed = data.accounts.find(
        (a) => `${a.type}_${a.nickname}` == data.lastPlayed,
      );

      if (lastPlayed) {
        setSelectedAccount(lastPlayed);

        const activity: Presence = {
          smallImageKey: "steve",
          smallImageText: lastPlayed.nickname,
        };

        api.rpc.updateActivity(activity);

        return lastPlayed;
      }

      if (fallback) setSelectedAccount(fallback);
      return fallback;
    }

    if (fallback) setSelectedAccount(fallback);
    return fallback;
  }

  const runGame = useEventCallback(async (params: RunGameParams) => {
    const { skipUpdate, version, instance, quick } = params;

    const launchVersion = version || selectedVersionRef.current;
    if (!launchVersion) {
      addToast({ title: tRef.current("app.startupError"), color: "danger" });
      return;
    }

    const a0 = selectedAccountRef.current;
    const s0 = settingsRef.current;
    const p0 = pathsRef.current;

    if (!a0 || !s0 || !p0?.launcher || !p0?.minecraft) {
      addToast({ title: tRef.current("app.startupError"), color: "danger" });
      return;
    }

    let _instance = instance ?? 0;
    if (instance === undefined) {
      const maxInst = consolesRef.current.consoles
        .filter(
          (c) =>
            c.versionName == launchVersion.version.name &&
            c.status == "running",
        )
        .reduce((m, c) => Math.max(m, c.instance), -1);
      _instance = maxInst >= 0 ? maxInst + 1 : 0;
    }

    let account = a0;
    const ad = authDataRef.current;

    try {
      if (ad) {
        const { expiresAt } = ad.auth;

        if (
          (account.type != "discord" && Date.now() > expiresAt) ||
          (account.type == "discord" && Date.now() / 1000 > ad.exp)
        ) {
          let authUser: IRefreshTokenResponse | null = null;

          if (account.type == "microsoft")
            authUser = await api.auth.microsoftRefresh(
              ad.auth.refreshToken,
              ad.sub,
            );
          else if (account.type == "elyby")
            authUser = await api.auth.elybyRefresh(
              ad.auth.refreshToken,
              ad.sub,
            );
          else if (account.type == "discord") {
            await api.backend.getUser(account.accessToken || "", ad.sub);
          }

          if (authUser && account.type !== "discord") {
            const accs = accountsRef.current;
            const idx = accs.findIndex(
              (x) => x.type === account.type && x.nickname === account.nickname,
            );

            if (idx !== -1) {
              account = { ...account, ...authUser };
              const newAccounts = [...accs];
              newAccounts[idx] = account;

              setAccounts(newAccounts);
              setSelectedAccount(account);

              await api.fs.writeJSON(
                await api.path.join(p0.launcher, "accounts.json"),
                {
                  accounts: newAccounts,
                  lastPlayed: `${account.type}_${account.nickname}`,
                },
              );
            }
          }
        }
      }

      if (
        !skipUpdate &&
        launchVersion.version.shareCode &&
        launchVersion.version.downloadedVersion &&
        !!onlineSocket.current?.connected
      ) {
        const serversPath = await api.path.join(
          p0.minecraft,
          "versions",
          launchVersion.version.name,
          "servers.dat",
        );

        let serversLocal: IServer[] = [];
        if (await api.fs.pathExists(serversPath)) {
          serversLocal = await api.servers.read(serversPath);
          setServers(serversLocal);
        }

        const modpackData = await api.backend.getModpack(
          account.accessToken || "",
          launchVersion.version.shareCode,
        );

        if (modpackData.status == "not_found") {
          launchVersion.version.shareCode = undefined;
          launchVersion.version.downloadedVersion = false;
          await launchVersion.save();
        } else if (modpackData.data) {
          const diff = await checkDiffenceUpdateData(
            {
              mods: launchVersion.version.loader.mods,
              servers: serversLocal,
              version: launchVersion.version,
              runArguments: launchVersion.version.runArguments || {
                jvm: "",
                game: "",
              },
              versionPath: launchVersion.versionPath,
              logo: launchVersion.version.image || "",
              quickServer: launchVersion.version.quickServer || "",
            },
            account.accessToken || "",
          );

          if (diff) {
            setSelectedVersion(launchVersion);
            setIsUpdateModal(true);
            setIsRunning(false);
            return;
          }
        }
      }

      setIsRunning(true);

      launchVersion.version.lastLaunch = new Date();

      addToast({ title: tRef.current("app.starting") });

      setConsoles((prev) => {
        const idx = prev.consoles.findIndex(
          (c) =>
            c.versionName == launchVersion.version.name &&
            c.instance == _instance,
        );

        if (idx !== -1) {
          const next = [...prev.consoles];
          next[idx] = {
            ...next[idx],
            status: "running",
            startTime: Date.now(),
            messages: [],
          };
          return { consoles: next };
        }

        const newConsole: IConsole = {
          versionName: launchVersion.version.name || "",
          status: "running",
          instance: _instance,
          startTime: Date.now(),
          messages: [],
        };

        return { consoles: [...prev.consoles, newConsole] };
      });

      await launchVersion.run(account, ad, _instance, quick);

      const activity: Presence = {
        state: `${tRef.current("rpc.playing")} ${launchVersion.version.name}`,
      };
      await api.rpc.updateActivity(activity);

      friendSocketRef.current?.emit("friendUpdate", {
        versionName: launchVersion.version.name,
        versionCode: launchVersion.version.shareCode,
        serverAddress: "",
      });

      await launchVersion.save();

      const accountsPath = await api.path.join(p0.launcher, "accounts.json");
      const accountsData: IAccountConf = await api.fs.readJSON(
        accountsPath,
        "utf-8",
      );

      const [lastType, lastNickname] = accountsData.lastPlayed
        ? accountsData.lastPlayed.split("_")
        : ["plain", ""];

      if (lastType != account.type || lastNickname != account.nickname) {
        await api.fs.writeJSON(accountsPath, {
          ...accountsData,
          lastPlayed: `${account.type}_${account.nickname}`,
        });
      }
    } catch (err) {
      console.log(err);
      addToast({ title: tRef.current("app.startupError"), color: "danger" });
      setSelectedVersion(undefined);
      setIsRunning(false);
    }
  });

  return (
    <div className="h-screen w-full flex flex-col">
      <>
        <Nav runGame={runGame} setIsFriends={setIsFriends} />

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
          <div className="flex space-x-4 h-full">
            <Versions runGame={runGame} />
            {isFriends && <Friends runGame={runGame} />}
          </div>
        </div>

        <NewsFeed />

        {isUpdateModal && (
          <Confirmation
            onClose={() => {
              if (isLoading) return;
              setIsUpdateModal(false);
              setIsRunning(false);
            }}
            title={t("versions.updateAvailable")}
            content={[
              {
                color: "warning",
                text: t("versions.hostChanged"),
              },
            ]}
            buttons={[
              {
                text: t("common.update"),
                color: "success",
                loading: isLoading && loadingType == "update",
                onClick: async () => {
                  const sv = selectedVersionRef.current;
                  const s0 = settingsRef.current;
                  const acc = selectedAccountRef.current;
                  if (!sv || !s0) return;

                  setLoadingType("update");
                  setIsLoading(true);

                  try {
                    const updated = await syncShare(
                      sv,
                      serversRef.current,
                      s0,
                      acc?.accessToken || "",
                    );

                    setSelectedVersion(updated);

                    const bMods: IBlockedMod[] = await checkBlockedMods(
                      updated.version.loader.mods,
                    );
                    if (bMods.length > 0) {
                      setBlockedMods(bMods);
                      setIsBlockedMods(true);

                      setIsLoading(false);
                      setLoadingType(undefined);
                      return;
                    }

                    setIsUpdateModal(false);
                    setIsLoading(false);
                    setLoadingType(undefined);

                    await runGame({ skipUpdate: true, version: updated });
                  } catch {
                    setIsLoading(false);
                    setLoadingType(undefined);
                  }
                },
              },
              {
                text: t("versions.runWithoutUpdating"),
                onClick: async () => {
                  setIsUpdateModal(false);
                  await runGame({ skipUpdate: true });
                },
              },
            ]}
          />
        )}

        {isBlockedMods && blockedMods.length > 0 && (
          <BlockedMods
            mods={blockedMods}
            onClose={async (bMods) => {
              setIsBlockedMods(false);

              const sv = selectedVersionRef.current;
              const s0 = settingsRef.current;
              if (!sv || !s0) return;

              for (const bMod of bMods) {
                if (!bMod.filePath) continue;

                const mod = sv.version.loader.mods.find(
                  (m) => m.id == bMod.projectId,
                );
                if (!mod || !mod.version) continue;

                mod.version.files[0].localPath = bMod.filePath;
              }

              const versionMods = new Mods(s0, sv.version);
              await versionMods.check();

              setIsUpdateModal(false);
              setIsLoading(false);
              setLoadingType(undefined);

              await runGame({ skipUpdate: true });
            }}
          />
        )}

        {downloder && <DownloadProgress info={downloder} />}
      </>
    </div>
  );
}

export default App;
