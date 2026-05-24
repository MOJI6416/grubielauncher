import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Versions } from "./components/Versions";
import { Nav } from "./components/Nav";
import { useTranslation } from "react-i18next";
import { io, Socket } from "socket.io-client";
import { Loader2 } from "lucide-react";
import type { IFriendRequest } from "./components/Friends/Friends";
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
  isRunningAtom,
  isShareModalOpenAtom,
  internetAtom,
  localFriendsAtom,
  networkAtom,
  ownPresenceAtom,
  pendingFriendChatAtom,
  pathsAtom,
  sharePeersAtom,
  shareStateAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
} from "./stores/atoms";
import { Confirmation } from "./components/Modals/Confirmation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LANGUAGES, normalizeSettings, TSettings } from "@/types/Settings";
import { IAccountConf, IAuth } from "@/types/Account";
import { IUpdateStatus } from "@/types/IFriend";
import { IServer } from "@/types/ServersList";
import { IConsole } from "@/types/Console";
import {
  applyBlockedModFilePaths,
  BlockedMods,
  checkBlockedMods,
  IBlockedMod,
} from "./components/Modals/BlockedMods";
import { Version } from "./classes/Version";
import {
  checkDiffenceUpdateData,
  isOwner,
  readVerions,
  syncShare,
} from "./utilities/version";
import { Mods } from "./classes/Mods";
import { DownloaderFailuresInfo, DownloaderInfo } from "@/types/Downloader";
import { InstallationProgress } from "./components/InstallationProgress";
import { DownloadFailuresModal } from "./components/DownloadFailuresModal";
import { BACKEND_URL } from "@/shared/config";
import { getShareErrorText } from "./utilities/share";
import { ensureAccountSession } from "./utilities/accountSession";
import { jwtDecode } from "jwt-decode";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { GameInvite } from "@/types/GameInvite";
import { IModpack } from "@/types/Backend";
import { toast } from "sonner";
import { lazyWithPreload, schedulePreload } from "./utilities/lazyPreload";
import { LazyDialogFallback } from "./components/LazyDialogFallback";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import {
  getWhatsNewDecision,
  LauncherWhatsNewState,
  markWhatsNewSeen,
} from "./utilities/whatsNew";

const api = window.api;
const MAX_CONSOLE_MESSAGES = 1000;

const loadFriends = () =>
  import("./components/Friends/Friends").then((module) => ({
    default: module.Friends,
  }));
const loadAddVersion = () =>
  import("./components/Modals/Version/AddVersion").then((module) => ({
    default: module.AddVersion,
  }));
const loadNewsFeed = () =>
  import("./components/NewsFeed").then((module) => ({
    default: module.NewsFeed,
  }));

const LazyFriends = lazyWithPreload(loadFriends);
const LazyAddVersion = lazyWithPreload(loadAddVersion);
const LazyNewsFeed = lazyWithPreload(loadNewsFeed);

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

function applyPresenceUpdate(
  previous: Required<IUpdateStatus>,
  update: IUpdateStatus,
): Required<IUpdateStatus> {
  return {
    versionName: update.versionName ?? previous.versionName,
    versionCode: update.versionCode ?? previous.versionCode,
    serverAddress: update.serverAddress ?? previous.serverAddress,
  };
}

function App() {
  const [selectedAccount, setSelectedAccount] = useAtom(accountAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const setIsRunning = useAtom(isRunningAtom)[1];

  const [isFriends, setIsFriends] = useState(false);

  const [friendSocket, setFriendSocket] = useAtom(friendSocketAtom);
  const [_, setFriendRequests] = useAtom(friendRequestsAtom);
  const [selectedFriend, setSelectedFriend] = useAtom(selectedFriendAtom);
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom);
  const [, setIsFriendsConnected] = useAtom(isFriendsConnectedAtom);
  const [, setPendingFriendChat] = useAtom(pendingFriendChatAtom);
  const [ownPresence, setOwnPresence] = useAtom(ownPresenceAtom);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<"update" | undefined>(
    undefined,
  );

  const [paths, setPaths] = useAtom(pathsAtom);
  const [, setIsInternetOnline] = useAtom(internetAtom);
  const [, setIsBackendOnline] = useAtom(networkAtom);
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);
  const [accounts, setAccounts] = useAtom(accountsAtom);
  const [isUpdateModal, setIsUpdateModal] = useState(false);
  const [servers, setServers] = useState<IServer[]>([]);
  const [authData] = useAtom(authDataAtom);
  const [consoles, setConsoles] = useAtom(consolesAtom);
  const [versions, setVersions] = useAtom(versionsAtom);
  const [shareState, setShareState] = useAtom(shareStateAtom);
  const [, setSharePeers] = useAtom(sharePeersAtom);
  const [, setIsShareModalOpen] = useAtom(isShareModalOpenAtom);

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [downloder, setDownloader] = useState<DownloaderInfo | null>(null);
  const [downloadFailures, setDownloadFailures] =
    useState<DownloaderFailuresInfo | null>(null);
  const [installProgress, setInstallProgress] =
    useState<VersionInstallProgress | null>(null);
  const [isCancellingInstall, setIsCancellingInstall] = useState(false);
  const [incomingInvite, setIncomingInvite] = useState<GameInvite | null>(null);
  const [inviteModpack, setInviteModpack] = useState<IModpack | null>(null);
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [whatsNew, setWhatsNew] = useState<{
    version: string;
    release: ILauncherReleaseNote | null;
  } | null>(null);

  const onlineSocket = useRef<Socket | null>(null);
  const pendingLaunchRef = useRef<RunGameParams | null>(null);
  const previousShareLanDetectionRef = useRef<{
    phase: string;
    candidateKey: string | null;
  }>({
    phase: "idle",
    candidateKey: null,
  });
  const previousShareBroadcastRef = useRef("offline");

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
  const serversRef = useLatestRef(servers);

  useEffect(() => {
    return schedulePreload(
      [LazyNewsFeed.preload, LazyFriends.preload, LazyAddVersion.preload],
      900,
    );
  }, []);

  useEffect(() => {
    void api.rpc.syncContext({
      account: selectedAccount
        ? {
            nickname: selectedAccount.nickname,
            type: selectedAccount.type,
          }
        : null,
      lang: i18n.resolvedLanguage || i18n.language || "en",
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedAccount?.nickname,
    selectedAccount?.type,
  ]);

  useEffect(() => {
    const updateInternetStatus = () => {
      setIsInternetOnline(window.navigator.onLine);
    };

    updateInternetStatus();
    window.addEventListener("online", updateInternetStatus);
    window.addEventListener("offline", updateInternetStatus);

    return () => {
      window.removeEventListener("online", updateInternetStatus);
      window.removeEventListener("offline", updateInternetStatus);
    };
  }, [setIsInternetOnline]);

  useEffect(() => {
    onlineSocket.current?.disconnect();
    onlineSocket.current = null;

    const socket = io(`${BACKEND_URL}/online`, {
      transports: ["websocket"],
      reconnection: true,
    });

    onlineSocket.current = socket;

    const onConnect = () => setIsBackendOnline(true);
    const onDisconnect = () => setIsBackendOnline(false);
    const onConnectError = () => setIsBackendOnline(false);

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
  }, [setIsBackendOnline]);

  useEffect(() => {
    let cancelled = false;

    const initShare = async () => {
      try {
        const [state, peers] = await Promise.all([
          api.share.getShareState(),
          api.share.getSharePeers(),
        ]);

        if (!cancelled) {
          setShareState(state);
          setSharePeers(peers);
        }
      } catch {}
    };

    initShare();

    const unsubscribeState = api.share.onShareStateChanged((state) => {
      setShareState(state);
    });

    const unsubscribePeers = api.share.onSharePeersChanged((peers) => {
      setSharePeers(peers);
    });

    const unsubscribeError = api.share.onShareError((error) => {
      toast(getShareErrorText(tRef.current, error));
    });

    return () => {
      cancelled = true;
      unsubscribeState();
      unsubscribePeers();
      unsubscribeError();
    };
  }, [setSharePeers, setShareState, tRef]);

  useEffect(() => {
    const previous = previousShareLanDetectionRef.current;
    const candidateKey = shareState.candidate?.key ?? null;
    const isLanDetected =
      shareState.phase === "lan_ready" && candidateKey !== null;
    const justDetected =
      isLanDetected &&
      (previous.phase !== "lan_ready" ||
        previous.candidateKey !== candidateKey);

    previousShareLanDetectionRef.current = {
      phase: shareState.phase,
      candidateKey,
    };

    if (!justDetected) {
      return;
    }

    if (!selectedAccount || selectedAccount.type === "plain") {
      return;
    }

    setIsShareModalOpen(true);
    void api.other.restoreWindow();
  }, [
    selectedAccount,
    setIsShareModalOpen,
    shareState.candidate?.key,
    shareState.phase,
  ]);

  useEffect(() => {
    if (!ownPresence.versionName || !ownPresence.versionCode) {
      return;
    }

    const sharePresenceKey =
      shareState.phase === "online" &&
      shareState.slug &&
      shareState.publicAddress
        ? `online:${shareState.sessionId || ""}:${shareState.slug}:${
            shareState.visibility || ""
          }`
        : "offline";

    if (previousShareBroadcastRef.current === sharePresenceKey) {
      return;
    }

    previousShareBroadcastRef.current = sharePresenceKey;
    friendSocketRef.current?.emit("friendUpdate", { ...ownPresence });
  }, [
    ownPresence,
    shareState.phase,
    shareState.publicAddress,
    shareState.sessionId,
    shareState.slug,
    shareState.visibility,
  ]);

  useEffect(() => {
    return api.other.onNotificationClick((action) => {
      if (action.type === "game_invite") {
        void api.other.restoreWindow();
        return;
      }

      if (action.type !== "friend_message") return;

      setIsFriends(true);
      setSelectedFriend(action.friendId);
      setPendingFriendChat(action.friendId);
      void api.other.restoreWindow();
    });
  }, [setPendingFriendChat, setSelectedFriend]);

  useEffect(() => {
    return api.events.onDeepLink(async (payload) => {
      if (payload.type !== "pack") return;

      try {
        await LazyAddVersion.preload();

        const account = selectedAccountRef.current;
        const modpackData = await api.backend.getModpack(
          account?.accessToken || "",
          payload.shareCode,
        );

        if (!modpackData.data) {
          toast.error(tRef.current("addVersion.fromServer.notFound"));
          return;
        }

        setInviteModpack(modpackData.data);
        setIncomingInvite(null);
        void api.other.restoreWindow();
      } catch (error) {
        console.error(error);
        toast.error(tRef.current("addVersion.fromServer.notFound"));
      }
    });
  }, [selectedAccountRef, tRef]);

  const getLauncherStatePath = useEventCallback(async (launcherPath: string) => {
    return await api.path.join(launcherPath, "launcher-state.json");
  });

  const readLauncherState = useEventCallback(
    async (launcherPath: string): Promise<LauncherWhatsNewState | null> => {
      const statePath = await getLauncherStatePath(launcherPath);
      if (!(await api.fs.pathExists(statePath))) return null;

      try {
        return await api.fs.readJSON<LauncherWhatsNewState>(
          statePath,
          "utf-8",
        );
      } catch {
        return null;
      }
    },
  );

  const writeLauncherState = useEventCallback(
    async (launcherPath: string, state: LauncherWhatsNewState) => {
      const statePath = await getLauncherStatePath(launcherPath);
      await api.fs.writeJSON(statePath, state);
    },
  );

  const openWhatsNew = useEventCallback(
    async (options?: { launcherPath?: string; locale?: string }) => {
      const launcherPath = options?.launcherPath || pathsRef.current.launcher;
      if (!launcherPath) return;

      const currentVersion = await api.other.getVersion();
      if (!currentVersion) return;

      const locale =
        options?.locale || i18n.resolvedLanguage || i18n.language || "en";
      const release = await api.backend.getWhatsNew(currentVersion, locale);

      setWhatsNew({
        version: currentVersion,
        release,
      });
    },
  );

  const dismissWhatsNew = useEventCallback(async () => {
    const modal = whatsNew;
    setWhatsNew(null);

    const launcherPath = pathsRef.current.launcher;
    if (!launcherPath || !modal?.version) return;

    const state = await readLauncherState(launcherPath);
    await writeLauncherState(
      launcherPath,
      markWhatsNewSeen(modal.version, state),
    );
  });

  const checkWhatsNewAfterInit = useEventCallback(
    async (launcherPath: string, locale: string) => {
      const currentVersion = await api.other.getVersion();
      if (!currentVersion) return;

      const state = await readLauncherState(launcherPath);
      const decision = getWhatsNewDecision(currentVersion, state);

      if (decision.type === "firstLaunch") {
        await writeLauncherState(
          launcherPath,
          markWhatsNewSeen(currentVersion, state),
        );
        return;
      }

      if (decision.shouldShow) {
        await openWhatsNew({ launcherPath, locale });
      }
    },
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const p = await api.other.getPaths();
        if (cancelled) return;

        setPaths(p);

        const [settingsData] = await Promise.all([
          getSettings(p.launcher),
          getAccounts(),
        ]);
        if (cancelled) return;

        await checkWhatsNewAfterInit(p.launcher, settingsData.lang);
        if (cancelled) return;

        const versionsPath = await api.path.join(p.minecraft, "versions");

        if (await api.fs.pathExists(versionsPath)) {
          const acc = selectedAccountRef.current ?? null;
          const v = await readVerions(p.launcher, acc);
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
    const updatePlayingTime = async (time: number) => {
      try {
        let a = selectedAccountRef.current;
        const ad = authDataRef.current;
        if (!ad || !a || !a.accessToken) return;

        if (a.type !== "plain") {
          const refreshed = await ensureAccountSession({
            accounts: accountsRef.current,
            authData: ad,
            selectedAccount: a,
            setAccounts,
            setSelectedAccount,
          });

          a = refreshed.account;
        }

        const user = await api.backend.getUser(a.accessToken || "", ad.sub);
        if (!user) return;

        await api.backend.updateUser(a.accessToken || "", user._id, {
          playTime: user.playTime + time,
        });
      } catch (err) {
        console.error(err);
      }
    };

    const unsubscribeConsoleStatus = api.events.onConsoleChangeStatus(
      async (versionName, instance, status) => {
        const current = consolesRef.current.consoles.find(
          (c) => c.versionName === versionName && c.instance === instance,
        );
        const startTimeForCalc = current?.startTime ?? 0;
        const isTerminalStatus = status === "stopped" || status === "error";
        const shouldCountSession =
          isTerminalStatus &&
          current?.status === "running" &&
          !!startTimeForCalc;

        setConsoles((prev) => {
          const idx = prev.consoles.findIndex(
            (c) => c.versionName === versionName && c.instance === instance,
          );
          if (idx === -1) return prev;

          const next = [...prev.consoles];
          next[idx] = { ...next[idx], status };
          return { consoles: next };
        });

        if (!shouldCountSession) return;

        const time = Date.now() - startTimeForCalc;
        const playTime = Math.floor(time / 1000);

        await updatePlayingTime(playTime);

        if (current?.trackStatistics) {
          const v = versionsRef.current.find(
            (vv) => vv.version.name == versionName,
          );
          if (!v) return;

          const statPath = await api.path.join(
            v.versionPath,
            "statistics.json",
          );
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
      },
    );

    const unsubscribeConsoleMessage = api.events.onConsoleMessage(
      async (versionName, instance, message) => {
        setConsoles((prev) => {
          const idx = prev.consoles.findIndex(
            (c) => c.versionName === versionName && c.instance === instance,
          );
          if (idx === -1) return prev;

          const next = [...prev.consoles];
          next[idx] = {
            ...next[idx],
            messages: [...next[idx].messages, message].slice(
              -MAX_CONSOLE_MESSAGES,
            ),
          };
          return { consoles: next };
        });
      },
    );

    const unsubscribeConsoleClear = api.events.onConsoleClear(
      async (versionName, instance) => {
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
      },
    );

    const unsubscribeLaunch = api.events.onLaunch(() => {
      setSelectedVersion(undefined);
      setIsRunning(false);
    });

    const unsubscribeFriendUpdate = api.events.onFriendUpdate((data) => {
      setOwnPresence((prev) => applyPresenceUpdate(prev, data));
      friendSocketRef.current?.emit("friendUpdate", { ...data });
    });

    const unsubscribeDownloaderInfo = api.events.onDownloaderInfo((info) => {
      setDownloader(info);
    });

    const unsubscribeDownloaderFailures = api.events.onDownloaderFailures(
      (info) => {
        setDownloadFailures(info);
      },
    );

    const unsubscribeVersionInstallProgress =
      api.events.onVersionInstallProgress((info) => {
        if (info?.stage === "preparing") {
          setIsCancellingInstall(false);
        }
        if (!info) {
          setIsCancellingInstall(false);
        }
        setInstallProgress(info);
      });

    return () => {
      unsubscribeConsoleStatus();
      unsubscribeConsoleMessage();
      unsubscribeConsoleClear();
      unsubscribeLaunch();
      unsubscribeFriendUpdate();
      unsubscribeDownloaderInfo();
      unsubscribeDownloaderFailures();
      unsubscribeVersionInstallProgress();
    };
  }, [setConsoles, setSelectedVersion, setIsRunning, setOwnPresence]);

  useEffect(() => {
    if (
      installProgress?.operation !== "integrity" ||
      installProgress.stage !== "done"
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setInstallProgress((current) =>
        current === installProgress ? null : current,
      );
      setDownloader(null);
      setIsCancellingInstall(false);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [installProgress]);

  useEffect(() => {
    setIsFriends(false);

    const ad = authData;
    const acc = selectedAccount;

    if (!ad || !acc?.accessToken) {
      friendSocketRef.current?.disconnect();
      setFriendSocket(undefined);
      setIsFriendsConnected(false);
      setOwnPresence({
        versionName: "",
        versionCode: "",
        serverAddress: "",
      });
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
    setOwnPresence,
  ]);

  useEffect(() => {
    if (!friendSocket) return;

    const onFriendRequest = async (data: IFriendRequest) => {
      setFriendRequests((prev) =>
        prev.some((request) => request.requestId === data.requestId)
          ? prev
          : [...prev, data],
      );

      if (data.type == "recipient") {
        const options: Electron.NotificationConstructorOptions = {
          title: tRef.current("friends.newRequest"),
          body: `${data.user.nickname} ${tRef.current("friends.sentRequest")}`,
          icon: data.user.image || "",
        };
        await api.other.notify(options);
      }

      if (data.type == "requester") {
        toast.success(tRef.current("friends.requestSent"));
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
          toast.success(tRef.current("friends.requestAccepted"));
        else toast.success(tRef.current("friends.requestDeclined"));
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

      await api.other.notify(options, {
        type: "friend_message",
        friendId: user._id,
      });
      toast(tRef.current("friends.newMessage"), {
        description: `${user.nickname} ${tRef.current("friends.sentMessage")}`,
      });
    };

    const onGameInvite = async (invite: GameInvite) => {
      setIncomingInvite(invite);

      const lf = localFriendsRef.current.find((x) => x.id == invite.sender._id);
      if (lf?.isMuted) return;

      const notificationBody =
        invite.target.type === "server"
          ? tRef.current("friends.gameInviteNotificationServer", {
              nickname: invite.sender.nickname,
              version: invite.versionName,
              address: invite.target.address,
            })
          : tRef.current("friends.gameInviteNotificationWorld", {
              nickname: invite.sender.nickname,
              version: invite.versionName,
            });
      const options: Electron.NotificationConstructorOptions = {
        title: tRef.current("friends.gameInviteNotificationTitle"),
        body: notificationBody,
        icon: invite.sender.image || "",
      };

      await api.other.notify(options, {
        type: "game_invite",
        inviteId: invite.inviteId,
      });
    };

    const onConnect = () => {
      setIsFriendsConnected(true);
    };

    const onDisconnect = () => {
      setIsFriends(false);
      setIsFriendsConnected(false);
    };

    const onConnectError = () => {
      setIsFriendsConnected(false);
    };

    friendSocket.on("friendRequest", onFriendRequest);
    friendSocket.on("friendRequestRemove", onFriendRequestRemove);
    friendSocket.on("messageNotification", onMessageNotification);
    friendSocket.on("gameInvite", onGameInvite);
    friendSocket.on("connect", onConnect);
    friendSocket.on("disconnect", onDisconnect);
    friendSocket.on("connect_error", onConnectError);

    return () => {
      friendSocket.off("friendRequest", onFriendRequest);
      friendSocket.off("friendRequestRemove", onFriendRequestRemove);
      friendSocket.off("messageNotification", onMessageNotification);
      friendSocket.off("gameInvite", onGameInvite);
      friendSocket.off("connect", onConnect);
      friendSocket.off("disconnect", onDisconnect);
      friendSocket.off("connect_error", onConnectError);
    };
  }, [friendSocket, setFriendRequests, setIsFriendsConnected]);

  async function getSettings(launcherPath: string) {
    const systemLocate: string = await api.other.getLocale();
    const l = LANGUAGES.find((l) => systemLocate.includes(l.code));

    const settingsConfPath = await api.path.join(launcherPath, "settings.json");

    let rawData: Partial<TSettings> | null = null;
    if (await api.fs.pathExists(settingsConfPath)) {
      try {
        rawData = await api.fs.readJSON(settingsConfPath, "utf-8");
      } catch {
        rawData = null;
      }
    }

    const data = normalizeSettings(rawData, l?.code || i18n.language);
    if (JSON.stringify(rawData) !== JSON.stringify(data)) {
      await api.fs.writeJSON(settingsConfPath, data);
    }

    setSettings(data);
    i18n.changeLanguage(data.lang);
    return data;
  }

  async function getAccounts() {
    const data: IAccountConf = await api.accounts.load();

    setAccounts(data.accounts);

    const fallback = data.accounts[0] ?? null;

    if (data.lastPlayed) {
      const lastPlayed = data.accounts.find(
        (a) => `${a.type}_${a.nickname}` == data.lastPlayed,
      );

      if (lastPlayed) {
        setSelectedAccount(lastPlayed);
        return lastPlayed;
      }

      if (fallback) {
        setSelectedAccount(fallback);
        await api.accounts.save(
          data.accounts,
          `${fallback.type}_${fallback.nickname}`,
        );
      }
      return fallback;
    }

    if (fallback) {
      setSelectedAccount(fallback);
      await api.accounts.save(
        data.accounts,
        `${fallback.type}_${fallback.nickname}`,
      );
    }
    return fallback;
  }

  const runGame = useEventCallback(async (params: RunGameParams) => {
    const { skipUpdate, version, instance, quick } = params;

    const launchVersion = version || selectedVersionRef.current;
    if (!launchVersion) {
      toast.error(tRef.current("app.startupError"));
      return;
    }

    const a0 = selectedAccountRef.current;
    const s0 = settingsRef.current;
    const p0 = pathsRef.current;

    if (!a0 || !s0 || !p0?.launcher || !p0?.minecraft) {
      toast.error(tRef.current("app.startupError"));
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
    let currentAccounts = accountsRef.current;
    const ad = authDataRef.current;
    let runtimeAuthData = ad;

    try {
      if (ad && account.type !== "plain") {
        const refreshed = await ensureAccountSession({
          accounts: currentAccounts,
          authData: ad,
          selectedAccount: account,
          setAccounts,
          setSelectedAccount,
        });

        account = refreshed.account;
        currentAccounts = refreshed.accounts;

        if (refreshed.refreshed && account.accessToken) {
          runtimeAuthData = jwtDecode<IAuth>(account.accessToken);
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
            pendingLaunchRef.current = {
              version: launchVersion,
              instance: _instance,
              quick,
            };
            setSelectedVersion(launchVersion);
            setIsUpdateModal(true);
            setIsRunning(false);
            return;
          }
        }
      }

      setIsRunning(true);

      launchVersion.version.lastLaunch = new Date();
      const trackStatistics = isOwner(launchVersion.version.owner, account);

      toast(tRef.current("app.starting"));

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
            trackStatistics,
            messages: [],
          };
          return { consoles: next };
        }

        const newConsole: IConsole = {
          versionName: launchVersion.version.name || "",
          status: "running",
          instance: _instance,
          startTime: Date.now(),
          trackStatistics,
          messages: [],
        };

        return { consoles: [...prev.consoles, newConsole] };
      });

      const started = await launchVersion.run(
        account,
        settings,
        runtimeAuthData,
        _instance,
        quick,
      );
      if (!started) throw new Error("Game process did not start");

      const nextPresence = {
        versionName: launchVersion.version.name,
        versionCode: launchVersion.version.shareCode || "",
        serverAddress: "",
      };

      setOwnPresence(nextPresence);
      friendSocketRef.current?.emit("friendUpdate", nextPresence);

      await launchVersion.save();
      await api.accounts.save(
        currentAccounts,
        `${account.type}_${account.nickname}`,
      );
    } catch (err) {
      console.error(err);
      toast.error(tRef.current("app.startupError"));
      setConsoles((prev) => {
        const idx = prev.consoles.findIndex(
          (c) =>
            c.versionName === launchVersion.version.name &&
            c.instance === _instance &&
            c.status === "running",
        );
        if (idx === -1) return prev;

        const next = [...prev.consoles];
        next[idx] = { ...next[idx], status: "error" };
        return { consoles: next };
      });
      setSelectedVersion(undefined);
      setIsRunning(false);
    }
  });

  const joinInvite = useEventCallback(async (invite: GameInvite) => {
    if (isJoiningInvite) return;

    setIsJoiningInvite(true);
    try {
      let address =
        invite.target.type === "server" ? invite.target.address : undefined;

      if (invite.target.type === "world") {
        const result = await api.share.connectToFriendShare(invite.target.slug);
        if (!result.ok || !result.data) {
          toast(getShareErrorText(tRef.current, result.error));
          return;
        }

        address = result.data.connectHost;
      }

      const version = versionsRef.current.find(
        (v) => v.version.shareCode === invite.versionCode,
      );

      if (!version) {
        const account = selectedAccountRef.current;
        const modpackData = await api.backend.getModpack(
          account?.accessToken || "",
          invite.versionCode,
        );

        if (modpackData.data) {
          setInviteModpack(modpackData.data);
          setIncomingInvite(null);
          toast.warning(tRef.current("friends.gameInviteInstall"));
        } else {
          toast.error(tRef.current("share.errors.joinShareNotFound"));
        }
        return;
      }

      setIncomingInvite(null);
      setSelectedVersion(version);
      await runGame({
        version,
        quick: address
          ? {
              multiplayer: address,
            }
          : undefined,
      });
    } finally {
      setIsJoiningInvite(false);
    }
  });

  const incomingInviteText = incomingInvite
    ? incomingInvite.target.type === "server"
      ? t("friends.gameInviteServerBody", {
          nickname: incomingInvite.sender.nickname,
          version: incomingInvite.versionName,
          address: incomingInvite.target.address,
        })
      : t("friends.gameInviteWorldBody", {
          nickname: incomingInvite.sender.nickname,
          version: incomingInvite.versionName,
        })
    : "";

  const cancelVersionInstall = useEventCallback(async () => {
    setIsCancellingInstall(true);
    try {
      await Promise.all([
        api.version.cancelInstall(),
        api.mods.cancelInstall(),
      ]);
    } catch (error) {
      console.error(error);
      setIsCancellingInstall(false);
    }
  });

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <>
        <Nav
          runGame={runGame}
          setIsFriends={setIsFriends}
          onOpenWhatsNew={() => openWhatsNew()}
        />

        <main className="min-h-0 flex-1 px-4 py-3">
          <div className="flex h-full min-h-0 gap-4">
            <Versions runGame={runGame} />
            {isFriends && (
              <Suspense
                fallback={
                  <div className="flex h-full w-[320px] shrink-0 items-center justify-center rounded-xl border bg-card">
                    <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <LazyFriends runGame={runGame} />
              </Suspense>
            )}
          </div>
        </main>

        <Suspense
          fallback={
            <div className="mx-4 mb-3 h-[8.25rem] rounded-xl border bg-card" />
          }
        >
          <LazyNewsFeed />
        </Suspense>

        {isUpdateModal && (
          <Confirmation
            onClose={() => {
              if (isLoading) return;
              pendingLaunchRef.current = null;
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
                      updated.versionPath,
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

                    const pendingLaunch = pendingLaunchRef.current;
                    pendingLaunchRef.current = null;

                    await runGame({
                      ...pendingLaunch,
                      skipUpdate: true,
                      version: updated,
                    });
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
                  const pendingLaunch = pendingLaunchRef.current;
                  pendingLaunchRef.current = null;

                  await runGame({
                    ...pendingLaunch,
                    skipUpdate: true,
                    version:
                      pendingLaunch?.version || selectedVersionRef.current,
                  });
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

              const hasBlockedPaths = applyBlockedModFilePaths(
                sv.version.loader.mods,
                bMods,
              );
              if (hasBlockedPaths) await sv.save();

              const versionMods = new Mods(s0, sv.version);
              await versionMods.check();

              setIsUpdateModal(false);
              setIsLoading(false);
              setLoadingType(undefined);

              const pendingLaunch = pendingLaunchRef.current;
              pendingLaunchRef.current = null;

              await runGame({
                ...pendingLaunch,
                skipUpdate: true,
                version: sv,
              });
            }}
          />
        )}

        {installProgress ? (
          <InstallationProgress
            info={installProgress}
            downloadInfo={downloder}
            onCancel={cancelVersionInstall}
            isCancelling={isCancellingInstall}
          />
        ) : null}

        {downloadFailures && (
          <DownloadFailuresModal
            info={downloadFailures}
            onClose={() => setDownloadFailures(null)}
          />
        )}

        {incomingInvite && (
          <Dialog
            open={true}
            onOpenChange={(open) => {
              if (!open && !isJoiningInvite) setIncomingInvite(null);
            }}
          >
            <DialogContent
              className="sm:max-w-md"
              onPointerDownOutside={(event) => {
                if (isJoiningInvite) event.preventDefault();
              }}
              onEscapeKeyDown={(event) => {
                if (isJoiningInvite) event.preventDefault();
              }}
            >
              <DialogHeader>
                <DialogTitle>{t("friends.gameInviteTitle")}</DialogTitle>
                <DialogDescription className="rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-foreground">
                  {incomingInviteText}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setIncomingInvite(null)}
                  disabled={isJoiningInvite}
                >
                  {t("common.close")}
                </Button>
                <Button
                  disabled={isJoiningInvite}
                  onClick={() => joinInvite(incomingInvite)}
                >
                  {isJoiningInvite && <Loader2 className="animate-spin" />}
                  {t("friends.gameInviteJoin")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {inviteModpack && (
          <Suspense fallback={<LazyDialogFallback variant="wide" />}>
            <LazyAddVersion
              closeModal={() => setInviteModpack(null)}
              modpack={inviteModpack}
            />
          </Suspense>
        )}

        {whatsNew && (
          <WhatsNewModal
            release={whatsNew.release}
            version={whatsNew.version}
            onClose={dismissWhatsNew}
          />
        )}
      </>
    </div>
  );
}

export default App;
