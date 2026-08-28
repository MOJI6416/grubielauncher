import { useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BellOff,
  Headphones,
  KeyRound,
  Loader2,
  LogIn,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { useFaceLookup } from "@renderer/features/accounts/faceDirectory";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { IGroup } from "@/types/Voice";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  friendsAtom,
  groupUnreadsAtom,
  groupsAtom,
  groupsLoadFailedAtom,
  mutedGroupsAtom,
  openGroupChatIdAtom,
  ownPresenceAtom,
  saveMutedGroups,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import {
  buildGroupList,
  filterGroupList,
  groupInitials,
  type GroupListEntry,
} from "@renderer/features/voice/groupList";
import { loadGroups } from "@renderer/features/friends/groups";
import { splitOverflow } from "@renderer/features/voice/participants";
import { voiceJoinErrorKey } from "@renderer/features/voice/errors";
import { groupPanelIdAtom } from "@renderer/features/voice/state";
import { useGroupGameInvite } from "@renderer/features/voice/useGroupGameInvite";
import { voiceConnect, voiceDisconnect } from "@renderer/utilities/voiceClient";
import { reportGroupJoinFailure } from "@renderer/utilities/groupJoin";
import { parseGroupJoinCode } from "@renderer/utilities/packShare";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { showFailureToast } from "@renderer/utilities/failures";
import { GroupPanel } from "./GroupPanel";

const api = window.api;
const SEARCH_THRESHOLD = 5;
const MAX_ROW_AVATARS = 4;

function GroupRow({
  entry,
  isBusy,
  onOpenChat,
  onOpenPanel,
  onJoinVoice,
  onLeaveVoice,
  t,
}: {
  entry: GroupListEntry;
  isBusy: boolean;
  onOpenChat: () => void;
  onOpenPanel: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const { group, voiceCount, voiceIdentities, isActiveRoom, isMuted, unread } =
    entry;
  const faceOf = useFaceLookup();
  const avatars = splitOverflow(
    voiceIdentities
      .map((identity) =>
        group.members.find((member) => member._id === identity),
      )
      .filter(Boolean),
    MAX_ROW_AVATARS,
  );

  return (
    <div
      className={cn(
        "group/row flex min-w-0 flex-col rounded-lg border transition-colors",
        isActiveRoom
          ? "border-primary/40 bg-primary-soft"
          : "border-transparent bg-surface-2 hover:border-border",
      )}
    >
      <div className="flex h-13 min-w-0 items-center gap-2 pr-1.5 pl-2">
        <button
          type="button"
          onClick={onOpenChat}
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="relative shrink-0">
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface-3 text-[11px] font-semibold text-muted-foreground">
              {groupInitials(group.name)}
            </span>
            {unread > 0 && (
              <span
                className={cn(
                  "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[9px] leading-none tabular-nums",
                  isMuted
                    ? "bg-surface-3 text-muted-foreground"
                    : "bg-primary-soft-raised text-primary",
                )}
                aria-label={t("friends.newMessage")}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <Hint content={group.name} variant="text" truncatedOnly>
                <span className="min-w-0 truncate text-[13px] font-medium">
                  {group.name}
                </span>
              </Hint>
              {isMuted && (
                <Hint content={t("groups.muteNotifications")}>
                  <BellOff className="size-3 shrink-0 text-faint" />
                </Hint>
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
              <Users className="size-3 shrink-0 text-faint" />
              <span className="font-mono tabular-nums">
                {group.members.length}
              </span>
              {voiceCount > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="truncate text-success">
                    {t("voice.inVoiceCount", { count: voiceCount })}
                  </span>
                </>
              )}
            </span>
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-0.5">
          {voiceCount > 0 && (
            <span className="mr-0.5 flex -space-x-1.5">
              {avatars.visible.map(
                (member) =>
                  member && (
                    <AccountHead
                      key={member._id}
                      account={faceOf(member)}
                      size={20}
                      className="ring-2 ring-card"
                    />
                  ),
              )}
              {avatars.hidden > 0 && (
                <span className="flex size-5 items-center justify-center rounded-md bg-surface-3 font-mono text-[8px] tabular-nums text-muted-foreground ring-2 ring-card">
                  +{avatars.hidden}
                </span>
              )}
            </span>
          )}

          <Hint
            content={isActiveRoom ? t("voice.disconnect") : t("groups.join")}
          >
            <Button
              size="icon-sm"
              variant={isActiveRoom ? "ghost" : "secondary"}
              className={cn("size-7", isActiveRoom && "text-destructive")}
              disabled={isBusy}
              onClick={isActiveRoom ? onLeaveVoice : onJoinVoice}
              aria-label={
                isActiveRoom ? t("voice.disconnect") : t("groups.join")
              }
            >
              {isBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isActiveRoom ? (
                <Headphones className="size-3.5" />
              ) : (
                <LogIn className="size-3.5" />
              )}
            </Button>
          </Hint>

          <Hint content={t("groups.manage")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 text-faint transition-colors hover:text-foreground"
              onClick={onOpenPanel}
              aria-label={t("groups.manage")}
            >
              <Settings2 className="size-3.5" />
            </Button>
          </Hint>
        </span>
      </div>
    </div>
  );
}

export function GroupsTab({
  createOpen,
  joinOpen,
  onCreateOpenChange,
  onJoinOpenChange,
}: {
  createOpen?: boolean;
  joinOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  onJoinOpenChange?: (open: boolean) => void;
} = {}) {
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const groups = useAtomValue(groupsAtom);
  const hasLoadFailed = useAtomValue(groupsLoadFailedAtom);
  const friends = useAtomValue(friendsAtom);
  const friendSocket = useAtomValue(friendSocketAtom);
  const groupUnreads = useAtomValue(groupUnreadsAtom);
  const session = useAtomValue(voiceSessionMetaAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const shareState = useAtomValue(shareStateAtom);
  const shareOwnerAccountKey = useAtomValue(shareOwnerAccountKeyAtom);
  const [mutedGroups, setMutedGroups] = useAtom(mutedGroupsAtom);
  const [panelGroupId, setPanelGroupId] = useAtom(groupPanelIdAtom);
  const setChatGroupId = useSetAtom(openGroupChatIdAtom);
  const { t } = useTranslation();

  const [localCreateOpen, setLocalCreateOpen] = useState(false);
  const [localJoinOpen, setLocalJoinOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [query, setQuery] = useState("");
  const [busyGroupId, setBusyGroupId] = useState("");
  const [isReloading, setReloading] = useState(false);
  const inviteGroupToGame = useGroupGameInvite(friendSocket);
  const [isSubmitting, setSubmitting] = useState(false);

  const isCreateOpen = createOpen ?? localCreateOpen;
  const isJoinOpen = joinOpen ?? localJoinOpen;
  const setCreateOpen = onCreateOpenChange ?? setLocalCreateOpen;
  const setJoinOpen = onJoinOpenChange ?? setLocalJoinOpen;

  const accessToken = account?.accessToken || "";

  const canManageCurrentShare = canCurrentAccountManageShare(
    shareOwnerAccountKey,
    account,
  );
  const shareWorldTarget =
    canManageCurrentShare &&
    shareState.phase === "online" &&
    shareState.slug &&
    shareState.sessionId &&
    shareState.publicAddress
      ? {
          type: "world" as const,
          slug: shareState.slug,
          sessionId: shareState.sessionId,
          publicAddress: shareState.publicAddress,
          visibility: shareState.visibility,
        }
      : null;
  const gameInviteTarget = ownPresence.serverAddress
    ? { type: "server" as const }
    : shareWorldTarget;

  const entries = useMemo(
    () =>
      buildGroupList(groups, {
        activeRoomId:
          session.state === "disconnected" ? undefined : session.roomId,
        unreads: groupUnreads,
        mutedIds: mutedGroups,
      }),
    [groups, groupUnreads, mutedGroups, session.roomId, session.state],
  );

  const visible = useMemo(
    () => filterGroupList(entries, query),
    [entries, query],
  );

  const panelEntry = panelGroupId
    ? entries.find((entry) => entry.group._id === panelGroupId)
    : undefined;

  const reloadGroups = async () => {
    if (isReloading) return;
    setReloading(true);
    try {
      const ok = await loadGroups();
      if (!ok) {
        showFailureToast(t("groups.loadFailed"), undefined, {
          channels: ["backend:groupsList"],
          fallbackDescription: t("groups.loadFailedHint"),
        });
      }
    } finally {
      setReloading(false);
    }
  };

  const openGroup = (groupId: string) => {
    setPanelGroupId(groupId);
    setChatGroupId(groupId);
  };

  const handleJoinVoice = async (group: IGroup) => {
    setBusyGroupId(group._id);
    try {
      const grant = await api.backend.groupJoinVoice(accessToken, group._id);
      if (!grant) {
        showFailureToast(t("groups.joinError"), undefined, {
          channels: ["backend:groupJoinVoice"],
        });
        return;
      }
      await voiceConnect(grant, {
        roomId: group._id,
        roomName: group.name,
        isRoomOwner: group.isOwner,
      });
    } catch (error) {
      showFailureToast(t(voiceJoinErrorKey(error)), error, {
        context: { side: "grubie" },
      });
    } finally {
      setBusyGroupId("");
    }
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name || isSubmitting) return;

    setSubmitting(true);
    const group = await api.backend.groupCreate(accessToken, name);
    setSubmitting(false);

    if (!group) {
      showFailureToast(t("groups.actionError"), undefined, {
        channels: ["backend:groupCreate"],
      });
      return;
    }

    setCreateName("");
    setCreateOpen(false);
    void loadGroups();
    openGroup(group._id);
    toast.success(t("groups.created", { name: group.name }));
  };

  const handleJoinByCode = async () => {
    const code = parseGroupJoinCode(joinCode) ?? joinCode.trim();
    if (!code || isSubmitting) return;

    const memberBefore = groups.map((entry) => entry._id);

    setSubmitting(true);
    const group = await api.backend.groupJoinByCode(accessToken, code);
    setSubmitting(false);

    if (!group || typeof group === "string") {
      reportGroupJoinFailure(group ?? null, t);
      return;
    }

    setJoinCode("");
    setJoinOpen(false);
    void loadGroups();

    if (memberBefore.includes(group._id)) {
      toast.info(t("groups.alreadyJoined", { group: group.name }));
      openGroup(group._id);
      return;
    }

    toast.success(t("groups.joined", { group: group.name }));
  };

  const toggleMute = (group: IGroup) => {
    setMutedGroups((prev) => {
      const next = prev.includes(group._id)
        ? prev.filter((id) => id !== group._id)
        : [...prev, group._id];
      saveMutedGroups(next);
      return next;
    });
  };

  const inviteToGame = (group: IGroup) => {
    if (!friendSocket || !gameInviteTarget) return;

    const friendIds = new Set(friends.map((friend) => friend.user._id));
    const recipients = group.members.filter(
      (member) => member._id !== authData?.sub && friendIds.has(member._id),
    );

    if (recipients.length === 0) {
      toast.info(t("groups.noGameInviteRecipients"));
      return;
    }

    inviteGroupToGame(
      recipients.map((member) => member._id),
      gameInviteTarget,
    );
  };

  const dialogs = (
    <>
      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateName("");
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <Plus className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("groups.create")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("groups.createHint")}
            </DialogDescription>
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleCreate();
              }}
              placeholder={t("groups.createPlaceholder")}
              maxLength={48}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!createName.trim() || isSubmitting}
              onClick={() => void handleCreate()}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {t("groups.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isJoinOpen}
        onOpenChange={(open) => {
          setJoinOpen(open);
          if (!open) setJoinCode("");
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <KeyRound className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("groups.joinByCode")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("groups.joinByCodeHint")}
            </DialogDescription>
            <Input
              value={joinCode}
              onChange={(event) =>
                setJoinCode(
                  parseGroupJoinCode(event.target.value) ?? event.target.value,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleJoinByCode();
              }}
              placeholder={t("groups.codePlaceholder")}
              className="font-mono tracking-[0.14em]"
              maxLength={64}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">
            <Button variant="secondary" onClick={() => setJoinOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!joinCode.trim() || isSubmitting}
              onClick={() => void handleJoinByCode()}
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {t("groups.joinByCode")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );

  if (panelEntry) {
    return (
      <>
        <GroupPanel
          key={panelEntry.group._id}
          group={panelEntry.group}
          isActiveRoom={panelEntry.isActiveRoom}
          isBusy={busyGroupId === panelEntry.group._id}
          voiceIdentities={panelEntry.voiceIdentities}
          isMuted={panelEntry.isMuted}
          canInviteToGame={Boolean(gameInviteTarget && friendSocket)}
          onBack={() => setPanelGroupId(null)}
          onJoinVoice={() => void handleJoinVoice(panelEntry.group)}
          onLeaveVoice={() => void voiceDisconnect()}
          onToggleMute={() => toggleMute(panelEntry.group)}
          onInviteToGame={() => inviteToGame(panelEntry.group)}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {entries.length >= SEARCH_THRESHOLD && (
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            placeholder={t("groups.searchPlaceholder")}
            aria-label={t("groups.searchPlaceholder")}
            className="h-8 pr-7 pl-8 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
          />
          {query && (
            <button
              type="button"
              aria-label={t("common.close")}
              className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
            <MessageSquare className="size-5 text-muted-foreground" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {!accessToken
                ? t("friends.sessionLost")
                : hasLoadFailed
                  ? t("groups.loadFailed")
                  : t("groups.noGroupsTitle")}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {!accessToken
                ? t("friends.sessionLostHint")
                : hasLoadFailed
                  ? t("groups.loadFailedHint")
                  : t("groups.noGroupsHint")}
            </p>
          </div>
          {accessToken && hasLoadFailed && (
            <Button
              variant="outline"
              size="sm"
              disabled={isReloading}
              onClick={() => void reloadGroups()}
            >
              {isReloading && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.retry")}
            </Button>
          )}
        </div>
      ) : (
        <>
          {hasLoadFailed && (
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5 py-1.5">
              <TriangleAlert className="size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {t("groups.loadFailed")}
              </span>
              <Button
                size="xs"
                variant="ghost"
                className="shrink-0"
                disabled={isReloading}
                onClick={() => void reloadGroups()}
              >
                {isReloading && <Loader2 className="size-3 animate-spin" />}
                {t("common.retry")}
              </Button>
            </div>
          )}
          {visible.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-4 text-center">
              <p className="text-sm font-medium">{t("groups.nothingFound")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("groups.nothingFoundHint")}
              </p>
            </div>
          ) : (
            <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
              <div className="flex flex-col gap-1.5 pb-1">
                {visible.map((entry) => (
                  <GroupRow
                    key={entry.group._id}
                    entry={entry}
                    isBusy={busyGroupId === entry.group._id}
                    onOpenChat={() => setChatGroupId(entry.group._id)}
                    onOpenPanel={() => openGroup(entry.group._id)}
                    onJoinVoice={() => void handleJoinVoice(entry.group)}
                    onLeaveVoice={() => void voiceDisconnect()}
                    t={t}
                  />
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border pt-2">
        <p className="px-0.5 text-[11px] leading-4 text-faint">
          {t("groups.footerHint")}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 min-w-0 flex-1"
            disabled={!accessToken}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" />
            <span className="truncate">{t("groups.createShort")}</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 min-w-0 flex-1"
            disabled={!accessToken}
            onClick={() => setJoinOpen(true)}
          >
            <KeyRound className="size-3.5" />
            <span className="truncate">{t("groups.joinByCodeShort")}</span>
          </Button>
        </div>
      </div>

      {dialogs}
    </div>
  );
}
