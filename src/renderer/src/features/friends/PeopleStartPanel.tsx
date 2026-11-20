import { useMemo, type ReactNode } from "react";
import type { TFunction } from "i18next";
import {
  ChevronRight,
  CircleAlert,
  Globe,
  Headphones,
  Inbox,
  MapPin,
  Play,
  PlugZap,
  RotateCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import type { IFriendRequest } from "@/types/IFriend";
import type { IGroupInvite } from "@/types/Voice";
import type { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { maskValue } from "@renderer/features/streamer/redact";
import type { GroupListEntry } from "@renderer/features/voice/groupList";
import { VoiceRoomCard } from "@renderer/features/voice/VoiceRooms";
import { FriendCodeLine, type FriendCodeState } from "./AddFriend";
import type { FriendEntry } from "./friendsList";
import { formatBadge, freshRequests, friendPlaces, type FriendPlace } from "./peopleHub";
import { canJoinFriend, joinBlockReason } from "./presence";
import {
  GroupInviteRow,
  RequestRow,
  useInviteAnswers,
  useRejectedRequests,
} from "./RequestsPanel";
import { FriendHeads } from "./ServerFriends";

const FRESH_LIMIT = 3;

interface PeopleStartPanelProps {
  entries: FriendEntry[];
  hasFriends: boolean;
  isSignedOut: boolean;
  isLoading: boolean;
  listError?: string | null;
  onReloadFriends: () => void;
  onSignIn: () => void;
  isGameRunning: boolean;
  versionsByShareCode: Map<string, Version>;
  voiceRooms: GroupListEntry[];
  incoming: IFriendRequest[];
  groupInvites: IGroupInvite[];
  pendingRequestIds: string[];
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onAcceptGroupInvite: (inviteId: string) => boolean;
  onDeclineGroupInvite: (inviteId: string) => boolean;
  onViewProfile: (userId: string) => void;
  onJoin: (friendId: string) => void;
  onOpenRequests: () => void;
  addFriend: ReactNode;
  code: FriendCodeState;
  t: TFunction;
}

function SectionTitle({
  icon,
  label,
  count,
  action,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 px-0.5">
      <span className="text-faint">{icon}</span>
      <p className="text-3xs font-medium tracking-wide text-faint uppercase">
        {label}
      </p>
      <span className="font-mono text-3xs tabular-nums text-faint">
        {count}
      </span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function PlaceCard({
  place,
  isGameRunning,
  versionsByShareCode,
  onJoin,
  t,
}: {
  place: FriendPlace;
  isGameRunning: boolean;
  versionsByShareCode: Map<string, Version>;
  onJoin: (friendId: string) => void;
  t: TFunction;
}) {
  const redact = useRedact();
  const { lead } = place;
  const presence = lead.presence;
  const versionName = presence.versionName || t("friends.hub.theirBuild");
  const blocked = joinBlockReason(presence, isGameRunning);
  const canJoin = canJoinFriend(presence, isGameRunning);
  const installed = presence.joinVersionCode
    ? versionsByShareCode.get(presence.joinVersionCode)
    : undefined;
  const title =
    place.kind === "server"
      ? redact.active
        ? maskValue(place.address)
        : place.address
      : t("friends.hub.worldOf", { nickname: place.hostNickname });
  const need = blocked
    ? place.kind === "server" && blocked !== "singleplayer"
      ? t(`friends.here.${blocked}`)
      : t(`friends.joinReason.${blocked}`)
    : installed
      ? t("friends.hub.ready", { name: installed.version.name })
      : t("friends.hub.download", { name: versionName });

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted-foreground">
          {place.kind === "server" ? (
            <Globe className="size-4" />
          ) : (
            <MapPin className="size-4" />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <Hint content={title} variant="text" truncatedOnly>
            <span
              className={cn(
                "min-w-0 truncate text-sm font-medium",
                place.kind === "server" && "font-mono text-xs",
              )}
            >
              {title}
            </span>
          </Hint>
          <Hint content={versionName} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-2xs leading-4 text-muted-foreground">
              {versionName}
            </span>
          </Hint>
        </span>
        <FriendHeads friends={place.entries.map((entry) => entry.friend)} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <Hint content={need} variant="text" truncatedOnly>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-2xs leading-4",
              blocked ? "text-faint" : "text-muted-foreground",
            )}
          >
            {need}
          </span>
        </Hint>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-2xs"
          disabled={!canJoin}
          onClick={() => onJoin(lead.friend.user._id)}
        >
          <Play className="size-3" />
          {t("friends.joinFlow.playAction")}
        </Button>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28 rounded" />
          <Skeleton className="h-2.5 w-20 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-2.5 w-36 rounded" />
        <Skeleton className="h-7 w-16 rounded-md" />
      </div>
    </div>
  );
}

export function PeopleStartPanel({
  entries,
  hasFriends,
  isSignedOut,
  isLoading,
  listError,
  onReloadFriends,
  onSignIn,
  isGameRunning,
  versionsByShareCode,
  voiceRooms,
  incoming,
  groupInvites,
  pendingRequestIds,
  onAcceptRequest,
  onRejectRequest,
  onAcceptGroupInvite,
  onDeclineGroupInvite,
  onViewProfile,
  onJoin,
  onOpenRequests,
  addFriend,
  code,
  t,
}: PeopleStartPanelProps) {
  const places = useMemo(() => friendPlaces(entries), [entries]);
  const fresh = useMemo(
    () => freshRequests(incoming, groupInvites, FRESH_LIMIT),
    [incoming, groupInvites],
  );
  const freshKeys = useMemo(
    () => new Set(fresh.items.map((item) => item.key)),
    [fresh.items],
  );
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
  const hasActivity =
    places.length > 0 || voiceRooms.length > 0 || fresh.total > 0;
  const reasonOf = (errorCode: string) => {
    const key = `friends.operationErrors.${errorCode}`;
    const text = t(key);
    return text === key ? t("friends.operationErrors.unknown") : text;
  };

  if (isSignedOut && !hasFriends) {
    return (
      <Empty className="min-h-0 overflow-hidden rounded-xl border border-solid border-border bg-card px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-warning">
            <PlugZap />
          </EmptyMedia>
          <EmptyTitle>{t("friends.sessionLost")}</EmptyTitle>
          <EmptyDescription className="text-xs leading-5">
            {t("friends.sessionLostHint")}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onSignIn}>{t("accounts.signIn")}</Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (listError && !hasFriends) {
    return (
      <Empty className="min-h-0 overflow-hidden rounded-xl border border-solid border-border bg-card px-8">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-warning">
            <CircleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("friends.listLoadError")}</EmptyTitle>
          <EmptyDescription className="text-xs leading-5">
            {reasonOf(listError)}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onReloadFriends}>
            <RotateCw className="size-4" />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const codeLine = (
    <FriendCodeLine code={code} isSignedOut={isSignedOut} t={t} />
  );

  if (!isLoading && !hasFriends && fresh.total === 0) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        <Empty className="min-h-0 px-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>{t("friends.noFriends")}</EmptyTitle>
            <EmptyDescription className="text-xs leading-5">
              {t("friends.noFriendsHint")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{addFriend}</EmptyContent>
        </Empty>
        <div className="shrink-0 border-t border-border p-3">{codeLine}</div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-3">
        {isLoading && !hasActivity ? (
          <div aria-busy className="flex shrink-0 flex-col gap-1.5">
            <Skeleton className="h-2.5 w-28 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <CardSkeleton key={index} />
              ))}
            </div>
          </div>
        ) : !hasActivity ? (
          <Empty className="min-h-0 flex-1 px-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>{t("friends.hub.quietTitle")}</EmptyTitle>
              <EmptyDescription className="text-xs leading-5">
                {t("friends.hub.quietHint")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {places.length > 0 && (
              <div className="flex shrink-0 flex-col gap-1.5">
                <SectionTitle
                  icon={<Globe className="size-3" />}
                  label={t("friends.hub.places")}
                  count={places.length}
                />
                <div className="grid grid-cols-2 gap-2">
                  {places.map((place) => (
                    <PlaceCard
                      key={place.key}
                      place={place}
                      isGameRunning={isGameRunning}
                      versionsByShareCode={versionsByShareCode}
                      onJoin={onJoin}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}

            <div
              className={cn(
                "grid shrink-0 gap-3",
                voiceRooms.length > 0 && fresh.total > 0 && "grid-cols-2",
              )}
            >
            {voiceRooms.length > 0 && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <SectionTitle
                  icon={<Headphones className="size-3" />}
                  label={t("friends.hub.voice")}
                  count={voiceRooms.length}
                />
                <div
                  className={cn(
                    "grid gap-2",
                    fresh.total === 0 && "grid-cols-2",
                  )}
                >
                  {voiceRooms.map((entry) => (
                    <VoiceRoomCard key={entry.group._id} entry={entry} t={t} />
                  ))}
                </div>
              </div>
            )}

            {fresh.total > 0 && (
              <div className="flex min-w-0 flex-col gap-1">
                <SectionTitle
                  icon={<Inbox className="size-3" />}
                  label={t("friends.hub.requests")}
                  count={fresh.total}
                  action={
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={onOpenRequests}
                    >
                      {fresh.total > FRESH_LIMIT
                        ? t("friends.hub.allRequests", {
                            value: formatBadge(fresh.total),
                          })
                        : t("friends.hub.openRequests")}
                      <ChevronRight className="size-3" />
                    </Button>
                  }
                />
                <RemovalList sourceKeys={freshKeys}>
                  {fresh.items.map((item) => (
                    <RemovalItem key={item.key} itemKey={item.key}>
                      {item.kind === "group" ? (
                        <GroupInviteRow
                          invite={item.invite}
                          answers={answers}
                          t={t}
                        />
                      ) : (
                        <RequestRow
                          request={item.request}
                          isPending={pending.has(item.request.requestId)}
                          isRejecting={rejected.has(item.request.requestId)}
                          onAccept={() =>
                            onAcceptRequest(item.request.requestId)
                          }
                          onReject={() => {
                            rejected.mark(item.request.requestId);
                            onRejectRequest(item.request.requestId);
                          }}
                          onViewProfile={() =>
                            onViewProfile(item.request.user._id)
                          }
                          t={t}
                        />
                      )}
                    </RemovalItem>
                  ))}
                </RemovalList>
              </div>
            )}
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">{codeLine}</div>
    </section>
  );
}
