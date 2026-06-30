import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Versions } from "./components/Versions";
import { Nav } from "./components/Nav";
import { Titlebar } from "./components/Titlebar";
import { useTranslation } from "react-i18next";
import { changeAppLanguage } from "./i18n";
import { io, Socket } from "socket.io-client";
import { Loader2, Trophy } from "lucide-react";
import type { IFriendRequest } from "./components/Friends/Friends";
import { IUser } from "../../types/IUser";
import { useAtom, useSetAtom } from "jotai";
import {
  accountAtom,
  accountsAtom,
  addVersionImportPathAtom,
  addVersionModalAtom,
  authDataAtom,
  consolesAtom,
  fileDragOverAtom,
  friendRequestsAtom,
  friendSocketAtom,
  friendsAtom,
  isFriendsConnectedAtom,
  isRunningAtom,
  isShareModalOpenAtom,
  installActiveAtom,
  internetAtom,
  localFriendsAtom,
  networkAtom,
  ownPresenceAtom,
  pendingFriendChatAtom,
  pathsAtom,
  shareOwnerAccountKeyAtom,
  sharePeersAtom,
  shareStateAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
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
import { IFriend, IUpdateStatus } from "@/types/IFriend";
import { evaluateAchievements } from "@renderer/utilities/achievements";
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
import { supportsQuickPlayMultiplayer } from "./utilities/versionPure";
import { Mods } from "./classes/Mods";
import { DownloaderFailuresInfo, DownloaderInfo } from "@/types/Downloader";
import { InstallationProgress } from "./components/InstallationProgress";
import { InstallationMiniBar } from "./components/InstallationMiniBar";
import { DownloadFailuresModal } from "./components/DownloadFailuresModal";
import { BACKEND_URL } from "@/shared/config";
import { getShareErrorText } from "./utilities/share";
import { recordError, showErrorToast } from "./utilities/errorToast";
import { playSound, playAchievementSound } from "./utilities/sounds";
import {
  ensureAccountSession,
  isAccountSessionRefreshError,
} from "./utilities/accountSession";
import { jwtDecode } from "jwt-decode";
import { VersionInstallProgress } from "@/types/InstallationProgress";
import { GameInvite } from "@/types/GameInvite";
import { IModpack } from "@/types/Backend";
import { toast } from "sonner";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "./utilities/lazyPreload";
import { LazyDialogFallback } from "./components/LazyDialogFallback";
import { LazyAddVersion } from "./components/LazyAddVersion";
import { WhatsNewModal } from "./components/WhatsNewModal";
import { Onboarding } from "./components/Onboarding";
import { ILauncherReleaseNote } from "@/types/LauncherRelease";
import { getWhatsNewDecision, markWhatsNewSeen } from "./utilities/whatsNew";
import {
  readLauncherState,
  writeLauncherState,
} from "./utilities/launcherState";
import {
  canCurrentAccountManageShare,
  getShareAccountKey,
  isShareStateActiveForAccountBinding,
} from "./utilities/shareAccount";

const api = window.api;
const MAX_CONSOLE_MESSAGES = 1000;

const loadFriends = () =>
  import("./components/Friends/Friends").then((module) => ({
    default: module.Friends,
  }));
const loadNewsFeed = () =>
  import("./components/NewsFeed").then((module) => ({
    default: module.NewsFeed,
  }));

const LazyFriends = lazyWithPreload(loadFriends);
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

export interface JoinFriendWorldParams {
  versionCode: string;
  hostNickname: string;
  slug?: string;
  address?: string;
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
  const setFriends = useSetAtom(friendsAtom);
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
  const [versionsLoaded, setVersionsLoaded] = useAtom(versionsLoadedAtom);
  const [shareState, setShareState] = useAtom(shareStateAtom);
  const [, setSharePeers] = useAtom(sharePeersAtom);
  const [, setIsShareModalOpen] = useAtom(isShareModalOpenAtom);
  const [shareOwnerAccountKey, setShareOwnerAccountKey] = useAtom(
    shareOwnerAccountKeyAtom,
  );

  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [downloder, setDownloader] = useState<DownloaderInfo | null>(null);
  const [downloadFailures, setDownloadFailures] =
    useState<DownloaderFailuresInfo | null>(null);
  const [installProgress, setInstallProgress] =
    useState<VersionInstallProgress | null>(null);
  const [isCancellingInstall, setIsCancellingInstall] = useState(false);
  const isCancellingInstallRef = useLatestRef(isCancellingInstall);
  const [isInstallMinimized, setIsInstallMinimized] = useState(false);
  const [installActive, setInstallActive] = useAtom(installActiveAtom);
  const [isInstallPaused, setIsInstallPaused] = useState(false);
  const isInstallPausedRef = useLatestRef(isInstallPaused);
  const installTrackRef = useRef<{
    startedAt: number;
    doneSeen: boolean;
    percent: number;
  } | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<GameInvite | null>(null);
  const [inviteModpack, setInviteModpack] = useState<IModpack | null>(null);
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [whatsNew, setWhatsNew] = useState<{
    version: string;
    release: ILauncherReleaseNote | null;
  } | null>(null);

  const onlineSocket = useRef<Socket | null>(null);
  const pendingLaunchRef = useRef<RunGameParams | null>(null);
  const pendingDeepLaunchRef = useRef<{
    versionName: string;
    instance: number;
  } | null>(null);
  const pendingJoinRef = useRef<JoinFriendWorldParams | null>(null);
  const [dropImportPath, setDropImportPath] = useState<string | null>(null);
  const [isFileDragOver, setIsFileDragOver] = useAtom(fileDragOverAtom);
  const setAddVersionImportPath = useAtom(addVersionImportPathAtom)[1];
  const isAddVersionOpen = useAtom(addVersionModalAtom)[0];
  const dragContextRef = useRef<"main" | "addVersion" | "blocked" | null>(null);
  const isJoiningWorldRef = useRef(false);
  const knownShareSessionsRef = useRef<Set<string> | null>(null);
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
  const isAddVersionOpenRef = useLatestRef(isAddVersionOpen);
  const installActiveRef = useLatestRef(installActive);
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
    const addVersionPreload = window.setTimeout(() => {
      preload(LazyAddVersion.preload);
    }, 0);

    const cancelScheduledPreload = schedulePreload(
      [
        LazyNewsFeed.preload,
        LazyFriends.preload,
        () => api.versions.getList("vanilla", false),
      ],
      900,
    );

    return () => {
      window.clearTimeout(addVersionPreload);
      cancelScheduledPreload();
    };
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
      hideServer: settings.hideServerInRpc,
    });
  }, [
    i18n.language,
    i18n.resolvedLanguage,
    selectedAccount?.nickname,
    selectedAccount?.type,
    settings.hideServerInRpc,
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
    const isActive = isShareStateActiveForAccountBinding(shareState);
    if (!isActive) {
      if (shareOwnerAccountKey) setShareOwnerAccountKey(null);
      return;
    }

    if (
      !shareOwnerAccountKey &&
      selectedAccount &&
      selectedAccount.type !== "plain"
    ) {
      setShareOwnerAccountKey(getShareAccountKey(selectedAccount));
    }
  }, [
    selectedAccount,
    setShareOwnerAccountKey,
    shareOwnerAccountKey,
    shareState,
  ]);

  useEffect(() => {
    if (canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)) {
      return;
    }

    setIsShareModalOpen(false);
  }, [selectedAccount, setIsShareModalOpen, shareOwnerAccountKey]);

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

    setShareOwnerAccountKey(getShareAccountKey(selectedAccount));
    setIsShareModalOpen(true);
    void api.other.restoreWindow();
  }, [
    selectedAccount,
    setIsShareModalOpen,
    setShareOwnerAccountKey,
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
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types || []).includes("Files");

    const resolveDragContext = (): "main" | "addVersion" | "blocked" => {
      if (installActiveRef.current) return "blocked";
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const addVersionDialogs = document.querySelectorAll(
        "[data-add-version-dialog]",
      );
      if (dialogs.length > addVersionDialogs.length) return "blocked";
      if (addVersionDialogs.length > 0 || isAddVersionOpenRef.current)
        return "addVersion";
      return "main";
    };

    const endDrag = () => {
      dragContextRef.current = null;
      setIsFileDragOver(false);
    };

    const ensureContext = () => {
      if (dragContextRef.current === null) {
        dragContextRef.current = resolveDragContext();
      }
      return dragContextRef.current;
    };

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (ensureContext() === "blocked") return;
      event.preventDefault();
      setIsFileDragOver(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (ensureContext() === "blocked") return;
      setIsFileDragOver(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      if (
        event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= window.innerWidth ||
        event.clientY >= window.innerHeight
      ) {
        endDrag();
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const context = dragContextRef.current;
      endDrag();

      if (context === "blocked" || context === null) return;

      const file = event.dataTransfer?.files?.[0];
      if (!file) return;

      const name = file.name.toLowerCase();
      if (!name.endsWith(".zip") && !name.endsWith(".mrpack")) {
        toast.warning(tRef.current("addVersion.dropUnsupported"));
        return;
      }

      if (!selectedAccountRef.current) {
        toast.warning(tRef.current("addVersion.dropNoAccount"));
        return;
      }

      const filePath = api.other.getPathForFile(file);
      if (!filePath) return;

      if (context === "addVersion" && isAddVersionOpenRef.current) {
        setAddVersionImportPath(filePath);
      } else {
        setDropImportPath(filePath);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (payload.type === "launch") {
        void api.other.restoreWindow();
        pendingDeepLaunchRef.current = {
          versionName: payload.versionName,
          instance: payload.instance,
        };
        tryDeepLaunch();
        return;
      }

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

  const tryDeepLaunch = useEventCallback(() => {
    const pending = pendingDeepLaunchRef.current;
    if (!pending) return;

    const version = versionsRef.current.find(
      (v) => v.version.name === pending.versionName,
    );

    if (version) {
      pendingDeepLaunchRef.current = null;
      void runGame({ version, instance: pending.instance });
      return;
    }

    if (versionsLoaded) {
      pendingDeepLaunchRef.current = null;
      toast.error(tRef.current("versions.launchNotFound"));
    }
  });

  useEffect(() => {
    tryDeepLaunch();
  }, [versions, versionsLoaded, tryDeepLaunch]);

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

        const versionsPath = await api.path.join(p.minecraft, "versions");

        if (await api.fs.pathExists(versionsPath)) {
          const acc = selectedAccountRef.current ?? null;
          const v = await readVerions(p.launcher, acc);
          if (!cancelled) {
            setVersions(v);

            const lastPlayed = [...v].sort(
              (a, b) =>
                new Date(b.version.lastLaunch || 0).getTime() -
                new Date(a.version.lastLaunch || 0).getTime(),
            )[0];
            if (lastPlayed && !selectedVersionRef.current) {
              setSelectedVersion(lastPlayed);
            }
          }
        } else {
          await api.fs.ensure(versionsPath);
        }

        if (!cancelled) setVersionsLoaded(true);

        if (cancelled) return;

        await checkWhatsNewAfterInit(p.launcher, settingsData.lang);
      } catch (err) {
        console.error("Init error:", err);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [setPaths, setVersions]);

  const playtimeSyncInFlightRef = useRef(false);

  const flushPlaytimeSyncQueue = useCallback(async () => {
    if (playtimeSyncInFlightRef.current) return;
    playtimeSyncInFlightRef.current = true;
    try {
      const ad = authDataRef.current;
      let a = selectedAccountRef.current;
      if (!ad?.sub || !a || !a.accessToken) return;

      const queue = await api.statistics.getSyncQueue();
      const mine = queue.filter((e) => e.sub === ad.sub && e.seconds > 0);
      if (mine.length === 0) return;

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

      const totalSeconds = mine.reduce((sum, e) => sum + e.seconds, 0);
      const newPlayTime = user.playTime + totalSeconds;

      let earnedAchievements: string[] | undefined;
      try {
        const stats = await api.worlds.loadAchievementStats(a);
        const unlocked = evaluateAchievements(
          stats,
          newPlayTime,
          user.achievements,
        )
          .filter((p) => p.unlocked)
          .map((p) => p.def.id);
        const newlyEarned = unlocked.filter(
          (id) => !user.achievements.includes(id),
        );
        if (newlyEarned.length > 0) {
          earnedAchievements = unlocked;
          for (const id of newlyEarned) {
            toast.success(
              t("achievements.unlockedToast", {
                name: t(`achievements.items.${id}.name`),
              }),
              { icon: <Trophy className="size-4 text-primary" /> },
            );
          }
          playAchievementSound();
        }
      } catch {}

      await api.backend.updateUser(a.accessToken || "", user._id, {
        playTime: newPlayTime,
        ...(earnedAchievements ? { achievements: earnedAchievements } : {}),
      });
      await api.statistics.resolveSyncEntries(mine.map((e) => e.id));
    } catch (err) {
      if (!isAccountSessionRefreshError(err)) {
        console.error(err);
      }
    } finally {
      playtimeSyncInFlightRef.current = false;
    }
  }, [
    accountsRef,
    authDataRef,
    selectedAccountRef,
    setAccounts,
    setSelectedAccount,
  ]);

  useEffect(() => {
    void flushPlaytimeSyncQueue();
  }, [authData, selectedAccount, flushPlaytimeSyncQueue]);

  useEffect(() => {
    const unsubscribePlaytimeRecorded = api.events.onPlaytimeRecorded(() => {
      void flushPlaytimeSyncQueue();
    });

    const unsubscribeConsoleStatus = api.events.onConsoleChangeStatus(
      async (versionName, instance, status) => {
        setConsoles((prev) => {
          const idx = prev.consoles.findIndex(
            (c) => c.versionName === versionName && c.instance === instance,
          );
          if (idx === -1) return prev;

          const next = [...prev.consoles];
          next[idx] = { ...next[idx], status };
          return { consoles: next };
        });
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

    const unsubscribeUpdateFailed = api.events.onUpdateFailed((payload) => {
      playSound("error");
      toast.error(tRef.current("app.updateFailed"), {
        description: payload?.message || "",
        duration: 12000,
      });
    });

    const unsubscribeCrashAnalysis = api.events.onCrashAnalysis(
      (versionName, _instance, analysis) => {
        const lang = (i18n.resolvedLanguage ||
          i18n.language ||
          "en") as keyof typeof analysis.messages;
        const message = analysis.messages[lang] || analysis.messages.en;
        const details = [
          message,
          analysis.culprits.length > 0
            ? `${tRef.current("crash.culprits")}: ${analysis.culprits.join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n");

        const title = tRef.current("crash.title", { version: versionName });
        recordError(title, details);

        playSound("error");
        toast.error(title, {
          description: details,
          duration: 15000,
          ...(analysis.reportPath
            ? {
                action: {
                  label: tRef.current("crash.openReport"),
                  onClick: () => {
                    void api.shell.openPath(analysis.reportPath!);
                  },
                },
              }
            : {}),
        });
      },
    );

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
          installTrackRef.current = {
            startedAt: Date.now(),
            doneSeen: false,
            percent: 0,
          };
        }
        if (info && installTrackRef.current) {
          installTrackRef.current.percent = info.progressPercent;
          if (info.stage === "done") installTrackRef.current.doneSeen = true;
        }
        if (!info) {
          setIsCancellingInstall(false);
          const track = installTrackRef.current;
          installTrackRef.current = null;
          if (
            track &&
            track.doneSeen &&
            track.percent >= 90 &&
            !isCancellingInstallRef.current &&
            Date.now() - track.startedAt > 15000
          ) {
            playSound("success");
          }
        }
        setInstallProgress(info);
      });

    return () => {
      unsubscribePlaytimeRecorded();
      unsubscribeConsoleStatus();
      unsubscribeConsoleMessage();
      unsubscribeConsoleClear();
      unsubscribeLaunch();
      unsubscribeUpdateFailed();
      unsubscribeCrashAnalysis();
      unsubscribeFriendUpdate();
      unsubscribeDownloaderInfo();
      unsubscribeDownloaderFailures();
      unsubscribeVersionInstallProgress();
    };
  }, [
    setConsoles,
    setSelectedVersion,
    setIsRunning,
    setOwnPresence,
    flushPlaytimeSyncQueue,
  ]);

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
    setInstallActive(Boolean(installProgress));
    if (!installProgress) {
      setIsInstallMinimized(false);
      setIsInstallPaused(false);
    }
  }, [installProgress, setInstallActive]);

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

    knownShareSessionsRef.current = null;
    const handleSharePresence = () => void checkFriendShares();
    const requestFriends = () => socketIo.emit("getFriends");
    const handleFriendsList = (data: { friends: IFriend[] }) =>
      setFriends(Array.isArray(data?.friends) ? data.friends : []);
    socketIo.on("connect", handleSharePresence);
    socketIo.on("connect", requestFriends);
    socketIo.on("friends", handleFriendsList);
    socketIo.on("friendUpdate", handleSharePresence);
    const shareWatchInterval = setInterval(() => {
      void checkFriendShares();
    }, 90_000);

    return () => {
      clearInterval(shareWatchInterval);
      socketIo.off("connect", handleSharePresence);
      socketIo.off("connect", requestFriends);
      socketIo.off("friends", handleFriendsList);
      socketIo.off("friendUpdate", handleSharePresence);
      socketIo.disconnect();
      setIsFriendsConnected(false);
      setFriendSocket(undefined);
    };
  }, [
    authData?.sub,
    selectedAccount?.accessToken,
    setFriendSocket,
    setFriends,
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
    if (rawData === null) {
      await api.fs.writeJSON(settingsConfPath, data);
    }

    setSettings(data);
    await changeAppLanguage(data.lang);
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
            modpackData.data,
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

      const authlibResult = await launchVersion.ensureAuthlib(account);
      if (!authlibResult.ok) {
        toast.error(
          tRef.current(
            authlibResult.reason === "download_failed"
              ? "app.authlibDownloadFailed"
              : "app.authlibUnavailable",
          ),
        );
        setIsRunning(false);
        return;
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
      if (isAccountSessionRefreshError(err)) {
        toast.error(tRef.current("accounts.sessionExpired"));
      } else {
        showErrorToast(
          tRef.current("app.startupError"),
          err instanceof Error ? err.message : String(err),
          tRef.current("common.copy"),
        );
      }
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

  const joinFriendWorld = useEventCallback(
    async (params: JoinFriendWorldParams) => {
      if (isJoiningWorldRef.current) return;

      const account = selectedAccountRef.current;
      const s0 = settingsRef.current;
      const t0 = tRef.current;

      if (!params.versionCode) {
        toast.warning(t0("friends.friendBuildNotPublished"));
        return;
      }

      isJoiningWorldRef.current = true;
      const toastId = toast.loading(
        t0("friends.joinFlow.connecting", { nickname: params.hostNickname }),
      );

      try {
        let version = versionsRef.current.find(
          (v) => v.version.shareCode === params.versionCode,
        );

        const modpackData = await api.backend.getModpack(
          account?.accessToken || "",
          params.versionCode,
        );

        if (!version) {
          if (!modpackData.data) {
            toast.error(t0("share.errors.joinShareNotFound"), { id: toastId });
            return;
          }

          pendingJoinRef.current = params;
          setInviteModpack(modpackData.data);
          toast.info(t0("friends.joinFlow.installFirst"), { id: toastId });
          return;
        }

        if (
          version.version.downloadedVersion &&
          modpackData.data &&
          (modpackData.data.build ?? 0) > (version.version.build ?? 0)
        ) {
          toast.loading(t0("friends.joinFlow.syncing"), { id: toastId });

          let serversLocal: IServer[] = [];
          try {
            serversLocal = await api.servers.read(
              await api.path.join(version.versionPath, "servers.dat"),
            );
          } catch {
            serversLocal = [];
          }

          version = await syncShare(
            version,
            serversLocal,
            s0,
            account?.accessToken || "",
            modpackData.data,
          );

          const bMods = await checkBlockedMods(
            version.version.loader.mods,
            version.versionPath,
          );
          if (bMods.length > 0) {
            setBlockedMods(bMods);
            setIsBlockedMods(true);
            toast.warning(t0("friends.joinFlow.blockedMods"), { id: toastId });
            return;
          }
        }

        let address = params.address;
        if (params.slug) {
          const result = await api.share.connectToFriendShare(params.slug);
          if (!result.ok || !result.data) {
            toast.error(getShareErrorText(t0, result.error), { id: toastId });
            return;
          }

          address = result.data.connectHost;
        }

        if (!address) {
          toast.error(t0("friends.friendNoJoinTarget"), { id: toastId });
          return;
        }

        setSelectedVersion(version);

        const quickPlaySupported =
          version.isQuickPlayMultiplayer ||
          supportsQuickPlayMultiplayer(version.version.version.id);
        const isInstanceRunning = consolesRef.current.consoles.some(
          (gameConsole) =>
            gameConsole.versionName === version.version.name &&
            gameConsole.status === "running",
        );

        const writeServerEntry = async () => {
          const serversPath = await api.path.join(
            version!.versionPath,
            "servers.dat",
          );
          let serversLocal: IServer[] = [];
          try {
            serversLocal = await api.servers.read(serversPath);
          } catch {
            serversLocal = [];
          }

          const entryName = t0("friends.joinFlow.serverEntryName", {
            nickname: params.hostNickname,
          });
          const nextServers: IServer[] = [
            { name: entryName, ip: address!, acceptTextures: null },
            ...serversLocal.filter(
              (server) =>
                server.ip !== address &&
                server.name !== entryName &&
                !(params.slug && server.ip.includes(params.slug)),
            ),
          ];
          await api.servers.write(nextServers, serversPath);
        };

        if (isInstanceRunning) {
          await writeServerEntry();
          toast.success(t0("friends.joinFlow.alreadyRunning"), {
            id: toastId,
            duration: 10000,
          });
          return;
        }

        if (quickPlaySupported) {
          toast.success(
            t0("friends.joinFlow.launching", {
              nickname: params.hostNickname,
            }),
            { id: toastId },
          );
          await runGame({
            version,
            skipUpdate: true,
            quick: { multiplayer: address },
          });
          return;
        }

        await writeServerEntry();

        toast.success(t0("friends.joinFlow.addedToServers"), {
          id: toastId,
          duration: 10000,
        });
        await runGame({ version, skipUpdate: true });
      } catch (error) {
        console.error("[joinFriendWorld] failed:", error);
        showErrorToast(
          tRef.current("app.startupError"),
          error instanceof Error ? error.message : String(error),
          tRef.current("common.copy"),
          toastId,
        );
      } finally {
        isJoiningWorldRef.current = false;
      }
    },
  );

  const checkFriendShares = useEventCallback(async () => {
    const account = selectedAccountRef.current;
    if (!account?.accessToken) return;

    const result = await api.share.fetchActiveFriendShares();
    if (!result.ok || !result.data) return;

    const previous = knownShareSessionsRef.current;
    knownShareSessionsRef.current = new Set(
      result.data.map((share) => share.sessionId),
    );

    if (!previous) return;

    for (const share of result.data) {
      if (previous.has(share.sessionId)) continue;

      const versionCode = share.versionShareCode;
      const message = tRef.current("friends.worldOpened", {
        nickname: share.hostNickname,
      });

      if (document.hasFocus()) playSound("notify");
      toast(message, {
        duration: 15000,
        action: versionCode
          ? {
              label: tRef.current("friends.joinFlow.playAction"),
              onClick: () => {
                void joinFriendWorld({
                  versionCode,
                  hostNickname: share.hostNickname,
                  slug: share.slug,
                });
              },
            }
          : {
              label: tRef.current("friends.joinFlow.openFriends"),
              onClick: () => setIsFriends(true),
            },
      });

      if (!document.hasFocus()) {
        void api.other
          .notify({ title: "Grubie Launcher", body: message })
          .catch(() => {});
      }
    }
  });

  const joinInvite = useEventCallback(async (invite: GameInvite) => {
    if (isJoiningInvite) return;

    setIsJoiningInvite(true);
    try {
      setIncomingInvite(null);
      await joinFriendWorld({
        versionCode: invite.versionCode,
        hostNickname: invite.sender.nickname,
        slug: invite.target.type === "world" ? invite.target.slug : undefined,
        address:
          invite.target.type === "server" ? invite.target.address : undefined,
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

  const toggleInstallPause = useEventCallback(async () => {
    const next = !isInstallPausedRef.current;
    setIsInstallPaused(next);
    try {
      if (next) await api.version.pauseInstall();
      else await api.version.resumeInstall();
    } catch (error) {
      console.error(error);
      setIsInstallPaused(!next);
    }
  });

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden">
      <>
        <Titlebar />
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
                <LazyFriends
                  runGame={runGame}
                  joinFriendWorld={joinFriendWorld}
                />
              </Suspense>
            )}
          </div>
        </main>

        <Suspense
          fallback={
            <div className="mx-4 mb-3 h-[6.75rem] rounded-xl border bg-card" />
          }
        >
          <LazyNewsFeed />
        </Suspense>

        <Onboarding />

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
          isInstallMinimized ? (
            <InstallationMiniBar
              info={installProgress}
              downloadInfo={downloder}
              isPaused={isInstallPaused}
              isCancelling={isCancellingInstall}
              onExpand={() => setIsInstallMinimized(false)}
              onTogglePause={toggleInstallPause}
              onCancel={cancelVersionInstall}
            />
          ) : (
            <InstallationProgress
              info={installProgress}
              downloadInfo={downloder}
              onCancel={cancelVersionInstall}
              isCancelling={isCancellingInstall}
              onMinimize={() => setIsInstallMinimized(true)}
              isPaused={isInstallPaused}
              onTogglePause={toggleInstallPause}
            />
          )
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
              dragHidden={isFileDragOver}
              closeModal={() => {
                setInviteModpack(null);
                pendingJoinRef.current = null;
              }}
              modpack={inviteModpack}
              successCallback={() => {
                const pendingJoin = pendingJoinRef.current;
                pendingJoinRef.current = null;
                if (!pendingJoin) return;

                setTimeout(() => {
                  void joinFriendWorld(pendingJoin);
                }, 400);
              }}
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

        {isFileDragOver && (
          <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="rounded-xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-lg">
              <p className="text-lg font-semibold">
                {t("addVersion.dropTitle")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("addVersion.dropDescription")}
              </p>
            </div>
          </div>
        )}

        {dropImportPath && (
          <Suspense fallback={<LazyDialogFallback variant="wide" />}>
            <LazyAddVersion
              dragHidden={isFileDragOver}
              closeModal={() => setDropImportPath(null)}
              importFilePath={dropImportPath}
            />
          </Suspense>
        )}
      </>
    </div>
  );
}

export default App;
