import {
  accountAtom,
  sharePeersAtom,
  shareStateAtom,
} from "@renderer/stores/atoms";
import {
  getSharePhaseColor,
  getSharePhaseDescription,
  getShareErrorText,
  getSharePhaseText,
} from "@renderer/utilities/share";
import {
  addToast,
  Alert,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
} from "@heroui/react";
import { useAtom } from "jotai";
import { Copy, Globe, RefreshCcw, Shield, Square, Wifi } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShareStatePhase, ShareVisibility } from "@/types/Share";

const api = window.api;
const BUSY_PHASES: ShareStatePhase[] = [
  "share_starting",
  "tunnel_connecting",
  "pending",
  "reconnecting",
];

export function LanShareModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [shareState] = useAtom(shareStateAtom);
  const [sharePeers] = useAtom(sharePeersAtom);
  const [selectedAccount] = useAtom(accountAtom);
  const [selectedVisibility, setSelectedVisibility] =
    useState<ShareVisibility>("friends");
  const [loadingAction, setLoadingAction] = useState<
    "start" | "stop" | "visibility" | null
  >(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (shareState.visibility) {
      setSelectedVisibility(shareState.visibility);
    }
  }, [shareState.visibility]);

  const canStart = useMemo(() => {
    return (
      !!shareState.candidate &&
      ["lan_ready", "stopped", "conflict", "error"].includes(shareState.phase)
    );
  }, [shareState.candidate, shareState.phase]);

  const canStop = useMemo(() => {
    return (
      !!shareState.sessionId ||
      ["reconnecting", "pending"].includes(shareState.phase)
    );
  }, [shareState.phase, shareState.sessionId]);

  const isBusyPhase = BUSY_PHASES.includes(shareState.phase);
  const isPlainShareBlocked =
    selectedAccount?.type === "plain" && !shareState.sessionId;

  const targetLabel = shareState.target
    ? `${shareState.target.versionName} [${shareState.target.instance}]`
    : null;
  const targetPort = shareState.target?.localPort;
  const errorText = getShareErrorText(t, shareState.lastError);
  const statusColor = getSharePhaseColor(shareState.phase);
  const statusDescription = getSharePhaseDescription(t, shareState.phase);
  const visibilityDescription = t(
    selectedVisibility === "public"
      ? "share.visibilityDescriptions.public"
      : "share.visibilityDescriptions.friends",
  );

  const handleCopy = async () => {
    if (!shareState.publicAddress) return;

    await api.clipboard.writeText(shareState.publicAddress);
    addToast({
      title: t("common.copied"),
      color: "success",
    });
  };

  const handleStart = async () => {
    if (!canStart) return;

    setLoadingAction("start");
    try {
      await api.share.startShare(selectedVisibility);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStop = async () => {
    if (!canStop) return;

    setLoadingAction("stop");
    try {
      await api.share.stopShare();
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVisibilityChange = async (visibility: ShareVisibility) => {
    setSelectedVisibility(visibility);

    if (!shareState.sessionId) return;

    setLoadingAction("visibility");
    try {
      await api.share.updateShareVisibility(visibility);
    } finally {
      setLoadingAction(null);
    }
  };

  const primaryAction = useMemo(() => {
    if (isBusyPhase) {
      return {
        label: getSharePhaseText(t, shareState.phase),
        color: "secondary" as const,
        icon:
          shareState.phase === "reconnecting" ? (
            <RefreshCcw size={18} />
          ) : (
            <Wifi size={18} />
          ),
        isLoading: true,
        isDisabled: true,
        onPress: handleStart,
      };
    }

    if (canStop) {
      return {
        label: t("share.stop"),
        color: "danger" as const,
        icon: <Square size={18} />,
        isLoading: loadingAction === "stop",
        isDisabled: loadingAction !== null,
        onPress: handleStop,
      };
    }

    return {
      label: t("share.start"),
      color: "secondary" as const,
      icon: <Wifi size={18} />,
      isLoading: loadingAction === "start",
      isDisabled: isPlainShareBlocked || !canStart || loadingAction !== null,
      onPress: handleStart,
    };
  }, [
    canStart,
    canStop,
    handleStart,
    handleStop,
    isBusyPhase,
    isPlainShareBlocked,
    loadingAction,
    shareState.phase,
    t,
  ]);

  if (!isOpen) {
    return null;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalContent>
        <ModalHeader>{t("share.title")}</ModalHeader>
        <ModalBody className="pb-4">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Chip color={statusColor} variant="flat">
                  {getSharePhaseText(t, shareState.phase)}
                </Chip>
                {shareState.isAuthenticated && (
                  <Chip color="success" variant="dot">
                    {t("share.authenticated")}
                  </Chip>
                )}
                {shareState.isDegraded && (
                  <Chip color="warning" variant="flat">
                    {t("share.degraded")}
                  </Chip>
                )}
                {sharePeers.length > 0 && (
                  <Chip color="secondary" variant="flat">
                    {t("share.peers", { count: sharePeers.length })}
                  </Chip>
                )}
                {shareState.phase === "online" && shareState.publicAddress && (
                  <Chip variant="dot" color="success">
                    {shareState.visibility === "public"
                      ? t("share.publicOnline")
                      : t("share.friendsOnline")}
                  </Chip>
                )}
              </div>

              <p className="text-sm text-default-500">{statusDescription}</p>
            </section>

            <Card>
              <CardBody className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-default-400">
                    {t("share.world")}
                  </p>
                  {targetLabel ? (
                    <p className="text-sm text-default-700">
                      {targetLabel}
                      {typeof targetPort === "number"
                        ? `, 127.0.0.1:${targetPort}`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-default-500">
                      {t("share.waitForLan")}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-default-400">
                    {t("share.address")}
                  </p>
                  <p className="break-all text-sm text-default-700">
                    {shareState.publicAddress || t("share.addressPending")}
                  </p>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-default-700">
                    {t("share.visibility")}
                  </p>
                  <p className="text-sm text-default-500">
                    {visibilityDescription}
                  </p>
                </div>

                <ButtonGroup className="w-full">
                  <Button
                    className="flex-1"
                    color={
                      selectedVisibility === "public" ? "primary" : "default"
                    }
                    variant="flat"
                    isDisabled={
                      isPlainShareBlocked ||
                      loadingAction !== null ||
                      isBusyPhase
                    }
                    startContent={<Globe size={18} />}
                    onPress={() => void handleVisibilityChange("public")}
                  >
                    {t("share.public")}
                  </Button>
                  <Button
                    className="flex-1"
                    color={
                      selectedVisibility === "friends" ? "primary" : "default"
                    }
                    variant="flat"
                    isDisabled={
                      isPlainShareBlocked ||
                      loadingAction !== null ||
                      isBusyPhase
                    }
                    startContent={<Shield size={18} />}
                    onPress={() => void handleVisibilityChange("friends")}
                  >
                    {t("share.friends")}
                  </Button>
                </ButtonGroup>
              </CardBody>
            </Card>

            {errorText && shareState.phase !== "idle" && (
              <Alert
                color={shareState.phase === "conflict" ? "warning" : "danger"}
                title={errorText}
              />
            )}

            {isPlainShareBlocked && (
              <Alert color="warning" title={t("share.plainAccountDisabled")} />
            )}

            <section className="flex gap-2">
              {shareState.publicAddress && (
                <Button
                  variant="flat"
                  startContent={<Copy size={18} />}
                  isDisabled={loadingAction !== null}
                  onPress={() => void handleCopy()}
                >
                  {t("share.copyAddress")}
                </Button>
              )}

              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="flat"
                  color={primaryAction.color}
                  isLoading={primaryAction.isLoading}
                  isDisabled={primaryAction.isDisabled}
                  startContent={primaryAction.icon}
                  onPress={() => void primaryAction.onPress()}
                >
                  {primaryAction.label}
                </Button>
              </div>
            </section>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
