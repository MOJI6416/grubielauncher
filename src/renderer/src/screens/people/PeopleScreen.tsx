import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Inbox, Loader2, MessagesSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ILocalFriend } from "@/types/ILocalFriend";
import type { IModpack } from "@/types/Backend";
import type { ISkinData } from "@/types/Skin";
import type { Version } from "@renderer/classes/Version";
import type {
  JoinFriendWorldParams,
  RunGameParams,
} from "@renderer/features/launch/types";
import {
  accountAtom,
  accountsAtom,
  activeFriendSharesAtom,
  authDataAtom,
  friendSocketAtom,
  groupInvitesAtom,
  groupsAtom,
  isFriendsConnectedAtom,
  isRunningAtom,
  isShareModalOpenAtom,
  localFriendsAtom,
  openGroupChatIdAtom,
  ownPresenceAtom,
  pendingFriendChatAtom,
  pendingFriendRequestAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  versionsAtom,
  voiceCallAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";
import type { PeopleSection } from "@renderer/navigation/routes";
import {
  accountIdentity,
  isSameAccount,
} from "@renderer/features/accounts/identity";
import { openNewInstance } from "@renderer/features/instances/newInstance";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { refreshActiveFriendShares } from "@renderer/utilities/friendShares";
import { reportGroupJoinFailure } from "@renderer/utilities/groupJoin";
import { loadGroups } from "@renderer/features/friends/groups";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import { LazyDialogFallback } from "@renderer/components/LazyDialogFallback";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { VoiceCallBar } from "@renderer/components/Voice/VoiceCallBar";
import { GroupsTab } from "@renderer/components/Voice/GroupsTab";
import { ConversationPanel } from "@renderer/features/friends/ConversationPanel";
import { FriendsListPanel } from "@renderer/features/friends/FriendsListPanel";
import { PeopleStartPanel } from "@renderer/features/friends/PeopleStartPanel";
import { RequestsPanel } from "@renderer/features/friends/RequestsPanel";
import {
  describePresence,
  describeRowDetail,
} from "@renderer/features/friends/FriendRow";
import { peopleLinkState } from "@renderer/features/friends/connectionState";
import {
  buildFriendList,
  recentChats,
  type FriendFilter,
  type FriendSort,
} from "@renderer/features/friends/friendsList";
import {
  loadPeoplePrefs,
  savePeoplePrefs,
} from "@renderer/features/friends/peoplePrefs";
import {
  normalizeFriendLookup,
  validateFriendLookup,
} from "@renderer/features/friends/friendLookup";
import { sortRequests } from "@renderer/features/friends/friendUpdates";
import { toggleMutedFriend } from "@renderer/features/friends/muteFriend";
import { useVoicePing } from "@renderer/features/voice/useVoicePing";
import { useFriendCode } from "@renderer/features/friends/useFriendCode";
import { useFriendsRealtime } from "@renderer/features/friends/useFriendsRealtime";
import { useGameInvite } from "@renderer/features/friends/useGameInvite";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;

const LazySkinView = lazyWithPreload(() =>
  import("@renderer/components/SkinView").then((module) => ({
    default: module.SkinView,
  })),
);

const LazyGroupChat = lazyWithPreload(() =>
  import("@renderer/components/Voice/GroupChatModal").then((module) => ({
    default: module.GroupChatModal,
  })),
);

export function PeopleScreen({
  runGame,
  joinFriendWorld,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  joinFriendWorld: (params: JoinFriendWorldParams) => Promise<void>;
}) {
  const { t } = useTranslation();

  const route = useAtomValue(currentRouteAtom);
  const account = useAtomValue(accountAtom);
  const accounts = useAtomValue(accountsAtom);
  const authData = useAtomValue(authDataAtom);
  const versions = useAtomValue(versionsAtom);
  const isRunning = useAtomValue(isRunningAtom);
  const socket = useAtomValue(friendSocketAtom);
  const isConnected = useAtomValue(isFriendsConnectedAtom);
  const activeShares = useAtomValue(activeFriendSharesAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const shareState = useAtomValue(shareStateAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const groups = useAtomValue(groupsAtom);
  const groupInvites = useAtomValue(groupInvitesAtom);
  const voiceCall = useAtomValue(voiceCallAtom);
  const voiceSession = useAtomValue(voiceSessionMetaAtom);

  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom);
  const [openGroupChatId, setOpenGroupChatId] = useAtom(openGroupChatIdAtom);
  const [pendingFriendChat, setPendingFriendChat] = useAtom(
    pendingFriendChatAtom,
  );
  const [pendingFriendRequest, setPendingFriendRequest] = useAtom(
    pendingFriendRequestAtom,
  );
  const setSelectedFriend = useSetAtom(selectedFriendAtom);
  const setSelectedVersion = useSetAtom(selectedVersionAtom);
  const setIsShareModalOpen = useSetAtom(isShareModalOpenAtom);

  const section: PeopleSection =
    route.name === "people" ? (route.section ?? "friends") : "friends";
  const routePeerId = route.name === "people" ? route.peerId : undefined;

  const [prefs, setPrefs] = useState(loadPeoplePrefs);
  const [query, setQuery] = useState("");
  const [lookupValue, setLookupValue] = useState("");
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [skinView, setSkinView] = useState<{
    nickname: string;
    data: ISkinData;
  } | null>(null);

  const lookupInputRef = useRef<HTMLInputElement>(null);
  const queuedRequestRef = useRef<string[]>([]);
  const unreadAtOpenRef = useRef<{ id?: string; count: number }>({ count: 0 });

  const accountKey = account ? accountIdentity(account) : "";

  const realtime = useFriendsRealtime({
    socket,
    accountKey,
    ownUserId: authData?.sub,
    openFriendId: routePeerId,
  });

  const {
    friends,
    requests,
    unread,
    previews,
    typingIds,
    markRead,
    sendFriendRequest,
  } = realtime;

  const voicePing = useVoicePing(socket);

  const friendCode = useFriendCode(account?.accessToken, authData ?? undefined);

  const gameInvite = useGameInvite({
    socket,
    ownPresence,
    shareState,
    canManageShare: canCurrentAccountManageShare(shareOwnerAccountKey, account),
  });

  useEffect(() => {
    return schedulePreload([LazySkinView.preload, LazyGroupChat.preload], 900);
  }, []);

  useEffect(() => {
    if (!account?.accessToken) return;
    void refreshActiveFriendShares();
  }, [account?.accessToken]);

  const sharesByHost = useMemo(
    () => new Map(activeShares.map((share) => [share.hostUserId, share])),
    [activeShares],
  );

  const mutedIds = useMemo(
    () =>
      new Set(
        localFriends.filter((entry) => entry.isMuted).map((entry) => entry.id),
      ),
    [localFriends],
  );

  const list = useMemo(
    () =>
      buildFriendList({
        friends,
        shares: sharesByHost,
        unread,
        muted: mutedIds,
        previews,
        typing: typingIds,
        query,
        filter: prefs.filter,
        sort: prefs.sort,
      }),
    [
      friends,
      sharesByHost,
      unread,
      mutedIds,
      previews,
      typingIds,
      query,
      prefs.filter,
      prefs.sort,
    ],
  );

  const fullList = useMemo(
    () =>
      buildFriendList({
        friends,
        shares: sharesByHost,
        unread,
        muted: mutedIds,
        previews,
        typing: typingIds,
        query: "",
        filter: "all",
        sort: "activity",
      }),
    [friends, sharesByHost, unread, mutedIds, previews, typingIds],
  );

  const entryById = useMemo(
    () =>
      new Map(fullList.entries.map((entry) => [entry.friend.user._id, entry])),
    [fullList.entries],
  );

  const activeEntry = routePeerId ? entryById.get(routePeerId) : undefined;

  const playingEntries = useMemo(
    () => fullList.entries.filter((entry) => entry.presence.kind === "playing"),
    [fullList.entries],
  );

  const chatEntries = useMemo(
    () => recentChats(fullList.entries, 8),
    [fullList.entries],
  );

  const { incoming, outgoing } = useMemo(
    () => sortRequests(requests),
    [requests],
  );

  const versionsByShareCode = useMemo(() => {
    const map = new Map<string, Version>();
    for (const version of versions) {
      const code = version.version.shareCode;
      if (code) map.set(code, version);
    }
    return map;
  }, [versions]);

  const shareableVersions = useMemo(
    () => versions.filter((version) => version.version.shareCode),
    [versions],
  );

  useEffect(() => {
    setSelectedFriend(routePeerId ?? "");

    return () => setSelectedFriend("");
  }, [routePeerId, setSelectedFriend]);

  if (unreadAtOpenRef.current.id !== routePeerId) {
    unreadAtOpenRef.current = {
      id: routePeerId,
      count: routePeerId ? unread[routePeerId] || 0 : 0,
    };
  }

  const goToSection = useCallback((next: PeopleSection, peerId?: string) => {
    navigate({ name: "people", section: next, peerId });
  }, []);

  const openConversation = useCallback(
    (friendId: string) => {
      unreadAtOpenRef.current = { id: friendId, count: unread[friendId] || 0 };
      markRead(friendId);
      setOpenGroupChatId(null);
      goToSection("friends", friendId);
    },
    [goToSection, markRead, setOpenGroupChatId, unread],
  );

  useEffect(() => {
    if (!pendingFriendChat) return;
    if (!friends.some((friend) => friend.user._id === pendingFriendChat))
      return;

    openConversation(pendingFriendChat);
    setPendingFriendChat(null);
  }, [friends, openConversation, pendingFriendChat, setPendingFriendChat]);

  useEffect(() => {
    if (!pendingFriendRequest || !socket) return;

    if (!isConnected) {
      if (queuedRequestRef.current.includes(pendingFriendRequest)) return;
      queuedRequestRef.current = [
        ...queuedRequestRef.current,
        pendingFriendRequest,
      ];
      goToSection("requests");
      toast.warning(t("friends.requestQueued"));
      return;
    }

    const queued = queuedRequestRef.current.filter(
      (id) => id !== pendingFriendRequest,
    );
    if (!sendFriendRequest(pendingFriendRequest)) return;

    queuedRequestRef.current = [];
    for (const id of queued) sendFriendRequest(id);

    setPendingFriendRequest(null);
    goToSection("requests");
  }, [
    goToSection,
    isConnected,
    pendingFriendRequest,
    sendFriendRequest,
    setPendingFriendRequest,
    socket,
    t,
  ]);

  const saveLocalFriends = useCallback(
    async (next: ILocalFriend[]) => {
      if (!account) return false;

      const previous = localFriends;
      setLocalFriends(next);

      try {
        const conf = await api.accounts.load();
        if (!conf) throw new Error("accounts:load returned nothing");

        const nextAccounts = accounts.map((entry) =>
          isSameAccount(entry, account) ? { ...entry, friends: next } : entry,
        );

        const saved = await api.accounts.save(
          nextAccounts,
          conf.lastPlayed ?? null,
        );
        if (!saved) throw new Error("accounts:save returned false");

        return true;
      } catch (error) {
        setLocalFriends(previous);
        showFailureToast(t("friends.muteSaveError"), error, {
          channels: ["accounts:"],
        });
        return false;
      }
    },
    [account, accounts, localFriends, setLocalFriends, t],
  );

  const handleInvite = useCallback(
    (friendId: string) => {
      if (!entryById.has(friendId)) return;
      gameInvite.invite(friendId);
    },
    [entryById, gameInvite],
  );

  const handleJoin = useCallback(
    (friendId: string) => {
      const entry = entryById.get(friendId);
      if (!entry?.friend.isOnline) return;

      const versionCode = entry.presence.joinVersionCode;
      if (!versionCode) {
        toast.warning(t("friends.friendBuildNotPublished"));
        return;
      }

      void joinFriendWorld({
        versionCode,
        hostNickname: entry.friend.user.nickname,
        slug: entry.share?.slug,
        address: entry.friend.serverAddress || undefined,
      });
    },
    [entryById, joinFriendWorld, t],
  );

  const { warnIfOffline } = realtime;

  const handleStartCall = useCallback(
    (friendId: string) => {
      if (!socket || warnIfOffline()) return;
      socket.emit("voiceCallRequest", { recipientId: friendId });
    },
    [socket, warnIfOffline],
  );

  const handleViewProfile = useCallback((userId: string) => {
    navigate({ name: "profile", userId });
  }, []);

  const handleViewSkin = useCallback(
    async (friendId: string) => {
      const entry = entryById.get(friendId);
      if (!entry) return;

      const { user } = entry.friend;
      if (user.platform === "microsoft" && !user.uuid) {
        toast.error(t("skinView.error"));
        return;
      }

      try {
        const data = await api.skin.get(
          user.platform,
          user.uuid,
          user.nickname,
          user.platform === "discord" ? account?.accessToken : undefined,
        );

        if (!data) {
          showFailureToast(t("skinView.error"), undefined, {
            channels: ["skin:get", "skins:"],
          });
          return;
        }

        setSkinView({ nickname: user.nickname, data });
      } catch (error) {
        showFailureToast(t("skinView.error"), error, {
          channels: ["skin:get", "skins:"],
        });
      }
    },
    [account?.accessToken, entryById, t],
  );

  const handleToggleMute = useCallback(
    async (friendId: string) => {
      const { next, isMuted } = toggleMutedFriend(localFriends, friendId);
      const saved = await saveLocalFriends(next);
      if (!saved) return;

      toast.success(
        isMuted
          ? t("friends.notificationDisabled")
          : t("friends.notificationEnabled"),
      );
    },
    [localFriends, saveLocalFriends, t],
  );

  const handleCopyNickname = useCallback(
    async (friendId: string) => {
      const entry = entryById.get(friendId);
      if (!entry) return;

      if (!(await copyToClipboard(entry.friend.user.nickname))) return;
      toast(t("common.copied"));
    },
    [entryById, t],
  );

  const handleInviteToVoice = useCallback(
    (friendId: string) => {
      if (!socket || voiceSession.state !== "connected") return;

      const group = groups.find((item) => item._id === voiceSession.roomId);
      if (!group) return;
      if (warnIfOffline()) return;

      if ((group.members ?? []).some((member) => member._id === friendId)) {
        voicePing.ping(friendId, group._id);
        return;
      }

      socket.emit("groupInvite", { recipientId: friendId, groupId: group._id });
    },
    [
      groups,
      socket,
      voicePing,
      voiceSession.roomId,
      voiceSession.state,
      warnIfOffline,
    ],
  );

  const lookupProblem = useMemo(
    () =>
      validateFriendLookup(lookupValue, {
        ownUserId: authData?.sub,
        ownFriendCode: friendCode.code,
        friends: friends.map((friend) => ({
          id: friend.user._id,
          friendCode: friend.user.friendCode,
        })),
        requests: requests.map((request) => ({
          id: request.user._id,
          friendCode: request.user.friendCode,
        })),
      }),
    [authData?.sub, friendCode.code, friends, lookupValue, requests],
  );

  const handleSendRequest = useCallback(() => {
    const normalized = normalizeFriendLookup(lookupValue);
    if (!normalized || lookupProblem) return;

    realtime.sendFriendRequest(normalized);
  }, [lookupProblem, lookupValue, realtime]);

  useEffect(() => {
    if (realtime.sentRequests === 0) return;
    setLookupValue("");
  }, [realtime.sentRequests]);

  const handleAddFriend = useCallback(() => {
    goToSection("requests");
    window.setTimeout(() => lookupInputRef.current?.focus(), 120);
  }, [goToSection]);

  const handlePlayModpack = useCallback(
    async (modpack: IModpack, version?: Version) => {
      if (version) {
        setSelectedVersion(version);
        await runGame({ version });
        return;
      }

      openNewInstance({ modpack });
    },
    [runGame, setSelectedVersion],
  );

  const handleAcceptChatGroupInvite = useCallback(
    async (code: string) => {
      const token = account?.accessToken;
      if (!token) return;

      const joined = await api.backend.groupJoinByCode(token, code);
      if (!joined || typeof joined === "string") {
        reportGroupJoinFailure(joined ?? null, t);
        return;
      }

      void loadGroups();
      toast.success(t("groups.joined", { group: joined.name }));
    },
    [account?.accessToken, t],
  );

  const updatePrefs = useCallback(
    (patch: { filter?: FriendFilter; sort?: FriendSort }) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        savePeoplePrefs(next);
        return next;
      });
    },
    [],
  );

  const setFilter = useCallback(
    (filter: FriendFilter) => updatePrefs({ filter }),
    [updatePrefs],
  );

  const setSort = useCallback(
    (sort: FriendSort) => updatePrefs({ sort }),
    [updatePrefs],
  );

  const openSkinView = useCallback(
    (friendId: string) => void handleViewSkin(friendId),
    [handleViewSkin],
  );

  const removeTarget = removeTargetId
    ? entryById.get(removeTargetId)
    : undefined;
  const chatGroup = openGroupChatId
    ? groups.find((group) => group._id === openGroupChatId)
    : undefined;

  const linkState = peopleLinkState({
    hasSocket: Boolean(socket),
    isConnected,
  });

  const requestsBadge = incoming.length + groupInvites.length;

  const tabs: Array<{ id: PeopleSection; label: string; badge?: number }> = [
    { id: "friends", label: t("friends.title") },
    { id: "groups", label: t("groups.tab") },
    { id: "requests", label: t("friends.requests"), badge: requestsBadge },
  ];

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex h-9 shrink-0 items-center gap-2">
          <div className="flex h-9 items-center gap-0.5 rounded-lg bg-surface-1 p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-current={section === tab.id}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
                  section === tab.id
                    ? "bg-surface-3 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => goToSection(tab.id)}
              >
                {tab.id === "friends" && <Users className="size-3.5" />}
                {tab.id === "groups" && <MessagesSquare className="size-3.5" />}
                {tab.id === "requests" && <Inbox className="size-3.5" />}
                {tab.label}
                {tab.badge ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-soft-raised px-1 font-mono text-[10px] leading-none tabular-nums text-primary">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs">
            <span
              className={cn(
                "size-1.5 rounded-full",
                linkState === "online"
                  ? "bg-success"
                  : linkState === "connecting"
                    ? "bg-warning"
                    : "bg-destructive",
              )}
            />
            <span className="text-muted-foreground">
              {linkState === "online"
                ? t("friends.online")
                : linkState === "connecting"
                  ? t("friends.connecting")
                  : t("friends.sessionLost")}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-3">
          {section === "requests" ? (
            <RequestsPanel
              groupInvites={groupInvites}
              incoming={incoming}
              outgoing={outgoing}
              pendingRequestIds={realtime.pendingRequestIds}
              isSignedOut={linkState === "signedOut"}
              lookupValue={lookupValue}
              lookupProblem={lookupProblem}
              isSendingRequest={realtime.isSendingRequest}
              ownFriendCode={friendCode.code}
              friendRequestsEnabled={friendCode.isEnabled}
              isLoadingCode={friendCode.isLoading}
              isResettingCode={friendCode.isResetting}
              inputRef={lookupInputRef}
              onLookupChange={setLookupValue}
              onSendRequest={handleSendRequest}
              onAccept={realtime.acceptRequest}
              onReject={realtime.rejectRequest}
              onAcceptGroupInvite={realtime.acceptGroupInvite}
              onDeclineGroupInvite={realtime.declineGroupInvite}
              onCopyCode={friendCode.copy}
              onResetCode={friendCode.reset}
              onToggleRequests={friendCode.setRequestsEnabled}
              onViewProfile={handleViewProfile}
              t={t}
            />
          ) : section === "groups" ? (
            <>
              <div className="flex h-full min-h-0 w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card p-2">
                <GroupsTab />
              </div>

              {chatGroup ? (
                <Suspense
                  fallback={
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-border bg-card">
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <LazyGroupChat
                    group={chatGroup}
                    onPlayModpack={handlePlayModpack}
                    onClose={() => setOpenGroupChatId(null)}
                  />
                </Suspense>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-8 text-center">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                    <Users className="size-4 text-muted-foreground" />
                  </span>
                  <p className="text-sm font-medium">
                    {t("friends.pickGroup")}
                  </p>
                  <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                    {t("friends.pickGroupHint")}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {(friends.length > 0 || realtime.isInitialLoading) && (
                <FriendsListPanel
                  list={list}
                  query={query}
                  filter={prefs.filter}
                  sort={prefs.sort}
                  isLoading={realtime.isInitialLoading && friends.length === 0}
                  activeFriendId={routePeerId}
                  isGameRunning={isRunning}
                  isCallBusy={voiceCall.status !== "idle"}
                  ownUserId={authData?.sub}
                  voiceRoomId={
                    voiceSession.state !== "disconnected"
                      ? voiceSession.roomId
                      : undefined
                  }
                  onQueryChange={setQuery}
                  onFilterChange={setFilter}
                  onSortChange={setSort}
                  onAddFriend={handleAddFriend}
                  onOpenChat={openConversation}
                  onJoin={handleJoin}
                  onInvite={handleInvite}
                  onStartCall={handleStartCall}
                  onInviteToVoice={
                    voiceSession.state === "connected"
                      ? handleInviteToVoice
                      : undefined
                  }
                  onViewProfile={handleViewProfile}
                  onViewSkin={openSkinView}
                  onToggleMute={(id) => void handleToggleMute(id)}
                  onCopyNickname={handleCopyNickname}
                  onRemove={setRemoveTargetId}
                  t={t}
                />
              )}

              {activeEntry ? (
                <ConversationPanel
                  key={activeEntry.friend.user._id}
                  entry={activeEntry}
                  socket={socket}
                  account={account ?? undefined}
                  ownUserId={authData?.sub}
                  isConnected={isConnected}
                  isGameRunning={isRunning}
                  isCallBusy={voiceCall.status !== "idle"}
                  voiceRoomId={
                    voiceSession.state !== "disconnected"
                      ? voiceSession.roomId
                      : undefined
                  }
                  unreadAtOpen={unreadAtOpenRef.current.count}
                  groups={groups}
                  shareableVersions={shareableVersions}
                  versionsByShareCode={versionsByShareCode}
                  presenceText={describePresence(activeEntry, t)}
                  isPeerTyping={typingIds.has(activeEntry.friend.user._id)}
                  onTyping={realtime.notifyTyping}
                  onStopTyping={realtime.notifyStopTyping}
                  onJoin={() => handleJoin(activeEntry.friend.user._id)}
                  onInvite={() => handleInvite(activeEntry.friend.user._id)}
                  onStartCall={() =>
                    handleStartCall(activeEntry.friend.user._id)
                  }
                  onViewProfile={() =>
                    handleViewProfile(activeEntry.friend.user._id)
                  }
                  onClose={() =>
                    navigate(
                      { name: "people", section: "friends" },
                      { replace: true },
                    )
                  }
                  onPlayModpack={handlePlayModpack}
                  onAcceptGroupInvite={handleAcceptChatGroupInvite}
                  t={t}
                />
              ) : (
                <PeopleStartPanel
                  playing={playingEntries}
                  chats={chatEntries}
                  hasFriends={friends.length > 0}
                  isSignedOut={linkState === "signedOut"}
                  isLoading={realtime.isInitialLoading && friends.length === 0}
                  listError={realtime.listError}
                  summaryError={realtime.summaryError}
                  isSummaryPending={realtime.isSummaryPending}
                  onReloadFriends={realtime.reloadFriends}
                  onSignIn={() => navigate({ name: "accounts" })}
                  isGameRunning={isRunning}
                  ownFriendCode={friendCode.code}
                  friendRequestsEnabled={friendCode.isEnabled}
                  describePresence={(entry) => describePresence(entry, t)}
                  describeChat={(entry) =>
                    describeRowDetail(entry, authData?.sub, t)
                  }
                  onJoin={handleJoin}
                  onInvite={handleInvite}
                  onOpenChat={openConversation}
                  onAddFriend={handleAddFriend}
                  onCopyCode={friendCode.copy}
                  t={t}
                />
              )}
            </>
          )}
        </div>

        {voiceSession.state !== "disconnected" && (
          <div className="shrink-0">
            <VoiceCallBar inline />
          </div>
        )}
      </div>

      {removeTarget && (
        <Confirmation
          title={t("friends.deleteTitle")}
          content={[
            {
              text: t("friends.deleteAlert", {
                nickname: removeTarget.friend.user.nickname,
              }),
            },
            { text: t("friends.deleteLoss") },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setRemoveTargetId(null),
            },
            {
              text: t("friends.deleteAction"),
              color: "danger",
              loading: realtime.removingFriendId === removeTargetId,
              onClick: () => {
                const id = removeTarget.friend.user._id;
                realtime.removeFriend(id);
                setRemoveTargetId(null);
                if (routePeerId === id) {
                  navigate(
                    { name: "people", section: "friends" },
                    { replace: true },
                  );
                }
              },
            },
          ]}
          onClose={() => setRemoveTargetId(null)}
        />
      )}

      {gameInvite.inviteGuide && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) gameInvite.closeGuide();
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{gameInvite.inviteGuide.title}</DialogTitle>
            </DialogHeader>
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <DialogDescription asChild>
                {gameInvite.inviteGuide.steps.length > 0 ? (
                  <ol className="flex flex-col gap-3">
                    {gameInvite.inviteGuide.steps.map((step, index) => (
                      <li
                        key={`${index}-${step}`}
                        className="flex items-start gap-3"
                      >
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 font-mono text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="text-sm leading-6 text-foreground">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm leading-6 text-foreground">
                    {gameInvite.inviteGuide.description}
                  </p>
                )}
              </DialogDescription>
            </div>
            <DialogFooter>
              {gameInvite.inviteGuide.canOpenShare && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    gameInvite.closeGuide();
                    setIsShareModalOpen(true);
                  }}
                >
                  {t("friends.openSharePanel")}
                </Button>
              )}
              <Button variant="secondary" onClick={gameInvite.closeGuide}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {skinView && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazySkinView
            skinData={skinView.data}
            nickname={skinView.nickname}
            onClose={() => setSkinView(null)}
          />
        </Suspense>
      )}
    </>
  );
}
