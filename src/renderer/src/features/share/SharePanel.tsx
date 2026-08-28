import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Radio,
  Search,
  Shield,
  Square,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import type { ShareVisibility } from "@/types/Share";
import type { GameInviteResult } from "@/types/GameInvite";
import {
  accountAtom,
  friendSocketAtom,
  friendsAtom,
  internetAtom,
  isFriendsConnectedAtom,
  networkAtom,
  ownPresenceAtom,
  shareOwnerAccountKeyAtom,
  sharePeersAtom,
  shareStateAtom,
} from "@renderer/stores/atoms";
import {
  claimGameInviteResults,
  releaseGameInviteResults,
} from "@renderer/features/friends/gameInvite";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import {
  getShareErrorDetails,
  getShareErrorText,
} from "@renderer/utilities/share";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { buildGuestRows, guestUserIds } from "./guests";
import { buildInviteCandidates, countInvitable } from "./invites";
import { parseShareAddress } from "./shareAddress";
import {
  canGuestsJoin,
  elapsedSince,
  formatShareUptime,
  getShareHealth,
  getShareHint,
  getSharePrimaryKind,
  getShareSteps,
  getShareTone,
  isShareLive,
  isSharePhaseBusy,
  resolveShareStage,
  resolveVisibilityView,
  shouldShowStreamDiagnostic,
  type ShareHint,
  type ShareStage,
} from "./shareModel";
import { ShareGuestList } from "./ShareGuestList";
import { ShareInviteList } from "./ShareInviteList";
import { ShareStatus } from "./ShareStatus";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const SENT_INVITE_RESET_MS = 12_000;
const INVITE_ANSWER_TIMEOUT_MS = 15_000;

function Section({
  icon,
  title,
  count,
  action,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col gap-1.5", className)}>
      <div className="flex h-5 shrink-0 items-center gap-2">
        <span className="shrink-0 text-faint">{icon}</span>
        <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
          {title}
        </span>
        {typeof count === "number" && (
          <span className="font-mono text-[0.65rem] tabular-nums text-faint">
            {count}
          </span>
        )}
        {action && <span className="ml-auto flex items-center">{action}</span>}
      </div>
      {children}
    </section>
  );
}

export function LanShareModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const shareState = useAtomValue(shareStateAtom);
  const sharePeers = useAtomValue(sharePeersAtom);
  const friends = useAtomValue(friendsAtom);
  const selectedAccount = useAtomValue(accountAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const friendSocket = useAtomValue(friendSocketAtom);
  const isFriendsConnected = useAtomValue(isFriendsConnectedAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const isBackendOnline = useAtomValue(networkAtom);
  const { t } = useTranslation();

  const [pendingAction, setPendingAction] = useState<
    "start" | "stop" | "visibility" | null
  >(null);
  const [draftVisibility, setDraftVisibility] =
    useState<ShareVisibility>("friends");
  const [isAddressRevealed, setIsAddressRevealed] = useState(false);
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [sendingInviteIds, setSendingInviteIds] = useState<string[]>([]);
  const [sentInviteIds, setSentInviteIds] = useState<string[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sentTimersRef = useRef<number[]>([]);
  const answerTimersRef = useRef(new Map<string, number>());

  const isAccountEligible =
    !!selectedAccount && selectedAccount.type !== "plain";
  const isOnline = isInternetOnline && isBackendOnline;
  const context = useMemo(
    () => ({ isAccountEligible, isOnline }),
    [isAccountEligible, isOnline],
  );

  const stage = resolveShareStage(shareState, context);
  const tone = getShareTone(stage);
  const steps = useMemo(() => getShareSteps(shareState), [shareState]);
  const primaryKind = getSharePrimaryKind(shareState, context);
  const isOpenForGuests = canGuestsJoin(shareState);
  const isBusy = isSharePhaseBusy(shareState.phase);
  const health = getShareHealth(shareState);
  const address = useMemo(
    () => parseShareAddress(shareState.publicAddress),
    [shareState.publicAddress],
  );
  const diagnostic = shouldShowStreamDiagnostic(
    shareState.lastStreamDiagnostic,
    stage,
  )
    ? shareState.lastStreamDiagnostic
    : undefined;

  useEffect(() => {
    if (shareState.visibility) setDraftVisibility(shareState.visibility);
  }, [shareState.visibility]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (isOpenForGuests) return;
    setIsAddressRevealed(false);
    setIsConfirmingStop(false);
  }, [isOpenForGuests]);

  useEffect(() => {
    const timers = sentTimersRef.current;
    const answerTimers = answerTimersRef.current;
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      for (const timer of answerTimers.values()) window.clearTimeout(timer);
      releaseGameInviteResults([...answerTimers.keys()]);
      answerTimers.clear();
    };
  }, []);

  const accountNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const friend of friends) {
      if (friend.user?._id) byId.set(friend.user._id, friend.user.nickname);
    }
    return byId;
  }, [friends]);

  const guestRows = useMemo(
    () => buildGuestRows(sharePeers, accountNameById),
    [accountNameById, sharePeers],
  );

  const joinedUserIds = useMemo(() => guestUserIds(guestRows), [guestRows]);

  const inviteCandidates = useMemo(
    () =>
      buildInviteCandidates({
        friends,
        joinedUserIds,
        sentIds: new Set(sentInviteIds),
        sendingIds: new Set(sendingInviteIds),
        query: inviteQuery,
      }),
    [friends, inviteQuery, joinedUserIds, sendingInviteIds, sentInviteIds],
  );

  const invitableCount = countInvitable(inviteCandidates);

  const reportError = useCallback(
    (error: Parameters<typeof getShareErrorText>[1]) => {
      showErrorToast(
        getShareErrorText(t, error),
        getShareErrorDetails(t, error),
        t("common.copy"),
      );
    },
    [t],
  );

  const handleStart = useCallback(async () => {
    setPendingAction("start");
    try {
      const result = await api.share.startShare(draftVisibility);
      if (!result.ok) reportError(result.error);
    } finally {
      setPendingAction(null);
    }
  }, [draftVisibility, reportError]);

  const handleStop = useCallback(async () => {
    setPendingAction("stop");
    try {
      const result = await api.share.stopShare();
      if (!result.ok) reportError(result.error);
      else setIsConfirmingStop(false);
    } finally {
      setPendingAction(null);
    }
  }, [reportError]);

  const handleVisibility = useCallback(
    async (visibility: ShareVisibility) => {
      const previous = draftVisibility;
      setDraftVisibility(visibility);
      if (!shareState.sessionId) return;

      setPendingAction("visibility");
      try {
        const result = await api.share.updateShareVisibility(visibility);
        if (!result.ok) {
          setDraftVisibility(previous);
          reportError(result.error);
        }
      } finally {
        setPendingAction(null);
      }
    },
    [draftVisibility, reportError, shareState.sessionId],
  );

  const handleCopyAddress = useCallback(async () => {
    if (!address) return;
    if (!(await copyToClipboard(address.raw))) return;
    toast.success(t("common.copied"));
  }, [address, t]);

  const inviteReason = useCallback(
    (code: string | undefined) => {
      if (code === "offline") return t("friends.operationErrors.offline");
      if (code === "timeout") return t("friends.operationErrors.timeout");
      const key = `friends.inviteErrors.${code || "unknown"}`;
      const message = t(key);
      return message === key ? t("friends.inviteErrors.unknown") : message;
    },
    [t],
  );

  const settleInvite = useCallback((recipientId: string) => {
    const timer = answerTimersRef.current.get(recipientId);
    if (timer !== undefined) window.clearTimeout(timer);
    answerTimersRef.current.delete(recipientId);
    releaseGameInviteResults([recipientId]);
    setSendingInviteIds((prev) => prev.filter((id) => id !== recipientId));
  }, []);

  const markInviteSent = useCallback((recipientId: string) => {
    setSentInviteIds((prev) =>
      prev.includes(recipientId) ? prev : [...prev, recipientId],
    );

    const timer = window.setTimeout(() => {
      setSentInviteIds((prev) => prev.filter((id) => id !== recipientId));
    }, SENT_INVITE_RESET_MS);
    sentTimersRef.current.push(timer);
  }, []);

  useEffect(() => {
    if (!friendSocket) return;

    const handleResult = (result: GameInviteResult) => {
      const recipientId = result?.recipientId;
      if (!recipientId || !answerTimersRef.current.has(recipientId)) return;

      settleInvite(recipientId);

      if (result.ok) {
        markInviteSent(recipientId);
        return;
      }

      if (result.notified === "telegram") {
        toast.success(t("friends.inviteNotifiedTelegram"));
        return;
      }

      toast.warning(inviteReason(result.code));
    };

    const handleDisconnect = () => {
      const waiting = [...answerTimersRef.current.keys()];
      if (waiting.length === 0) return;
      for (const recipientId of waiting) settleInvite(recipientId);
      toast.warning(inviteReason("offline"));
    };

    friendSocket.on("gameInviteResult", handleResult);
    friendSocket.on("disconnect", handleDisconnect);

    return () => {
      friendSocket.off("gameInviteResult", handleResult);
      friendSocket.off("disconnect", handleDisconnect);
    };
  }, [friendSocket, inviteReason, markInviteSent, settleInvite, t]);

  const handleInvite = useCallback(
    (recipientId: string) => {
      if (!friendSocket || !isOpenForGuests) return;
      if (!shareState.slug || !shareState.sessionId) return;
      if (answerTimersRef.current.has(recipientId)) return;

      if (!friendSocket.connected) {
        toast.warning(t("friends.operationErrors.offline"));
        return;
      }

      if (!ownPresence.versionCode) {
        toast.warning(inviteReason("unpublished_version"));
        return;
      }

      claimGameInviteResults([recipientId]);
      answerTimersRef.current.set(
        recipientId,
        window.setTimeout(() => {
          settleInvite(recipientId);
          toast.warning(inviteReason("timeout"));
        }, INVITE_ANSWER_TIMEOUT_MS),
      );
      setSendingInviteIds((prev) =>
        prev.includes(recipientId) ? prev : [...prev, recipientId],
      );

      friendSocket.emit("gameInvite", {
        recipientId,
        target: {
          type: "world",
          slug: shareState.slug,
          sessionId: shareState.sessionId,
          publicAddress: shareState.publicAddress,
          visibility: shareState.visibility,
        },
      });
    },
    [
      friendSocket,
      inviteReason,
      isOpenForGuests,
      ownPresence.versionCode,
      settleInvite,
      shareState.publicAddress,
      shareState.sessionId,
      shareState.slug,
      shareState.visibility,
      t,
    ],
  );

  if (!isOpen) return null;
  if (!canCurrentAccountManageShare(shareOwnerAccountKey, selectedAccount)) {
    return null;
  }

  const stageCopy = (): { title: string; description: string } => {
    switch (stage) {
      case "accountUnsupported":
        return {
          title: t("share.panel.stage.accountUnsupported.title"),
          description: t("share.panel.stage.accountUnsupported.description"),
        };
      case "offline":
        return {
          title: t("share.panel.stage.offline.title"),
          description: t("share.panel.stage.offline.description"),
        };
      case "noGame":
        return {
          title: t("share.panel.stage.noGame.title"),
          description: t("share.panel.stage.noGame.description"),
        };
      case "needsWorld":
        return {
          title: t("share.panel.stage.needsWorld.title"),
          description: t("share.panel.stage.needsWorld.description"),
        };
      case "ready":
        return {
          title: t("share.panel.stage.ready.title"),
          description: t("share.panel.stage.ready.description"),
        };
      case "starting":
        return {
          title: t("share.panel.stage.starting.title"),
          description: t("share.panel.stage.starting.description"),
        };
      case "open":
        return {
          title: t("share.panel.stage.open.title"),
          description:
            shareState.visibility === "public"
              ? t("share.panel.stage.open.descriptionPublic")
              : t("share.panel.stage.open.description"),
        };
      case "recovering":
        return {
          title: t("share.panel.stage.recovering.title"),
          description: t("share.panel.stage.recovering.description"),
        };
      case "conflict":
        return {
          title: t("share.panel.stage.conflict.title"),
          description: t("share.panel.stage.conflict.description"),
        };
      default:
        return {
          title: t("share.panel.stage.failed.title"),
          description:
            getShareErrorText(t, shareState.lastError) ||
            t("share.panel.stage.failed.description"),
        };
    }
  };

  const hintText = (hint: ShareHint): string => {
    switch (hint) {
      case "openToLan":
        return t("share.panel.hint.openToLan");
      case "startGame":
        return t("share.panel.hint.startGame");
      case "signIn":
        return t("share.panel.hint.signIn");
      case "checkInternet":
        return t("share.panel.hint.checkInternet");
      case "stopOtherSession":
        return t("share.panel.hint.stopOtherSession");
      case "updateLauncher":
        return t("share.panel.hint.updateLauncher");
      case "closeAndReopen":
        return t("share.panel.hint.closeAndReopen");
      case "retry":
        return t("share.panel.hint.retry");
      default:
        return "";
    }
  };

  const { title, description } = stageCopy();
  const hint = hintText(
    getShareHint(stage, shareState.lastError?.code, isShareLive(shareState)),
  );
  const showHowTo: ShareStage[] = ["noGame", "needsWorld"];
  const isFriendsReachable = !!friendSocket && isFriendsConnected;
  const canInvite =
    isOpenForGuests && isFriendsReachable && !!ownPresence.versionCode;
  const inviteNote = !isOpenForGuests
    ? isBusy
      ? t("share.panel.invite.waiting")
      : t("share.panel.invite.notOpen")
    : !isFriendsReachable
      ? t("share.panel.invite.offlineSocket")
      : !ownPresence.versionCode
        ? t("friends.inviteErrors.unpublished_version")
        : "";
  const targetLabel = shareState.target
    ? `${shareState.target.versionName} #${shareState.target.instance}`
    : shareState.candidate
      ? `${shareState.candidate.versionName} #${shareState.candidate.instance}`
      : null;
  const targetPort =
    shareState.target?.localPort ?? shareState.candidate?.localPort;

  const uptime =
    isOpenForGuests && shareState.lastAuthOkAt
      ? formatShareUptime(elapsedSince(shareState.lastAuthOkAt, nowMs))
      : undefined;

  const isVisibilityLocked =
    pendingAction !== null || isBusy || !isAccountEligible;
  const visibility = resolveVisibilityView(shareState, draftVisibility);
  const effectiveAccessLabel =
    visibility.effective === "public"
      ? t("share.panel.access.public")
      : t("share.panel.access.friends");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="grid h-auto max-h-none w-[26rem] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 rounded-none rounded-l-2xl border-l border-border bg-surface-1 p-0 ring-0 sm:max-w-none"
        style={{
          inset: "auto",
          top: "env(titlebar-area-height, 0px)",
          right: 0,
          bottom: 0,
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-2.5">
          <Radio className="size-4 shrink-0 text-faint" />
          <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
            {t("share.title")}
          </DialogTitle>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("share.panel.close")}
            onClick={onClose}
          >
            <X />
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border bg-surface-2">
            <ShareStatus
              tone={tone}
              title={title}
              description={description}
              steps={steps}
              isBusy={isBusy}
              meta={uptime}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4 py-3">
            {targetLabel && (
              <div className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5">
                <Users className="size-3.5 shrink-0 text-faint" />
                <Hint content={targetLabel} variant="text" truncatedOnly>
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {targetLabel}
                  </span>
                </Hint>
                {typeof targetPort === "number" && (
                  <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-faint">
                    :{targetPort}
                  </span>
                )}
              </div>
            )}

            {showHowTo.includes(stage) && (
              <div className="shrink-0 rounded-lg border border-border bg-surface-2 p-2.5">
                <p className="mb-1.5 text-xs font-medium">
                  {t("share.panel.howTo.title")}
                </p>
                <ol className="grid gap-1 text-xs leading-4 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-faint">1</span>
                    {t("share.panel.howTo.one")}
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-faint">2</span>
                    {t("share.panel.howTo.two")}
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0 font-mono text-faint">3</span>
                    {t("share.panel.howTo.three")}
                  </li>
                </ol>
              </div>
            )}

            <Section
              className="shrink-0"
              icon={<Shield className="size-3.5" />}
              title={t("share.panel.access.title")}
            >
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface-2 p-1">
                {(["friends", "public"] as ShareVisibility[]).map((value) => {
                  const isActive = draftVisibility === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={isVisibilityLocked}
                      onClick={() => void handleVisibility(value)}
                      className={cn(
                        "flex h-7 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        isActive
                          ? "bg-surface-3 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {value === "friends" ? (
                        <Shield className="size-3.5" />
                      ) : (
                        <Globe className="size-3.5" />
                      )}
                      {value === "friends"
                        ? t("share.panel.access.friends")
                        : t("share.panel.access.public")}
                    </button>
                  );
                })}
              </div>
              <p
                className={cn(
                  "text-xs leading-4",
                  visibility.effective === "public"
                    ? "text-warning"
                    : "text-muted-foreground",
                )}
              >
                {visibility.isApplying
                  ? t("share.panel.access.applying", {
                      access: effectiveAccessLabel,
                    })
                  : visibility.effective === "public"
                    ? t("share.panel.access.publicHint")
                    : t("share.panel.access.friendsHint")}
              </p>
            </Section>

            {isOpenForGuests && (
              <Section
                className="shrink-0"
                icon={<Globe className="size-3.5" />}
                title={t("share.panel.address.title")}
                action={
                  address &&
                  visibility.effective === "public" && (
                    <span className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={
                              isAddressRevealed
                                ? t("share.panel.address.hide")
                                : t("share.panel.address.reveal")
                            }
                            onClick={() =>
                              setIsAddressRevealed((prev) => !prev)
                            }
                          >
                            {isAddressRevealed ? <EyeOff /> : <Eye />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isAddressRevealed
                            ? t("share.panel.address.hide")
                            : t("share.panel.address.reveal")}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label={t("share.panel.address.copy")}
                            onClick={() => void handleCopyAddress()}
                          >
                            <Copy />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {t("share.panel.address.copy")}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  )
                }
              >
                {visibility.effective === "public" && address ? (
                  <p className="truncate rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                    {isAddressRevealed ? address.raw : address.masked}
                  </p>
                ) : (
                  <p className="text-xs leading-4 text-muted-foreground">
                    {t("share.panel.address.friends")}
                  </p>
                )}
              </Section>
            )}

            {(health.isDegraded || health.isHeartbeatLost || diagnostic) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex shrink-0 items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-2 text-left">
                    <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
                    <p className="min-w-0 text-xs leading-4 text-warning">
                      {health.isHeartbeatLost
                        ? t("share.panel.health.heartbeatLost")
                        : health.isDegraded
                          ? t("share.panel.health.degraded")
                          : t("share.panel.health.streamDropped")}
                    </p>
                  </div>
                </TooltipTrigger>
                {diagnostic && (
                  <TooltipContent className="max-w-64">
                    {t(`share.streamDiagnostic.reasons.${diagnostic.reason}`, {
                      defaultValue: diagnostic.reason.replace(/[_-]+/g, " "),
                    })}
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            {(isOpenForGuests || guestRows.length > 0) && (
              <Section
                className="shrink-0"
                icon={<Users className="size-3.5" />}
                title={t("share.panel.guests.title")}
                count={guestRows.length}
              >
                <ScrollArea className="max-h-[7.5rem]">
                  <ShareGuestList
                    rows={guestRows}
                    nowMs={nowMs}
                    isOpenForGuests={isOpenForGuests}
                  />
                </ScrollArea>
              </Section>
            )}

            <Section
              className="min-h-0 flex-1"
              icon={<Users className="size-3.5" />}
              title={t("share.panel.invite.title")}
              count={invitableCount}
              action={
                friends.length > 6 ? (
                  <span className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-2 size-3 text-faint" />
                    <Input
                      value={inviteQuery}
                      onChange={(event) => setInviteQuery(event.target.value)}
                      placeholder={t("share.panel.invite.search")}
                      className="h-6 w-32 pl-6 text-xs"
                    />
                  </span>
                ) : undefined
              }
            >
              {inviteNote && (
                <p className="shrink-0 px-1 text-xs leading-4 text-faint">
                  {inviteNote}
                </p>
              )}

              {inviteCandidates.length === 0 ? (
                <p className="px-1 py-2 text-xs leading-4 text-faint">
                  {friends.length === 0
                    ? t("share.panel.invite.empty")
                    : t("share.panel.invite.notFound")}
                </p>
              ) : (
                <ScrollArea className="min-h-0 flex-1">
                  <ShareInviteList
                    candidates={inviteCandidates}
                    disabled={!canInvite}
                    onInvite={handleInvite}
                  />
                </ScrollArea>
              )}
            </Section>
          </div>
        </div>

        <div className="grid gap-2 border-t border-border bg-surface-2 px-4 py-3">
          {hint && !showHowTo.includes(stage) && (
            <p className="text-xs leading-4 text-muted-foreground">{hint}</p>
          )}

          {primaryKind === "stop" ? (
            isConfirmingStop ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  className="h-11"
                  disabled={pendingAction !== null}
                  onClick={() => setIsConfirmingStop(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  className="h-11"
                  disabled={pendingAction !== null}
                  onClick={() => void handleStop()}
                >
                  {pendingAction === "stop" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {t("share.panel.stopConfirm")}
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="h-11 w-full"
                disabled={pendingAction !== null}
                onClick={() => {
                  if (guestRows.length > 0) {
                    setIsConfirmingStop(true);
                    return;
                  }
                  void handleStop();
                }}
              >
                {pendingAction === "stop" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Square />
                )}
                {t("share.panel.stop")}
              </Button>
            )
          ) : (
            <Button
              className="h-11 w-full"
              disabled={primaryKind !== "start" || pendingAction !== null}
              onClick={() => void handleStart()}
            >
              {pendingAction === "start" || primaryKind === "busy" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Radio />
              )}
              {primaryKind === "busy"
                ? t("share.panel.starting")
                : t("share.panel.start")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
