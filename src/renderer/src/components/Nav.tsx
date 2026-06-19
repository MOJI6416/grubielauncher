import { Accounts } from "./Accounts";
import { FaDiscord } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  Bell,
  BookUser,
  Gamepad2,
  ListPlus,
  Loader2,
  ServerOff,
  SquareChevronRight,
  Settings as LSettings,
  Wifi,
  WifiOff,
} from "lucide-react";
import { ErrorLog } from "./ErrorLog";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Settings } from "./Settings";
import { useAtom } from "jotai";
import {
  accountAtom,
  addVersionModalAtom,
  consolesAtom,
  errorLogAtom,
  errorLogSeenAtom,
  isFriendsConnectedAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  isShareModalOpenAtom,
  internetAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  serverAtom,
} from "@renderer/stores/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RunGameParams } from "@renderer/App";
import { LazyDialogFallback } from "./LazyDialogFallback";
import { LazyAddVersion } from "./LazyAddVersion";
import {
  lazyWithPreload,
  preload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import {
  canUseBackendFeature,
  canUseInternetFeature,
  getConnectivityProblems,
} from "@renderer/utilities/connectivity";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";

const api = window.api;

let versionsPrefetched = false;
const prefetchVersionData = () => {
  if (versionsPrefetched) return;
  versionsPrefetched = true;
  void api.versions.getList("vanilla", false).catch(() => {
    versionsPrefetched = false;
  });
};

const loadConsole = () =>
  import("./Console").then((module) => ({ default: module.Console }));
const loadLanShareModal = () =>
  import("./Share/LanShareBar").then((module) => ({
    default: module.LanShareModal,
  }));

const LazyConsole = lazyWithPreload(loadConsole);
const LazyLanShareModal = lazyWithPreload(loadLanShareModal);

function ConnectivityBadge({
  label,
  Icon,
}: {
  label: string;
  Icon: React.ElementType;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="destructive"
          className="h-7 w-7 justify-center rounded-md p-0"
          aria-label={label}
        >
          <Icon className="size-3.5" />
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Nav({
  runGame,
  setIsFriends,
  onOpenWhatsNew,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  setIsFriends: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenWhatsNew: () => void;
}) {
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);
  const setServer = useAtom(serverAtom)[1];
  const setIsOwnerVersion = useAtom(isOwnerVersionAtom)[1];
  const [selectedAccount] = useAtom(accountAtom);
  const [isAddVersion, setVersionModal] = useAtom(addVersionModalAtom);
  const [isSettingsModal, setOpenSettingsModal] = useState(false);
  const [isInternetOnline] = useAtom(internetAtom);
  const [isBackendOnline] = useAtom(networkAtom);
  const { t } = useTranslation();
  const [isRunning] = useAtom(isRunningAtom);
  const [paths] = useAtom(pathsAtom);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [errorLog] = useAtom(errorLogAtom);
  const [errorLogSeen, setErrorLogSeen] = useAtom(errorLogSeenAtom);
  const [isErrorLogOpen, setIsErrorLogOpen] = useState(false);
  const unseenErrors = Math.max(0, errorLog.length - errorLogSeen);
  const [isShareOpen, setIsShareOpen] = useAtom(isShareModalOpenAtom);
  const [consoles] = useAtom(consolesAtom);
  const [isFriendsConnected] = useAtom(isFriendsConnectedAtom);
  const [shareState] = useAtom(shareStateAtom);
  const [shareOwnerAccountKey] = useAtom(shareOwnerAccountKeyAtom);
  const connectivity = useMemo(
    () => ({ isInternetOnline, isBackendOnline }),
    [isBackendOnline, isInternetOnline],
  );
  const connectivityProblems = useMemo(
    () => getConnectivityProblems(connectivity),
    [connectivity],
  );
  const canUseInternet = canUseInternetFeature(connectivity);
  const canUseBackend = canUseBackendFeature(connectivity);
  const isPlainShareBlocked =
    selectedAccount?.type === "plain" && !shareState.sessionId;

  const consoleBtnVariant = useMemo(() => {
    if (consoles.consoles.length > 0) {
      return consoles.consoles.some((c) => c.status === "error")
        ? "destructive"
        : consoles.consoles.some((c) => c.status === "stopped")
          ? "secondary"
          : "default";
    }

    return "default";
  }, [consoles.consoles]);

  const shouldShowShareButton = useMemo(() => {
    return (
      !["idle", "lan_not_found"].includes(shareState.phase) &&
      canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)
    );
  }, [selectedAccount, shareOwnerAccountKey, shareState.phase]);

  useEffect(() => {
    if (!shouldShowShareButton) {
      setIsShareOpen(false);
    }
  }, [shouldShowShareButton]);

  useEffect(() => {
    if (!selectedVersion) return;
    return schedulePreload([LazyConsole.preload], 500);
  }, [selectedVersion]);

  const shareBtnVariant = useMemo(() => {
    switch (shareState.phase) {
      case "online":
        return "default";
      case "reconnecting":
      case "pending":
      case "tunnel_connecting":
      case "share_starting":
        return "secondary";
      case "conflict":
      case "error":
        return "destructive";
      default:
        return "default";
    }
  }, [shareState.phase]);

  return (
    <>
      <div className="w-full px-4 pt-3">
        <TooltipProvider delayDuration={700}>
          <div className="flex min-h-16 w-full items-center gap-4 rounded-xl border border-border bg-card px-4 py-2.5 text-card-foreground shadow-sm">
            <div className="flex min-w-0 shrink items-center gap-3">
              <Accounts />
              {connectivityProblems.length > 0 && (
                <div className="flex items-center gap-1">
                  {connectivityProblems.includes("internet") && (
                    <ConnectivityBadge
                      label={t("app.internetUnavailable")}
                      Icon={WifiOff}
                    />
                  )}
                  {connectivityProblems.includes("backend") && (
                    <ConnectivityBadge
                      label={t("app.backendUnavailable")}
                      Icon={ServerOff}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3">
              <div className="flex items-center gap-2">
                {errorLog.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="relative size-9"
                        onClick={() => {
                          setErrorLogSeen(errorLog.length);
                          setIsErrorLogOpen(true);
                        }}
                        aria-label={t("errorLog.title")}
                      >
                        <Bell className="size-4" />
                        {unseenErrors > 0 && (
                          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] font-semibold text-white">
                            {unseenErrors > 9 ? "9+" : unseenErrors}
                          </span>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("errorLog.title")}</TooltipContent>
                  </Tooltip>
                )}

                {consoles.consoles.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant={consoleBtnVariant}
                        className="size-9"
                        onMouseEnter={() => preload(LazyConsole.preload)}
                        onFocus={() => preload(LazyConsole.preload)}
                        onClick={() => setIsConsoleOpen(true)}
                        aria-label={t("console.title")}
                      >
                        <SquareChevronRight className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("console.title")}</TooltipContent>
                  </Tooltip>
                )}

                {shouldShowShareButton && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant={shareBtnVariant}
                        aria-disabled={isPlainShareBlocked}
                        className="size-9 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        onMouseEnter={() => preload(LazyLanShareModal.preload)}
                        onFocus={() => preload(LazyLanShareModal.preload)}
                        onClick={() => {
                          if (isPlainShareBlocked) return;
                          setIsShareOpen(true);
                        }}
                        aria-label={t("share.title")}
                      >
                        <Wifi className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPlainShareBlocked
                        ? t("share.plainAccountDisabled")
                        : t("share.title")}
                    </TooltipContent>
                  </Tooltip>
                )}

                {selectedAccount && selectedVersion && (
                  <Button
                    size="lg"
                    disabled={isRunning}
                    className="h-10 bg-white px-5 text-sm text-black shadow-sm hover:bg-white/90 [&_svg]:size-4"
                    onClick={async () => {
                      await runGame({ version: selectedVersion });
                    }}
                  >
                    {isRunning ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Gamepad2 />
                    )}
                    {t("nav.play")}
                  </Button>
                )}

                {canUseInternet && (
                  <Button
                    variant="secondary"
                    disabled={isRunning || !selectedAccount}
                    size="lg"
                    className="h-10 px-4 text-sm [&_svg]:size-4"
                    onMouseEnter={() => {
                      preload(LazyAddVersion.preload);
                      prefetchVersionData();
                    }}
                    onFocus={() => {
                      preload(LazyAddVersion.preload);
                      prefetchVersionData();
                    }}
                    onClick={() => {
                      setSelectedVersion(undefined);
                      setServer(undefined);
                      setIsOwnerVersion(false);
                      setVersionModal(true);
                    }}
                  >
                    <ListPlus />
                    {t("nav.addVersion")}
                  </Button>
                )}
              </div>

              <div className="h-8 w-px bg-border" />

              <div className="flex items-center gap-2">
                {selectedAccount && (
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-10 px-4 text-sm [&_svg]:size-4"
                    disabled={
                      !canUseBackend ||
                      selectedAccount.type === "plain" ||
                      !isFriendsConnected
                    }
                    onClick={() => {
                      setIsFriends((prev) => !prev);
                    }}
                  >
                    <BookUser />
                    {t("friends.title")}
                  </Button>
                )}

                <Button
                  size="lg"
                  variant="secondary"
                  disabled={isRunning}
                  className="h-10 px-4 text-sm [&_svg]:size-4"
                  onClick={() => setOpenSettingsModal(true)}
                >
                  <LSettings />
                  {t("settings.title")}
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-9"
                      onClick={async () => {
                        try {
                          await api.shell.openExternal(
                            "https://discord.gg/URrKha9hk7",
                          );
                        } catch {}
                      }}
                      aria-label="Discord"
                    >
                      <FaDiscord className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Discord</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </div>
      {isSettingsModal && (
        <Settings
          onClose={() => setOpenSettingsModal(false)}
          onShowWhatsNew={onOpenWhatsNew}
        />
      )}
      {isAddVersion && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyAddVersion
            closeModal={async () => {
              setVersionModal(false);
              try {
                if (paths.launcher) {
                  await api.fs.rimraf(
                    await api.path.join(paths.launcher, "temp"),
                  );
                }
              } catch {}
            }}
          />
        </Suspense>
      )}
      {isConsoleOpen && (
        <Suspense fallback={<LazyDialogFallback variant="console" />}>
          <LazyConsole
            onClose={() => setIsConsoleOpen(false)}
            runGame={runGame}
          />
        </Suspense>
      )}
      {isShareOpen && (
        <Suspense fallback={<LazyDialogFallback variant="compact" />}>
          <LazyLanShareModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
          />
        </Suspense>
      )}
      {isErrorLogOpen && <ErrorLog onClose={() => setIsErrorLogOpen(false)} />}
    </>
  );
}
