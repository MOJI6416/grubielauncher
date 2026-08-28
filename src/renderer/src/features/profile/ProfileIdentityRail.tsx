import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";
import {
  Copy,
  Fingerprint,
  Heart,
  Loader2,
  MessageSquare,
  Shirt,
  Trophy,
  UserPlus,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { IUser } from "@/types/IUser";
import {
  authDataAtom,
  friendRequestsAtom,
  friendsAtom,
  isFriendsConnectedAtom,
  pendingFriendRequestAtom,
} from "@renderer/stores/atoms";
import {
  AccountHead,
  PlayerHead,
} from "@renderer/features/accounts/AccountHead";
import { navigate } from "@renderer/navigation/navigate";
import {
  levelInfo,
  levelTier,
  resolveAchievementPoints,
} from "@renderer/utilities/achievements";
import { formatDay, formatRelative } from "@renderer/utilities/date";
import { ProfilePrivacy } from "./ProfilePrivacy";
import { ProfileConnections } from "./ProfileConnections";
import { playedHours } from "./profileMetrics";
import { profileRelation } from "./profileRelation";
import { useMutualFriends } from "./useProfileData";
import { copyToClipboard } from "@renderer/utilities/clipboard";

interface PeopleEntry {
  id: string;
  nickname: string;
  platform: IUser["platform"] | null;
  uuid: string | null;
  headUrl: string | null;
}

function peopleEntry(value: unknown): PeopleEntry | null {
  if (!value || typeof value !== "object") return null;

  const user = value as Partial<IUser>;
  if (!user._id || !user.nickname) return null;

  return {
    id: user._id,
    nickname: user.nickname,
    platform: user.platform ?? null,
    uuid: user.uuid ?? null,
    headUrl: null,
  };
}

function ProviderIcon({ platform }: { platform: IUser["platform"] }) {
  if (platform === "microsoft") return <FaMicrosoft className="size-3.5" />;
  if (platform === "elyby") return <TbSquareLetterE className="size-3.5" />;
  if (platform === "discord") return <FaDiscord className="size-3.5" />;
  return null;
}

function StatTile({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint: string;
}) {
  return (
    <Hint content={hint}>
      <div className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-surface-1 px-1">
        <span className="w-full truncate text-center font-mono text-sm tabular-nums text-foreground">
          {value}
        </span>
        <span className="w-full truncate text-center text-[10px] text-faint">
          {label}
        </span>
      </div>
    </Hint>
  );
}

export function ProfileIdentityRail({
  user,
  isOwner,
  unlockedCount,
  totalCount,
  points: pointsOverride,
  rank,
  onShowSkin,
  isSkinBusy,
  canShowSkin,
  accessToken,
}: {
  user: IUser;
  isOwner: boolean;
  unlockedCount: number;
  totalCount: number;
  points?: number;
  rank?: number | null;
  onShowSkin: () => void;
  isSkinBusy: boolean;
  canShowSkin: boolean;
  accessToken?: string;
}) {
  const { t, i18n } = useTranslation();
  const friends = useAtomValue(friendsAtom);
  const requests = useAtomValue(friendRequestsAtom);
  const authData = useAtomValue(authDataAtom);
  const isFriendsConnected = useAtomValue(isFriendsConnectedAtom);
  const setPendingFriendRequest = useSetAtom(pendingFriendRequestAtom);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage || i18n.language).format(value);

  const points =
    pointsOverride ??
    resolveAchievementPoints(user.achievementPoints, user.achievements ?? []);
  const level = levelInfo(points);
  const tier = levelTier(level.level);
  const toNext = Math.max(0, level.levelSpan - level.intoLevel);

  const relation = useMemo(
    () =>
      profileRelation({
        userId: user._id,
        ownId: authData?.sub,
        friendIds: friends.map((friend) => friend.user._id),
        requests: requests.map((request) => ({
          type: request.type,
          userId: request.user?._id ?? "",
        })),
      }),
    [user._id, authData?.sub, friends, requests],
  );

  const friendEntry = useMemo(
    () => friends.find((friend) => friend.user._id === user._id) ?? null,
    [friends, user._id],
  );

  const mutual = useMutualFriends(isOwner ? null : user._id);

  const people = useMemo(() => {
    if (!isOwner) {
      return (mutual.data?.items ?? []).map((entry) => ({
        id: entry.id,
        nickname: entry.nickname,
        platform: entry.platform ?? null,
        uuid: entry.uuid ?? null,
        headUrl: entry.headUrl ?? null,
      }));
    }

    return friends
      .map((friend) => friend.user)
      .filter((entry): entry is IUser => Boolean(entry?._id))
      .map(peopleEntry)
      .filter((entry): entry is PeopleEntry => entry !== null);
  }, [isOwner, mutual.data, friends]);

  const onlineIds = useMemo(
    () =>
      new Set(
        friends
          .filter((friend) => friend.isOnline)
          .map((friend) => friend.user._id),
      ),
    [friends],
  );

  const registered = formatDay(new Date(user.createdAt));
  const lastActive = friendEntry
    ? formatRelative(new Date(friendEntry.user.lastActive))
    : "";

  const copy = async (value: string) => {
    if (!(await copyToClipboard(value))) return;
    toast.success(t("common.copied"));
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="flex shrink-0 flex-col items-center gap-2.5">
        <AccountHead
          account={{
            type: user.platform,
            nickname: user.nickname,
            id: user._id,
            uuid: user.uuid,
          }}
          size={88}
          className={`rounded-xl ring-offset-2 ring-offset-card ${tier.ringClass}`}
        />

        <div className="flex w-full min-w-0 flex-col items-center gap-1">
          <div className="flex w-full min-w-0 items-center justify-center gap-1.5">
            <Hint content={user.nickname} variant="text" truncatedOnly>
              <h2 className="truncate text-lg leading-tight font-semibold">
                {user.nickname}
              </h2>
            </Hint>
            {isOwner ? (
              <Hint content={t("profile.openAccounts")}>
                <button
                  type="button"
                  onClick={() => navigate({ name: "accounts" })}
                  aria-label={t("profile.openAccounts")}
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ProviderIcon platform={user.platform} />
                </button>
              </Hint>
            ) : (
              <Hint content={user.platform} className="capitalize">
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-surface-3 text-muted-foreground"
                  aria-label={user.platform}
                >
                  <ProviderIcon platform={user.platform} />
                </span>
              </Hint>
            )}
            {user.isDonor && (
              <Hint content={t("donor.badge")}>
                <span
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
                  aria-label={t("donor.badge")}
                >
                  <Heart className="size-3.5 fill-primary" />
                </span>
              </Hint>
            )}
          </div>

          {registered && (
            <Hint content={`${t("accountInfo.registered")}: ${registered}`}>
              <p className="max-w-full truncate text-xs text-faint">
                {t("profile.memberSince", { date: registered })}
              </p>
            </Hint>
          )}
        </div>
      </div>

      <div className="grid shrink-0 gap-2 rounded-lg bg-surface-1 p-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-sm font-medium">
            {t("achievements.level")} {level.level}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {t(`achievements.tiers.${tier.key}`)}
          </span>
          {typeof rank === "number" ? (
            <Hint content={t("profile.globalRank")}>
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                <Trophy className="size-3 text-faint" />#{formatNumber(rank)}
              </span>
            </Hint>
          ) : (
            <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
              {formatNumber(level.intoLevel)}/{formatNumber(level.levelSpan)}
            </span>
          )}
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.round(level.ratio * 100)}%` }}
          />
        </div>
        <p className="truncate text-[11px] text-faint">
          {t("profile.pointsToNext", {
            points: formatNumber(toNext),
            level: level.nextLevel,
          })}
        </p>
      </div>

      <div
        className={`grid shrink-0 gap-1.5 ${
          isOwner ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        <StatTile
          value={t("profile.hoursShort", {
            hours: formatNumber(playedHours(user.playTime)),
          })}
          label={t("accountInfo.playTime")}
          hint={t("accountInfo.playTime")}
        />
        <StatTile
          value={`${formatNumber(unlockedCount)}/${formatNumber(totalCount)}`}
          label={t("achievements.title")}
          hint={t("achievements.title")}
        />
        {!isOwner && (
          <StatTile
            value={formatNumber(user.friends?.length ?? 0)}
            label={t("accountInfo.friends")}
            hint={t("accountInfo.friends")}
          />
        )}
      </div>

      {!isOwner && relation === "friend" && (
        <PresenceRow
          isOnline={friendEntry?.isOnline === true}
          activity={friendEntry?.versionName ?? ""}
          lastActive={lastActive}
          registered={registered}
        />
      )}

      <PeopleBlock
        title={isOwner ? t("accountInfo.friends") : t("profile.mutualFriends")}
        empty={
          isOwner
            ? isFriendsConnected
              ? t("friends.noFriends")
              : t("app.backendUnavailable")
            : mutual.isError || (!mutual.isPending && !mutual.data)
              ? t("app.backendUnavailable")
              : t("profile.mutualFriendsEmpty")
        }
        emptyAction={
          isOwner && isFriendsConnected ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate({ name: "people", section: "friends" })}
            >
              <UserPlus />
              <span className="truncate">{t("friends.addFriend")}</span>
            </Button>
          ) : undefined
        }
        entries={people}
        onlineIds={onlineIds}
        isLoading={!isOwner && mutual.isPending && mutual.fetchStatus !== "idle"}
      />

      <div className="mt-auto grid shrink-0 gap-2 border-t border-border pt-3">
        {!isOwner && relation !== "self" && (
          <RelationAction
            relation={relation}
            isConnected={isFriendsConnected}
            userId={user._id}
            onRequest={(id) => {
              setPendingFriendRequest(id);
              navigate({ name: "people", section: "requests" });
            }}
          />
        )}

        {isOwner && (user.friendCode || user.uuid) && (
          <div className="flex min-w-0 items-center gap-1.5">
            {user.friendCode && (
              <Hint content={t("friends.friendCodeDescription")}>
                <button
                  type="button"
                  onClick={() => void copy(user.friendCode ?? "")}
                  className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-1 px-2.5 text-xs transition-colors hover:bg-surface-3"
                >
                  <span className="shrink-0 text-muted-foreground">
                    {t("accounts.friendCode")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono tabular-nums">
                    {user.friendCode}
                  </span>
                  <Copy className="size-3 shrink-0 text-faint" />
                </button>
              </Hint>
            )}
            {user.uuid && (
              <Hint content={`UUID · ${user.uuid}`}>
                <button
                  type="button"
                  aria-label={t("accounts.uuid")}
                  onClick={() => void copy(user.uuid)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                >
                  <Fingerprint className="size-3.5" />
                </button>
              </Hint>
            )}
          </div>
        )}

        <ProfileConnections
          user={user}
          isOwner={isOwner}
          accessToken={accessToken}
        />

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="min-w-0 flex-1"
            disabled={isSkinBusy || !canShowSkin}
            onClick={onShowSkin}
          >
            {isSkinBusy ? <Loader2 className="animate-spin" /> : <Shirt />}
            <span className="truncate">{t("skinView.title")}</span>
          </Button>
          {isOwner && <ProfilePrivacy user={user} />}
        </div>
      </div>
    </aside>
  );
}

function PresenceRow({
  isOnline,
  activity,
  lastActive,
  registered,
}: {
  isOnline: boolean;
  activity: string;
  lastActive: string;
  registered: string;
}) {
  const { t } = useTranslation();

  const online = isOnline;
  const primary = online
    ? activity
      ? t("voiceCall.peerPlaying", { version: activity })
      : t("friends.online")
    : t("friends.offline");
  const secondary = online ? "" : lastActive;

  return (
    <div className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-lg bg-surface-1 px-2.5">
      <span
        className={`size-2 shrink-0 rounded-full ${
          online ? "bg-success" : "bg-muted-foreground/40"
        }`}
      />
      <Hint
        content={
          online ? primary : `${t("accountInfo.registered")}: ${registered}`
        }
        variant="text"
      >
        <span className="min-w-0 flex-1 truncate text-xs">{primary}</span>
      </Hint>
      {secondary && (
        <span className="shrink-0 text-[11px] text-faint">{secondary}</span>
      )}
    </div>
  );
}

function PeopleBlock({
  title,
  empty,
  emptyAction,
  entries,
  onlineIds,
  isLoading,
}: {
  title: string;
  empty: string;
  emptyAction?: React.ReactNode;
  entries: PeopleEntry[];
  onlineIds: ReadonlySet<string>;
  isLoading?: boolean;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-1.5">
      <header className="flex h-5 shrink-0 items-center gap-2">
        <UsersRound className="size-3.5 shrink-0 text-faint" />
        <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {title}
        </h3>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
          {isLoading ? "…" : entries.length}
        </span>
      </header>

      {isLoading ? (
        <div className="flex min-h-9 flex-1 items-center justify-center rounded-lg border border-dashed border-border">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex min-h-9 flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-center">
          <p className="text-[11px] text-muted-foreground">{empty}</p>
          {emptyAction}
        </div>
      ) : (
        <div className="-mr-1 grid min-h-0 flex-1 content-start gap-1 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => navigate({ name: "profile", userId: entry.id })}
              className="flex h-8 min-w-0 shrink-0 items-center gap-2 rounded-lg bg-surface-1 px-1.5 text-left transition-colors hover:bg-surface-3"
            >
              <PlayerHead user={entry} size={20} />
              <span className="min-w-0 flex-1 truncate text-xs">
                {entry.nickname}
              </span>
              {onlineIds.has(entry.id) && (
                <span className="size-1.5 shrink-0 rounded-full bg-success" />
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RelationAction({
  relation,
  isConnected,
  userId,
  onRequest,
}: {
  relation: "friend" | "outgoing" | "incoming" | "none";
  isConnected: boolean;
  userId: string;
  onRequest: (userId: string) => void;
}) {
  const { t } = useTranslation();

  if (relation === "friend") {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="min-w-0"
        onClick={() =>
          navigate({ name: "people", section: "friends", peerId: userId })
        }
      >
        <MessageSquare />
        <span className="truncate">{t("friends.chat")}</span>
      </Button>
    );
  }

  if (relation === "outgoing") {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="min-w-0"
        onClick={() => navigate({ name: "people", section: "requests" })}
      >
        <UserRoundCheck />
        <span className="truncate">{t("friends.requestSent")}</span>
      </Button>
    );
  }

  if (relation === "incoming") {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="min-w-0"
        onClick={() => navigate({ name: "people", section: "requests" })}
      >
        <UserPlus />
        <span className="truncate">{t("friends.requests")}</span>
      </Button>
    );
  }

  return (
    <Hint content={isConnected ? undefined : t("app.backendUnavailable")}>
      <Button
        variant="secondary"
        size="lg"
        className="min-w-0"
        disabled={!isConnected}
        onClick={() => onRequest(userId)}
      >
        <UserPlus />
        <span className="truncate">{t("friends.addFriend")}</span>
      </Button>
    </Hint>
  );
}
