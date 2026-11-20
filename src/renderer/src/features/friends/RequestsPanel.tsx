import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Award, Check, Inbox, Loader2, Users, X } from "lucide-react";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import type { IFriendRequest } from "@/types/IFriend";
import type { IGroupInvite } from "@/types/Voice";
import {
  levelFromPoints,
  resolveAchievementPoints,
} from "@renderer/utilities/achievements";
import { PlatformIcon } from "./PlatformIcon";
import type { MsFriend } from "@/shared/msFriends";
import { MsRequestRow } from "./MsRequests";
import { keepPendingIds } from "./pendingIds";

const ANSWER_TIMEOUT_MS = 15000;

interface RequestsPanelProps {
  groupInvites: IGroupInvite[];
  incoming: IFriendRequest[];
  pendingRequestIds: string[];
  addFriend: ReactNode;
  footer: ReactNode;
  onAccept: (requestId: string) => void;
  onReject: (requestId: string) => void;
  onAcceptGroupInvite: (inviteId: string) => boolean;
  onDeclineGroupInvite: (inviteId: string) => boolean;
  onViewProfile: (userId: string) => void;
  ms?: {
    incoming: MsFriend[];
    pending: string[];
    onAccept: (profileId: string) => void;
    onRemove: (profileId: string) => void;
  };
  t: TFunction;
}

function Section({
  label,
  keys,
  children,
}: {
  label: string;
  keys: ReadonlySet<string>;
  children: ReactNode;
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

export function useInviteAnswers(
  groupInvites: IGroupInvite[],
  onAccept: (inviteId: string) => boolean,
  onDecline: (inviteId: string) => boolean,
  t: TFunction,
) {
  const [answeredInvites, setAnsweredInvites] = useState<string[]>([]);
  const [declinedInvites, setDeclinedInvites] = useState<string[]>([]);
  const answered = useMemo(() => new Set(answeredInvites), [answeredInvites]);
  const declined = useMemo(() => new Set(declinedInvites), [declinedInvites]);

  useEffect(() => {
    if (answeredInvites.length === 0 && declinedInvites.length === 0) return;

    const known = new Set(groupInvites.map((invite) => invite._id));
    setAnsweredInvites((prev) => keepPendingIds(prev, known));
    setDeclinedInvites((prev) => keepPendingIds(prev, known));
  }, [groupInvites]);

  useEffect(() => {
    if (answeredInvites.length === 0) return;

    const timer = window.setTimeout(() => {
      setAnsweredInvites([]);
      setDeclinedInvites([]);
      toast.warning(t("friends.operationErrors.timeout"));
    }, ANSWER_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [answeredInvites, t]);

  return {
    isAnswered: (id: string) => answered.has(id),
    isDeclined: (id: string) => declined.has(id),
    accept: (id: string) => {
      if (!onAccept(id)) return;
      setAnsweredInvites((prev) => [...prev, id]);
    },
    decline: (id: string) => {
      if (!onDecline(id)) return;
      setAnsweredInvites((prev) => [...prev, id]);
      setDeclinedInvites((prev) => [...prev, id]);
    },
  };
}

export type InviteAnswers = ReturnType<typeof useInviteAnswers>;

export function GroupInviteRow({
  invite,
  answers,
  t,
}: {
  invite: IGroupInvite;
  answers: InviteAnswers;
  t: TFunction;
}) {
  const isAnswered = answers.isAnswered(invite._id);
  const isDeclined = answers.isDeclined(invite._id);
  const invitedBy = t("groups.invitedBy", {
    nickname: invite.inviter.nickname,
  });

  return (
    <div className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-row-hover">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-info/15">
        <Users className="size-4 text-info" />
      </span>
      <div className="min-w-0 flex-1">
        <Hint content={invite.group.name} variant="text" truncatedOnly>
          <p className="truncate text-sm font-medium">{invite.group.name}</p>
        </Hint>
        <Hint content={invitedBy} variant="text" truncatedOnly>
          <p className="truncate text-2xs leading-4 text-muted-foreground">
            {invitedBy}
          </p>
        </Hint>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Hint content={t("groups.accept")}>
          <Button
            size="icon-sm"
            variant="secondary"
            disabled={isAnswered}
            aria-label={t("groups.accept")}
            onClick={() => answers.accept(invite._id)}
          >
            {isAnswered && !isDeclined ? (
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
            disabled={isAnswered}
            aria-label={t("groups.decline")}
            onClick={() => answers.decline(invite._id)}
          >
            {isDeclined ? (
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

export function RequestRow({
  request,
  isPending,
  isRejecting,
  onAccept,
  onReject,
  onViewProfile,
  t,
}: {
  request: IFriendRequest;
  isPending: boolean;
  isRejecting: boolean;
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
            content={t("friends.wantsToBeFriend")}
            variant="text"
            truncatedOnly
          >
            <span className="truncate text-2xs leading-4 text-muted-foreground">
              {t("friends.wantsToBeFriend")}
            </span>
          </Hint>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
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
        <Hint content={t("friends.declineRequest")}>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={isPending}
            aria-label={t("friends.declineRequest")}
            onClick={onReject}
          >
            {isPending && isRejecting ? (
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

export function useRejectedRequests(pendingRequestIds: string[]) {
  const [rejectedRequestIds, setRejectedRequestIds] = useState<string[]>([]);
  const rejected = useMemo(
    () => new Set(rejectedRequestIds),
    [rejectedRequestIds],
  );

  useEffect(() => {
    if (rejectedRequestIds.length === 0) return;

    const active = new Set(pendingRequestIds);
    setRejectedRequestIds((prev) => keepPendingIds(prev, active));
  }, [pendingRequestIds]);

  return {
    has: (id: string) => rejected.has(id),
    mark: (id: string) => setRejectedRequestIds((prev) => [...prev, id]),
  };
}

export function RequestsPanel({
  groupInvites,
  incoming,
  pendingRequestIds,
  addFriend,
  footer,
  onAccept,
  onReject,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  onViewProfile,
  ms,
  t,
}: RequestsPanelProps) {
  const pending = useMemo(
    () => new Set(pendingRequestIds),
    [pendingRequestIds],
  );
  const rejected = useRejectedRequests(pendingRequestIds);
  const answers = useInviteAnswers(
    groupInvites,
    onAcceptGroupInvite,
    onDeclineGroupInvite,
    t,
  );
  const msIncoming = ms?.incoming ?? [];
  const msPending = useMemo(() => new Set(ms?.pending ?? []), [ms?.pending]);
  const msIncomingKeys = useMemo(
    () => new Set(msIncoming.map((request) => request.profileId)),
    [msIncoming],
  );
  const total = groupInvites.length + incoming.length + msIncoming.length;
  const inviteKeys = useMemo(
    () => new Set(groupInvites.map((invite) => invite._id)),
    [groupInvites],
  );
  const incomingKeys = useMemo(
    () => new Set(incoming.map((request) => request.requestId)),
    [incoming],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-0 flex-1 flex-col p-2">
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
          <EmptyContent>{addFriend}</EmptyContent>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 pr-2">
            <Section label={t("friends.incomingRequests")} keys={incomingKeys}>
              {incoming.map((request) => (
                <RemovalItem key={request.requestId} itemKey={request.requestId}>
                  <RequestRow
                    request={request}
                    isPending={pending.has(request.requestId)}
                    isRejecting={rejected.has(request.requestId)}
                    onAccept={() => onAccept(request.requestId)}
                    onReject={() => {
                      rejected.mark(request.requestId);
                      onReject(request.requestId);
                    }}
                    onViewProfile={() => onViewProfile(request.user._id)}
                    t={t}
                  />
                </RemovalItem>
              ))}
            </Section>

            <Section label={t("groups.invites")} keys={inviteKeys}>
              {groupInvites.map((invite) => (
                <RemovalItem key={invite._id} itemKey={invite._id}>
                  <GroupInviteRow invite={invite} answers={answers} t={t} />
                </RemovalItem>
              ))}
            </Section>

            <Section
              label={t("friends.microsoft.incoming")}
              keys={msIncomingKeys}
            >
              {msIncoming.map((request) => (
                <RemovalItem key={request.profileId} itemKey={request.profileId}>
                  <MsRequestRow
                    request={request}
                    isIncoming
                    isPending={msPending.has(request.profileId)}
                    onAccept={() => ms?.onAccept(request.profileId)}
                    onReject={() => ms?.onRemove(request.profileId)}
                    t={t}
                  />
                </RemovalItem>
              ))}
            </Section>
          </div>
        </ScrollArea>
      )}
      </div>
      <div className="shrink-0 border-t border-border p-3">{footer}</div>
    </div>
  );
}
