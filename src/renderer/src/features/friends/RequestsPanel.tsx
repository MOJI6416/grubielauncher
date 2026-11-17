import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import {
  Award,
  Check,
  Copy,
  Inbox,
  KeyRound,
  Loader2,
  RefreshCw,
  SendHorizontal,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import type { IFriendRequest } from "@/types/IFriend";
import type { IGroupInvite } from "@/types/Voice";
import {
  levelFromPoints,
  resolveAchievementPoints,
} from "@renderer/utilities/achievements";
import { PlatformIcon } from "./PlatformIcon";
import type { FriendLookupProblem } from "./friendLookup";
import { keepPendingIds } from "./pendingIds";
import { useRedact } from "@renderer/features/streamer/streamerMode";

const ANSWER_TIMEOUT_MS = 15000;

interface RequestsPanelProps {
  groupInvites: IGroupInvite[];
  incoming: IFriendRequest[];
  outgoing: IFriendRequest[];
  pendingRequestIds: string[];
  isSignedOut: boolean;
  lookupValue: string;
  lookupProblem: FriendLookupProblem | null;
  isSendingRequest: boolean;
  ownFriendCode?: string;
  friendRequestsEnabled: boolean;
  isLoadingCode: boolean;
  isResettingCode: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onLookupChange: (value: string) => void;
  onSendRequest: () => void;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onAcceptGroupInvite: (inviteId: string) => boolean;
  onDeclineGroupInvite: (inviteId: string) => boolean;
  onCopyCode: () => void;
  onResetCode: () => void;
  onToggleRequests: (enabled: boolean) => void;
  onViewProfile: (userId: string) => void;
  t: TFunction;
}

function Section({
  label,
  keys,
  children,
}: {
  label: string;
  keys: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  if (keys.size === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 px-0.5 text-3xs font-medium tracking-wide text-faint uppercase">
        {label}
        <span className="font-mono tabular-nums">{keys.size}</span>
      </p>
      <RemovalList sourceKeys={keys}>{children}</RemovalList>
    </div>
  );
}

function RequestRow({
  request,
  isPending,
  isRejecting,
  isIncoming,
  onAccept,
  onReject,
  onViewProfile,
  t,
}: {
  request: IFriendRequest;
  isPending: boolean;
  isRejecting: boolean;
  isIncoming: boolean;
  onAccept: () => void;
  onReject: () => void;
  onViewProfile: () => void;
  t: TFunction;
}) {
  const level = levelFromPoints(
    resolveAchievementPoints(
      request.user.achievementPoints,
      request.user.achievements ?? [],
    ),
  );

  return (
    <div className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-row-hover">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onViewProfile}
      >
        <PlayerHead user={request.user} size={36} />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Hint content={request.user.nickname} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-sm font-medium">
                {request.user.nickname}
              </span>
            </Hint>
            <span className="shrink-0 text-faint">
              <PlatformIcon platform={request.user.platform} />
            </span>
            {level >= 2 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-primary/30 px-1 text-3xs leading-4 font-medium text-primary">
                <Award className="size-2.5" />
                {level}
              </span>
            )}
          </span>
          <Hint
            content={
              isIncoming
                ? t("friends.wantsToBeFriend")
                : t("friends.requestSent")
            }
            variant="text"
            truncatedOnly
          >
            <span className="truncate text-2xs leading-4 text-muted-foreground">
              {isIncoming
                ? t("friends.wantsToBeFriend")
                : t("friends.requestSent")}
            </span>
          </Hint>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        {isIncoming && (
          <Hint content={t("friends.acceptRequest")}>
            <Button
              size="icon-sm"
              variant="secondary"
              disabled={isPending}
              aria-label={t("friends.acceptRequest")}
              onClick={onAccept}
            >
              {isPending && !isRejecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check size={18} />
              )}
            </Button>
          </Hint>
        )}
        <Hint
          content={
            isIncoming
              ? t("friends.declineRequest")
              : t("friends.cancelRequest")
          }
        >
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={isPending}
            aria-label={
              isIncoming
                ? t("friends.declineRequest")
                : t("friends.cancelRequest")
            }
            onClick={onReject}
          >
            {isPending && (isRejecting || !isIncoming) ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X size={18} />
            )}
          </Button>
        </Hint>
      </div>
    </div>
  );
}

export function RequestsPanel({
  groupInvites,
  incoming,
  outgoing,
  pendingRequestIds,
  isSignedOut,
  lookupValue,
  lookupProblem,
  isSendingRequest,
  ownFriendCode,
  friendRequestsEnabled,
  isLoadingCode,
  isResettingCode,
  inputRef,
  onLookupChange,
  onSendRequest,
  onAccept,
  onReject,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  onCopyCode,
  onResetCode,
  onToggleRequests,
  onViewProfile,
  t,
}: RequestsPanelProps) {
  const redact = useRedact();
  const fallbackRef = useRef<HTMLInputElement>(null);
  const pending = useMemo(
    () => new Set(pendingRequestIds),
    [pendingRequestIds],
  );
  const [answeredInvites, setAnsweredInvites] = useState<string[]>([]);
  const [declinedInvites, setDeclinedInvites] = useState<string[]>([]);
  const [rejectedRequestIds, setRejectedRequestIds] = useState<string[]>([]);
  const [isResetConfirm, setIsResetConfirm] = useState(false);
  const answered = useMemo(() => new Set(answeredInvites), [answeredInvites]);
  const declined = useMemo(() => new Set(declinedInvites), [declinedInvites]);
  const rejected = useMemo(
    () => new Set(rejectedRequestIds),
    [rejectedRequestIds],
  );
  const total = groupInvites.length + incoming.length + outgoing.length;
  const inviteKeys = useMemo(
    () => new Set(groupInvites.map((invite) => invite._id)),
    [groupInvites],
  );
  const incomingKeys = useMemo(
    () => new Set(incoming.map((request) => request.requestId)),
    [incoming],
  );
  const outgoingKeys = useMemo(
    () => new Set(outgoing.map((request) => request.requestId)),
    [outgoing],
  );

  useEffect(() => {
    if (answeredInvites.length === 0 && declinedInvites.length === 0) return;

    const known = new Set(groupInvites.map((invite) => invite._id));
    setAnsweredInvites((prev) => keepPendingIds(prev, known));
    setDeclinedInvites((prev) => keepPendingIds(prev, known));
  }, [groupInvites]);

  useEffect(() => {
    if (rejectedRequestIds.length === 0) return;

    const active = new Set(pendingRequestIds);
    setRejectedRequestIds((prev) => keepPendingIds(prev, active));
  }, [pendingRequestIds]);

  useEffect(() => {
    if (answeredInvites.length === 0) return;

    const timer = window.setTimeout(() => {
      setAnsweredInvites([]);
      setDeclinedInvites([]);
      toast.warning(t("friends.operationErrors.timeout"));
    }, ANSWER_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [answeredInvites, t]);

  const canSend =
    Boolean(lookupValue.trim()) &&
    !lookupProblem &&
    !isSendingRequest &&
    !isSignedOut;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card p-2">
        {total === 0 ? (
          <Empty className="min-h-0 px-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>{t("friends.noRequests")}</EmptyTitle>
              <EmptyDescription className="text-xs leading-5">
                {t("friends.noRequestsHint")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                size="sm"
                variant="outline"
                onClick={() => (inputRef ?? fallbackRef).current?.focus()}
              >
                <UserPlus className="size-4" />
                {t("friends.addFriend")}
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-4 pr-2">
              <Section label={t("groups.invites")} keys={inviteKeys}>
                {groupInvites.map((invite) => (
                  <RemovalItem key={invite._id} itemKey={invite._id}>
                    <div className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-row-hover">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info/15">
                        <Users className="size-4 text-info" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Hint
                          content={invite.group.name}
                          variant="text"
                          truncatedOnly
                        >
                          <p className="truncate text-sm font-medium">
                            {invite.group.name}
                          </p>
                        </Hint>
                        <Hint
                          content={t("groups.invitedBy", {
                            nickname: invite.inviter.nickname,
                          })}
                          variant="text"
                          truncatedOnly
                        >
                          <p className="truncate text-2xs leading-4 text-muted-foreground">
                            {t("groups.invitedBy", {
                              nickname: invite.inviter.nickname,
                            })}
                          </p>
                        </Hint>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Hint content={t("groups.accept")}>
                          <Button
                            size="icon-sm"
                            variant="secondary"
                            disabled={answered.has(invite._id)}
                            aria-label={t("groups.accept")}
                            onClick={() => {
                              if (!onAcceptGroupInvite(invite._id)) return;
                              setAnsweredInvites((prev) => [
                                ...prev,
                                invite._id,
                              ]);
                            }}
                          >
                            {answered.has(invite._id) &&
                            !declined.has(invite._id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Check size={18} />
                            )}
                          </Button>
                        </Hint>
                        <Hint content={t("groups.decline")}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={answered.has(invite._id)}
                            aria-label={t("groups.decline")}
                            onClick={() => {
                              if (!onDeclineGroupInvite(invite._id)) return;
                              setAnsweredInvites((prev) => [
                                ...prev,
                                invite._id,
                              ]);
                              setDeclinedInvites((prev) => [
                                ...prev,
                                invite._id,
                              ]);
                            }}
                          >
                            {declined.has(invite._id) ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <X size={18} />
                            )}
                          </Button>
                        </Hint>
                      </div>
                    </div>
                  </RemovalItem>
                ))}
              </Section>

              <Section
                label={t("friends.incomingRequests")}
                keys={incomingKeys}
              >
                {incoming.map((request) => (
                  <RemovalItem
                    key={request.requestId}
                    itemKey={request.requestId}
                  >
                    <RequestRow
                      request={request}
                      isIncoming
                      isPending={pending.has(request.requestId)}
                      isRejecting={rejected.has(request.requestId)}
                      onAccept={() => onAccept(request.requestId)}
                      onReject={() => {
                        setRejectedRequestIds((prev) => [
                          ...prev,
                          request.requestId,
                        ]);
                        onReject(request.requestId);
                      }}
                      onViewProfile={() => onViewProfile(request.user._id)}
                      t={t}
                    />
                  </RemovalItem>
                ))}
              </Section>

              <Section
                label={t("friends.outgoingRequests")}
                keys={outgoingKeys}
              >
                {outgoing.map((request) => (
                  <RemovalItem
                    key={request.requestId}
                    itemKey={request.requestId}
                  >
                    <RequestRow
                      request={request}
                      isIncoming={false}
                      isPending={pending.has(request.requestId)}
                      isRejecting={rejected.has(request.requestId)}
                      onAccept={() => onAccept(request.requestId)}
                      onReject={() => onReject(request.requestId)}
                      onViewProfile={() => onViewProfile(request.user._id)}
                      t={t}
                    />
                  </RemovalItem>
                ))}
              </Section>
            </div>
          </ScrollArea>
        )}
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto pr-0.5">
        <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-medium">{t("friends.addFriend")}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {t("friends.addFriendHint")}
          </p>

          <Input
            ref={inputRef ?? fallbackRef}
            value={lookupValue}
            placeholder="ABCD-1234"
            aria-label={t("friends.friendId")}
            className="h-9 font-mono tracking-[0.14em] uppercase"
            onChange={(event) => onLookupChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSend) onSendRequest();
            }}
          />

          {isSignedOut ? (
            <p className="text-2xs leading-4 text-warning">
              {t("friends.sessionLostHint")}
            </p>
          ) : (
            lookupProblem &&
            lookupProblem !== "empty" && (
              <p className="text-2xs leading-4 text-warning">
                {t(`friends.lookupErrors.${lookupProblem}`)}
              </p>
            )
          )}

          <Button disabled={!canSend} onClick={onSendRequest}>
            {isSendingRequest ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SendHorizontal size={18} />
            )}
            {t("friends.sendRequest")}
          </Button>
        </div>

        <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4 text-faint" />
            {t("friends.friendCode")}
          </p>

          <div className="flex h-11 items-center justify-center rounded-lg border border-border bg-surface-1 px-2 text-center">
            {ownFriendCode ? (
              <p className="font-mono text-lg font-semibold tracking-[0.14em] select-all">
                {redact.value(ownFriendCode)}
              </p>
            ) : isLoadingCode ? (
              <Skeleton className="h-5 w-32 rounded" />
            ) : (
              <p className="text-2xs leading-4 text-muted-foreground">
                {t("friends.friendCodeUnavailable")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={!ownFriendCode}
              onClick={onCopyCode}
            >
              <Copy className="size-4" />
              {t("common.copy")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={isResettingCode || !ownFriendCode}
              onClick={() => setIsResetConfirm(true)}
            >
              {isResettingCode ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t("friends.resetFriendCode")}
            </Button>
          </div>

          <div className="flex items-start justify-between gap-3 border-t border-border pt-2">
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {t("friends.friendRequestsEnabledTitle")}
              </p>
              <p className="text-2xs leading-4 text-muted-foreground">
                {t("friends.friendRequestsEnabledDescription")}
              </p>
            </div>
            <Switch
              checked={friendRequestsEnabled}
              disabled={isSignedOut || !ownFriendCode}
              aria-label={t("friends.friendRequestsEnabledTitle")}
              onCheckedChange={(checked) => onToggleRequests(checked === true)}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
          <p className="shrink-0 text-sm font-medium">
            {t("friends.howItWorksTitle")}
          </p>
          <ol className="flex flex-col gap-1.5">
            {[1, 2, 3].map((step) => (
              <li key={step} className="flex items-start gap-2.5">
                <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-3xs font-semibold text-muted-foreground">
                  {step}
                </span>
                <span className="text-2xs leading-4 text-muted-foreground">
                  {t(`friends.howItWorksStep${step}`)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      {isResetConfirm && (
        <Confirmation
          title={t("friends.resetFriendCodeTitle")}
          content={[{ text: t("friends.resetFriendCodeConfirm") }]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsResetConfirm(false),
            },
            {
              text: t("friends.resetFriendCode"),
              color: "danger",
              onClick: () => {
                setIsResetConfirm(false);
                onResetCode();
              },
            },
          ]}
          onClose={() => setIsResetConfirm(false)}
        />
      )}
    </div>
  );
}
