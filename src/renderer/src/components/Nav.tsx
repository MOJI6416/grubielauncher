import { Accounts } from "./Accounts";
import { Settings } from "./Settings";
import { FaDiscord } from "react-icons/fa";
import { useTranslation } from "react-i18next";
import {
  BookUser,
  Gamepad2,
  ListPlus,
  SquareChevronRight,
  Settings as LSettings,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import {
  accountAtom,
  consolesAtom,
  isFriendsConnectedAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  isShareModalOpenAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  shareStateAtom,
  serverAtom,
} from "@renderer/stores/atoms";
import { AddVersion } from "./Modals/Version/AddVersion";
import { Button, Chip, Tooltip } from "@heroui/react";
import { Console } from "./Console";
import { RunGameParams } from "@renderer/App";
import { LanShareModal } from "./Share/LanShareBar";

const api = window.api;

export function Nav({
  runGame,
  setIsFriends,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  setIsFriends: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom);
  const setServer = useAtom(serverAtom)[1];
  const setIsOwnerVersion = useAtom(isOwnerVersionAtom)[1];
  const [selectedAccount] = useAtom(accountAtom);
  const [isAddVersion, setVersionModal] = useState(false);
  const [isSettingsModal, setOpenSettingsModal] = useState(false);
  const [isNetwork] = useAtom(networkAtom);
  const { t } = useTranslation();
  const [isRunning] = useAtom(isRunningAtom);
  const [paths] = useAtom(pathsAtom);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useAtom(isShareModalOpenAtom);
  const [consoles] = useAtom(consolesAtom);
  const [isFriendsConnected] = useAtom(isFriendsConnectedAtom);
  const [shareState] = useAtom(shareStateAtom);
  const isPlainShareBlocked =
    selectedAccount?.type === "plain" && !shareState.sessionId;

  const consoleBtnColor = useMemo(() => {
    if (consoles.consoles.length > 0) {
      return consoles.consoles.some((c) => c.status === "error")
        ? "danger"
        : consoles.consoles.some((c) => c.status === "stopped")
          ? "warning"
          : "success";
    }

    return "primary";
  }, [consoles.consoles]);

  const shouldShowShareButton = useMemo(() => {
    return !["idle", "lan_not_found"].includes(shareState.phase);
  }, [shareState.phase]);

  useEffect(() => {
    if (!shouldShowShareButton) {
      setIsShareOpen(false);
    }
  }, [shouldShowShareButton]);

  const shareBtnColor = useMemo(() => {
    switch (shareState.phase) {
      case "online":
        return "success";
      case "reconnecting":
      case "pending":
      case "tunnel_connecting":
      case "share_starting":
        return "warning";
      case "conflict":
      case "error":
        return "danger";
      default:
        return "default";
    }
  }, [shareState.phase]);

  return (
    <>
      <div className="w-full px-4 py-2">
        <div className="flex gap-4 items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Accounts />
            {!isNetwork && (
              <Chip variant="dot" color="danger">
                {t("app.serverUnavailable")}
              </Chip>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {consoles.consoles.length > 0 && (
              <Button
                isIconOnly
                variant="flat"
                color={consoleBtnColor}
                onPress={() => setIsConsoleOpen(true)}
              >
                <SquareChevronRight size={22} />
              </Button>
            )}

            {shouldShowShareButton && (
              <Tooltip
                content={
                  isPlainShareBlocked
                    ? t("share.plainAccountDisabled")
                    : t("share.title")
                }
                delay={1000}
              >
                <span>
                  <Button
                    isIconOnly
                    variant="flat"
                    color={shareBtnColor}
                    isDisabled={isPlainShareBlocked}
                    onPress={() => setIsShareOpen(true)}
                  >
                    <Wifi size={22} />
                  </Button>
                </span>
              </Tooltip>
            )}

            {selectedAccount && selectedVersion && (
              <Button
                isLoading={isRunning}
                isDisabled={isRunning}
                variant="flat"
                color="secondary"
                startContent={<Gamepad2 size={22} />}
                onPress={async () => {
                  await runGame({ version: selectedVersion });
                }}
              >
                {t("nav.play")}
              </Button>
            )}

            {selectedAccount && isNetwork && (
              <Button
                variant="flat"
                isDisabled={isRunning}
                startContent={<ListPlus size={22} />}
                onPress={() => {
                  setSelectedVersion(undefined);
                  setServer(undefined);
                  setIsOwnerVersion(false);
                  setVersionModal(true);
                }}
              >
                {t("nav.addVersion")}
              </Button>
            )}

            {isNetwork && selectedAccount && (
              <Button
                variant="flat"
                startContent={<BookUser size={22} />}
                isDisabled={
                  selectedAccount.type === "plain" || !isFriendsConnected
                }
                onPress={() => {
                  setIsFriends((prev) => !prev);
                }}
              >
                {t("friends.title")}
              </Button>
            )}

            <Button
              variant="flat"
              isDisabled={isRunning}
              startContent={<LSettings size={22} />}
              onPress={() => setOpenSettingsModal(true)}
            >
              {t("settings.title")}
            </Button>

            <Button
              variant="flat"
              isIconOnly
              onPress={async () => {
                try {
                  await api.shell.openExternal("https://discord.gg/URrKha9hk7");
                } catch {}
              }}
            >
              <FaDiscord size={22} />
            </Button>
          </div>
        </div>
      </div>
      {isSettingsModal && (
        <Settings onClose={() => setOpenSettingsModal(false)} />
      )}
      {isAddVersion && (
        <AddVersion
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
      )}
      {isConsoleOpen && (
        <Console onClose={() => setIsConsoleOpen(false)} runGame={runGame} />
      )}
      <LanShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
      />
    </>
  );
}
