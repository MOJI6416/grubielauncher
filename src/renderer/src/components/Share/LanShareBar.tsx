import {
  accountAtom,
  shareOwnerAccountKeyAtom,
  sharePeersAtom,
  shareStateAtom,
} from "@renderer/stores/atoms";
import {
  getShareErrorText,
  getSharePhaseColor,
  getSharePhaseDescription,
  getSharePhaseText,
} from "@renderer/utilities/share";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAtom } from "jotai";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Globe,
  Loader2,
  LockKeyhole,
  RefreshCcw,
  Shield,
  Square,
  Users,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShareStatePhase,
  ShareStreamDiagnostic,
  ShareVisibility,
} from "@/types/Share";
import { toast } from "sonner";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";

const api = window.api;

const BUSY_PHASES: ShareStatePhase[] = [
  "share_starting",
  "tunnel_connecting",
  "pending",
  "reconnecting",
];

const NORMAL_STREAM_CLOSE_REASONS = new Set([
  "local_socket_closed",
  "share_stopped",
]);

function statusVariant(color: string) {
  if (color === "danger") return "destructive";
  if (color === "default") return "outline";
  return "secondary";
}

function statusDotClassName(color: string) {
  if (color === "success") return "bg-emerald-500";
  if (color === "warning") return "bg-yellow-500";
  if (color === "danger") return "bg-destructive";
  return "bg-muted-foreground";
}

function shouldShowStreamDiagnostic(
  diagnostic: ShareStreamDiagnostic | undefined,
) {
  return (
    !!diagnostic &&
    !!diagnostic.reason &&
    !NORMAL_STREAM_CLOSE_REASONS.has(diagnostic.reason)
  );
}

function fallbackStreamReason(reason: string) {
  return reason.replace(/[_-]+/g, " ");
}

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
  const [shareOwnerAccountKey] = useAtom(shareOwnerAccountKeyAtom);
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
  const targetText = targetLabel
    ? `${targetLabel}${
        typeof targetPort === "number" ? `, 127.0.0.1:${targetPort}` : ""
      }`
    : t("share.waitForLan");
  const errorText = getShareErrorText(t, shareState.lastError);
  const streamDiagnostic = shouldShowStreamDiagnostic(
    shareState.lastStreamDiagnostic,
  )
    ? shareState.lastStreamDiagnostic
    : undefined;
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
    toast.success(t("common.copied"));
  };

  const handleStart = async () => {
    if (!canStart) return;

    setLoadingAction("start");
    try {
      const result = await api.share.startShare(selectedVisibility);
      if (!result.ok) {
        toast.error(getShareErrorText(t, result.error));
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleStop = async () => {
    if (!canStop) return;

    setLoadingAction("stop");
    try {
      const result = await api.share.stopShare();
      if (!result.ok) {
        toast.error(getShareErrorText(t, result.error));
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleVisibilityChange = async (visibility: ShareVisibility) => {
    const previousVisibility = selectedVisibility;
    setSelectedVisibility(visibility);

    if (!shareState.sessionId) return;

    setLoadingAction("visibility");
    try {
      const result = await api.share.updateShareVisibility(visibility);
      if (!result.ok) {
        setSelectedVisibility(previousVisibility);
        toast.error(getShareErrorText(t, result.error));
      }
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
        loading: true,
        disabled: true,
        onClick: handleStart,
      };
    }

    if (canStop) {
      return {
        label: t("share.stop"),
        color: "danger" as const,
        icon: <Square size={18} />,
        loading: loadingAction === "stop",
        disabled: loadingAction !== null,
        onClick: handleStop,
      };
    }

    return {
      label: t("share.start"),
      color: "default" as const,
      icon: <Wifi size={18} />,
      loading: loadingAction === "start",
      disabled: isPlainShareBlocked || !canStart || loadingAction !== null,
      onClick: handleStart,
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

  if (!canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)) {
    return null;
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined} className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>{t("share.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 p-5">
          <Card className="gap-0 p-0 shadow-none">
            <CardContent className="flex min-w-0 items-start gap-3 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                {shareState.phase === "online" ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : isBusyPhase ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Wifi className="size-5" />
                )}
              </div>

              <div className="grid min-w-0 flex-1 gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 overflow-hidden">
                  <Badge
                    variant={statusVariant(statusColor)}
                    className="min-w-0 max-w-full gap-1.5"
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${statusDotClassName(
                        statusColor,
                      )}`}
                    />
                    <span className="min-w-0 truncate">
                      {getSharePhaseText(t, shareState.phase)}
                    </span>
                  </Badge>

                  {shareState.isAuthenticated && (
                    <Badge
                      variant="secondary"
                      className="min-w-0 max-w-full gap-1.5"
                    >
                      <CheckCircle2 className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("share.authenticated")}
                      </span>
                    </Badge>
                  )}

                  {shareState.isDegraded && (
                    <Badge
                      variant="secondary"
                      className="min-w-0 max-w-full gap-1.5"
                    >
                      <AlertCircle className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("share.degraded")}
                      </span>
                    </Badge>
                  )}

                  {sharePeers.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="min-w-0 max-w-full gap-1.5"
                    >
                      <Users className="size-3.5 shrink-0" />
                      <span className="min-w-0 truncate">
                        {t("share.peers", { count: sharePeers.length })}
                      </span>
                    </Badge>
                  )}
                </div>

                <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                  {statusDescription}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0 shadow-none">
            <CardContent className="grid min-h-[7.25rem] gap-4 p-4">
              <div className="grid gap-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wifi className="size-4 text-muted-foreground" />
                  {t("share.world")}
                </div>
                <p className="min-w-0 truncate text-sm text-muted-foreground">
                  {targetText}
                </p>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Globe className="size-4 text-muted-foreground" />
                  {t("share.address")}
                </div>
                {shareState.publicAddress ? (
                  <p className="min-w-0 truncate text-sm text-muted-foreground">
                    {shareState.publicAddress}
                  </p>
                ) : (
                  <p className="min-w-0 truncate text-sm text-muted-foreground">
                    {t("share.addressPending")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="gap-1.5 px-4 pt-4 pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <LockKeyhole className="size-4 text-muted-foreground" />
                {t("share.visibility")}
              </CardTitle>
              <CardDescription className="line-clamp-2">
                {visibilityDescription}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ButtonGroup className="w-full [&>*]:flex-1">
                <Button
                  className="flex-1"
                  variant={
                    selectedVisibility === "public" ? "default" : "secondary"
                  }
                  disabled={
                    isPlainShareBlocked || loadingAction !== null || isBusyPhase
                  }
                  onClick={() => void handleVisibilityChange("public")}
                >
                  <Globe size={18} />
                  {t("share.public")}
                </Button>
                <Button
                  className="flex-1"
                  variant={
                    selectedVisibility === "friends" ? "default" : "secondary"
                  }
                  disabled={
                    isPlainShareBlocked || loadingAction !== null || isBusyPhase
                  }
                  onClick={() => void handleVisibilityChange("friends")}
                >
                  <Shield size={18} />
                  {t("share.friends")}
                </Button>
              </ButtonGroup>
            </CardContent>
          </Card>

          {errorText && shareState.phase !== "idle" && (
            <Alert
              variant={shareState.phase === "conflict" ? "warning" : "destructive"}
            >
              <AlertCircle />
              <AlertTitle>{errorText}</AlertTitle>
            </Alert>
          )}

          {streamDiagnostic && (
            <Alert variant="info">
              <AlertCircle />
              <AlertTitle>{t("share.streamDiagnostic.title")}</AlertTitle>
              <AlertDescription className="break-words">
                {t("share.streamDiagnostic.description", {
                  reason: t(
                    `share.streamDiagnostic.reasons.${streamDiagnostic.reason}`,
                    {
                      defaultValue: fallbackStreamReason(
                        streamDiagnostic.reason,
                      ),
                    },
                  ),
                  source: t(
                    `share.streamDiagnostic.sources.${streamDiagnostic.source}`,
                  ),
                  streamId: streamDiagnostic.streamId,
                })}
              </AlertDescription>
            </Alert>
          )}

          {isPlainShareBlocked && (
            <Alert variant="info">
              <AlertCircle />
              <AlertTitle>{t("share.plainAccountDisabled")}</AlertTitle>
              <AlertDescription>{t("share.waitForLan")}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 min-w-0 rounded-none bg-muted/25 px-5 py-4 sm:items-center sm:justify-end">
          {shareState.publicAddress ? (
            <Button
              className="min-w-0"
              variant="secondary"
              disabled={loadingAction !== null}
              onClick={() => void handleCopy()}
            >
              <Copy className="shrink-0" size={18} />
              <span className="min-w-0 truncate">{t("share.copyAddress")}</span>
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}

          <Button
            className="min-w-0 max-w-full"
            variant={
              primaryAction.color === "danger"
                ? "destructive"
                : primaryAction.color === "secondary"
                  ? "secondary"
                  : "default"
            }
            disabled={primaryAction.disabled}
            onClick={() => void primaryAction.onClick()}
          >
            {primaryAction.loading ? (
              <Loader2 className="shrink-0 animate-spin" size={18} />
            ) : (
              primaryAction.icon
            )}
            <span className="min-w-0 truncate">{primaryAction.label}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
