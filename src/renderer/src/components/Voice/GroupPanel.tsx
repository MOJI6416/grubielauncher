import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  BellOff,
  BellRing,
  Copy,
  Crown,
  DoorOpen,
  EllipsisVertical,
  Gamepad2,
  Headphones,
  Link2,
  Loader2,
  LogIn,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  UserX,
} from "lucide-react";
import {
  AccountHead,
  HeadDot,
  PlayerHead,
  type HeadFace,
} from "@renderer/features/accounts/AccountHead";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { IGroup, IGroupUser } from "@/types/Voice";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  friendsAtom,
  openGroupChatIdAtom,
} from "@renderer/stores/atoms";
import { loadGroups } from "@renderer/features/friends/groups";
import {
  groupInitials,
  sortGroupMembers,
} from "@renderer/features/voice/groupList";
import {
  groupPermissions,
  memberActions,
} from "@renderer/features/voice/permissions";
import {
  groupConfirmCopy,
  type GroupConfirmKind,
} from "@renderer/features/voice/groupConfirmations";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { showFailureToast } from "@renderer/utilities/failures";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;
const INVITE_TIMEOUT_MS = 15000;

function SectionLabel({
  children,
  count,
  action,
}: {
  children: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 px-1">
      <span className="text-[10px] font-medium tracking-wide text-faint uppercase">
        {children}
      </span>
      {count !== undefined && (
        <span className="font-mono text-[10px] tabular-nums text-faint">
          {count}
        </span>
      )}
      {action && <span className="ml-auto flex items-center">{action}</span>}
    </div>
  );
}

function MemberRow({
  member,
  face,
  isOwner,
  isSelf,
  isOnline,
  isInVoice,
  actions,
  onTransfer,
  onKick,
  onBan,
  t,
}: {
  member: IGroupUser;
  face: HeadFace;
  isOwner: boolean;
  isSelf: boolean;
  isOnline: boolean;
  isInVoice: boolean;
  actions: ReturnType<typeof memberActions>;
  onTransfer: () => void;
  onKick: () => void;
  onBan: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="group flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-surface-3">
      <AccountHead
        account={face}
        size={28}
        badge={
          <HeadDot
            className={cn("ring-card", isOnline ? "bg-success" : "bg-faint")}
          />
        }
      />

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <Hint content={member.nickname} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-[13px]">
              {member.nickname}
            </span>
          </Hint>
          {isOwner && <Crown className="size-3 shrink-0 text-warning" />}
        </span>
        {(isSelf || isInVoice) && (
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            {isInVoice ? t("voice.inVoiceNow") : t("voice.you")}
          </span>
        )}
      </span>

      {actions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label={t("groups.memberActions")}
            >
              <EllipsisVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onTransfer}>
              <Crown />
              {t("groups.transferOwner")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onKick}>
              <UserX />
              {t("groups.kick")}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onBan}>
              <Ban />
              {t("groups.ban")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

export function GroupPanel({
  group,
  isActiveRoom,
  isBusy,
  voiceIdentities,
  isMuted,
  canInviteToGame,
  onBack,
  onJoinVoice,
  onLeaveVoice,
  onToggleMute,
  onInviteToGame,
}: {
  group: IGroup;
  isActiveRoom: boolean;
  isBusy: boolean;
  voiceIdentities: string[];
  isMuted: boolean;
  canInviteToGame: boolean;
  onBack: () => void;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMute: () => void;
  onInviteToGame: () => void;
}) {
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const friends = useAtomValue(friendsAtom);
  const socket = useAtomValue(friendSocketAtom);
  const setChatGroupId = useSetAtom(openGroupChatIdAtom);
  const { t } = useTranslation();

  const [renameValue, setRenameValue] = useState<string | null>(null);
  const [isRenaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: GroupConfirmKind;
    member?: IGroupUser;
  } | null>(null);
  const [isInviteOpen, setInviteOpen] = useState(false);
  const [inviteStates, setInviteStates] = useState<
    Record<string, "sending" | "sent">
  >({});
  const inviteTimersRef = useRef(new Map<string, number>());

  const accessToken = account?.accessToken || "";
  const selfId = authData?.sub || "";
  const permissions = groupPermissions(group);
  const faceOf = useFaceLookup();

  const clearInviteTimer = useCallback((recipientId: string) => {
    const timer = inviteTimersRef.current.get(recipientId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    inviteTimersRef.current.delete(recipientId);
  }, []);

  useEffect(() => {
    const timers = inviteTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const onResult = (result: {
      ok?: boolean;
      code?: string;
      recipientId?: string;
    }) => {
      const recipientId = result?.recipientId;
      if (!recipientId || !inviteTimersRef.current.has(recipientId)) return;

      clearInviteTimer(recipientId);
      const delivered =
        result.ok === true || result.code === "invite_exists";

      setInviteStates((prev) => {
        if (prev[recipientId] === undefined) return prev;

        const next = { ...prev };
        if (delivered) next[recipientId] = "sent";
        else delete next[recipientId];

        return next;
      });
    };

    const onDisconnect = () => {
      const waiting = [...inviteTimersRef.current.keys()];
      if (waiting.length === 0) return;
      for (const recipientId of waiting) clearInviteTimer(recipientId);
      setInviteStates((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(([, state]) => state === "sent"),
        ),
      );
      toast.warning(t("friends.operationErrors.offline"));
    };

    socket.on("groupInviteResult", onResult);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("groupInviteResult", onResult);
      socket.off("disconnect", onDisconnect);
    };
  }, [clearInviteTimer, socket, t]);

  const startInvite = (recipientId: string, nickname: string) => {
    if (inviteTimersRef.current.has(recipientId)) return;

    socket?.emit("groupInvite", { recipientId, groupId: group._id });
    setInviteStates((prev) => ({ ...prev, [recipientId]: "sending" }));
    inviteTimersRef.current.set(
      recipientId,
      window.setTimeout(() => {
        inviteTimersRef.current.delete(recipientId);
        setInviteStates((prev) => {
          if (prev[recipientId] !== "sending") return prev;
          const next = { ...prev };
          delete next[recipientId];
          return next;
        });
        toast.warning(t("groups.inviteTimeout", { nickname }));
      }, INVITE_TIMEOUT_MS),
    );
  };

  const onlineIds = useMemo(
    () =>
      new Set(
        friends
          .filter((friend) => friend.isOnline)
          .map((friend) => friend.user._id),
      ),
    [friends],
  );

  const members = useMemo(
    () =>
      sortGroupMembers(group.members, {
        ownerId: group.owner._id,
        selfId,
        onlineIds,
        inVoice: voiceIdentities,
      }),
    [group.members, group.owner._id, onlineIds, selfId, voiceIdentities],
  );

  const invitableFriends = useMemo(
    () =>
      friends.filter(
        (friend) =>
          !group.members.some((member) => member._id === friend.user._id),
      ),
    [friends, group.members],
  );

  const voiceMembers = voiceIdentities
    .map((identity) => group.members.find((member) => member._id === identity))
    .filter((member): member is IGroupUser => Boolean(member));

  const voiceCount = Math.max(
    group.participantCount ?? 0,
    voiceIdentities.length,
  );
  const voiceUnnamed = Math.max(0, voiceCount - voiceMembers.length);

  const runAction = async (
    promise: Promise<unknown>,
    channel: string,
    successKey?: string,
  ) => {
    const result = await promise;
    if (!result) {
      showFailureToast(t("groups.actionError"), undefined, {
        channels: [channel],
      });
      return false;
    }
    void loadGroups();
    if (successKey) toast.success(t(successKey));
    return true;
  };

  const handleCopy = async (value: string, successKey: string) => {
    if (!(await copyToClipboard(value))) return;
    toast.success(t(successKey));
  };

  const handleRename = async () => {
    if (isRenaming) return;

    const name = (renameValue ?? "").trim();
    if (!name) return;

    if (name === group.name) {
      setRenameValue(null);
      return;
    }

    setRenaming(true);
    try {
      const ok = await runAction(
        api.backend.groupRename(accessToken, group._id, name),
        "backend:groupRename",
      );
      if (ok) setRenameValue(null);
    } finally {
      setRenaming(false);
    }
  };

  const runConfirmed = async (kind: GroupConfirmKind, memberId: string) => {
    if (kind === "delete" || kind === "leave") {
      const isDelete = kind === "delete";
      const ok = await runAction(
        isDelete
          ? api.backend.groupDelete(accessToken, group._id)
          : api.backend.groupLeave(accessToken, group._id),
        isDelete ? "backend:groupDelete" : "backend:groupLeave",
      );

      if (!ok) return;
      if (isActiveRoom) onLeaveVoice();
      onBack();
      return;
    }

    if (kind === "resetCode") {
      await runAction(
        api.backend.groupResetCode(accessToken, group._id),
        "backend:groupResetCode",
        "groups.codeReset",
      );
      return;
    }

    if (kind === "transfer") {
      await runAction(
        api.backend.groupTransferOwner(accessToken, group._id, memberId),
        "backend:groupTransferOwner",
      );
      return;
    }

    if (kind === "kick") {
      await runAction(
        api.backend.groupKickMember(accessToken, group._id, memberId),
        "backend:groupKickMember",
        "groups.kicked",
      );
      return;
    }

    await runAction(
      api.backend.groupBanMember(accessToken, group._id, memberId),
      "backend:groupBanMember",
      "groups.banApplied",
    );
  };

  const handleConfirm = async () => {
    if (!confirm) return;

    try {
      await runConfirmed(confirm.kind, confirm.member?._id ?? "");
    } finally {
      setConfirm(null);
    }
  };

  const copy = confirm ? groupConfirmCopy(confirm.kind) : null;
  const copyValues = {
    name: group.name,
    group: group.name,
    nickname: confirm?.member?.nickname ?? "",
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={onBack}
          aria-label={t("shell.back")}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[11px] font-semibold text-muted-foreground">
          {groupInitials(group.name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <Hint content={group.name} variant="text" truncatedOnly>
              <span className="min-w-0 truncate text-sm font-medium">
                {group.name}
              </span>
            </Hint>
            {isMuted && <BellOff className="size-3 shrink-0 text-faint" />}
          </span>
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            {group.isOwner ? t("groups.youAreOwner") : t("groups.youAreMember")}
          </span>
        </span>

        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 shrink-0"
          onClick={() => setChatGroupId(group._id)}
          aria-label={t("groups.chat")}
        >
          <MessageSquare className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={t("groups.groupActions")}
            >
              <EllipsisVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {permissions.canRename && (
              <DropdownMenuItem onSelect={() => setRenameValue(group.name)}>
                <Pencil />
                {t("groups.rename")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onToggleMute}>
              {isMuted ? <BellRing /> : <BellOff />}
              {isMuted
                ? t("groups.unmuteNotifications")
                : t("groups.muteNotifications")}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canInviteToGame}
              onSelect={onInviteToGame}
            >
              <Gamepad2 />
              {t("groups.inviteToGame")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {permissions.canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirm({ kind: "delete" })}
              >
                <Trash2 />
                {t("groups.delete")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirm({ kind: "leave" })}
              >
                <DoorOpen />
                {t("groups.leave")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 rounded-lg border p-2",
          isActiveRoom
            ? "border-primary/40 bg-primary-soft"
            : "border-border bg-surface-2",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Headphones
            className={cn(
              "size-4 shrink-0",
              voiceCount > 0 ? "text-success" : "text-faint",
            )}
          />
          <span className="min-w-0 flex-1 truncate text-[13px]">
            {voiceCount > 0
              ? t("voice.inVoiceCount", { count: voiceCount })
              : t("voice.nobodyInVoice")}
          </span>

          {isActiveRoom ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-destructive"
              onClick={onLeaveVoice}
            >
              {t("voice.leaveShort")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0"
              disabled={isBusy}
              onClick={onJoinVoice}
            >
              {isBusy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <LogIn className="size-3.5" />
              )}
              {t("groups.joinShort")}
            </Button>
          )}
        </div>

        {voiceCount > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1">
            {voiceMembers.map((member) => (
              <span
                key={member._id}
                className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-surface-3 py-0.5 pr-1.5 pl-0.5"
              >
                <AccountHead account={faceOf(member)} size={16} />
                <Hint content={member.nickname} variant="text" truncatedOnly>
                  <span className="min-w-0 truncate text-[11px]">
                    {member.nickname}
                  </span>
                </Hint>
              </span>
            ))}
            {voiceUnnamed > 0 && (
              <span className="flex shrink-0 items-center rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {t("voice.moreParticipants", { count: voiceUnnamed })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0">
        <SectionLabel>{t("groups.inviteCode")}</SectionLabel>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 py-1 pr-1 pl-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] tracking-[0.14em] select-all">
            {group.code}
          </span>
          <Hint content={t("groups.copyCode")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => void handleCopy(group.code, "groups.codeCopied")}
              aria-label={t("groups.copyCode")}
            >
              <Copy className="size-3.5" />
            </Button>
          </Hint>
          <Hint content={t("groups.copyLink")}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() =>
                void handleCopy(
                  `grubielauncher://group/join/${group.code}`,
                  "groups.linkCopied",
                )
              }
              aria-label={t("groups.copyLink")}
            >
              <Link2 className="size-3.5" />
            </Button>
          </Hint>
          {permissions.canResetCode && (
            <Hint content={t("groups.resetCode")}>
              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => setConfirm({ kind: "resetCode" })}
                aria-label={t("groups.resetCode")}
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </Hint>
          )}
        </div>
      </div>

      <SectionLabel count={group.members.length}>
        {t("groups.members")}
      </SectionLabel>

      <ScrollArea className="-mx-1 min-h-0 flex-1 px-1">
        <div className="flex flex-col">
          {members.map((member) => (
            <MemberRow
              key={member._id}
              member={member}
              face={faceOf(member)}
              isOwner={member._id === group.owner._id}
              isSelf={member._id === selfId}
              isOnline={onlineIds.has(member._id) || member._id === selfId}
              isInVoice={voiceIdentities.includes(member._id)}
              actions={memberActions(group, member._id, selfId)}
              onTransfer={() => setConfirm({ kind: "transfer", member })}
              onKick={() => setConfirm({ kind: "kick", member })}
              onBan={() => setConfirm({ kind: "ban", member })}
              t={t}
            />
          ))}

          {permissions.canModerate && group.banned.length > 0 && (
            <>
              <SectionLabel count={group.banned.length}>
                {t("groups.bannedSection")}
              </SectionLabel>
              {group.banned.map((banned) => (
                <div
                  key={banned._id}
                  className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-2"
                >
                  <AccountHead
                    account={faceOf(banned)}
                    size={28}
                    className="opacity-60"
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {banned.nickname}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 text-[11px]"
                    onClick={() =>
                      void runAction(
                        api.backend.groupUnbanMember(
                          accessToken,
                          group._id,
                          banned._id,
                        ),
                        "backend:groupUnbanMember",
                      )
                    }
                  >
                    {t("groups.unban")}
                  </Button>
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>

      <Button
        size="sm"
        variant="secondary"
        className="h-8 shrink-0"
        onClick={() => setInviteOpen(true)}
      >
        <UserPlus className="size-3.5" />
        {t("groups.inviteFriend")}
      </Button>

      <Dialog
        open={renameValue !== null}
        onOpenChange={(open) => {
          if (open || isRenaming) return;
          setRenameValue(null);
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <Pencil className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("groups.renameTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("groups.renameHint")}
            </DialogDescription>
            <Input
              value={renameValue ?? ""}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRename();
              }}
              disabled={isRenaming}
              maxLength={48}
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">
            <Button
              variant="secondary"
              disabled={isRenaming}
              onClick={() => setRenameValue(null)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={isRenaming || !(renameValue ?? "").trim()}
              onClick={() => void handleRename()}
            >
              {isRenaming && <Loader2 className="size-3.5 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isInviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <UserPlus className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("groups.inviteTitle", { group: group.name })}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("groups.inviteHint")}
            </DialogDescription>

            {invitableFriends.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {t("groups.noInvitableFriends")}
              </p>
            ) : (
              <ScrollArea className="-mx-1 max-h-72 px-1">
                <div className="flex flex-col gap-0.5">
                  {invitableFriends.map((friend) => {
                    const inviteState = inviteStates[friend.user._id];

                    return (
                      <div
                        key={friend.user._id}
                        className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-1.5 hover:bg-surface-3"
                      >
                        <PlayerHead
                          user={friend.user}
                          size={28}
                          badge={
                            <HeadDot
                              className={cn(
                                "ring-popover",
                                friend.isOnline ? "bg-success" : "bg-faint",
                              )}
                            />
                          }
                        />
                        <Hint
                          content={friend.user.nickname}
                          variant="text"
                          truncatedOnly
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {friend.user.nickname}
                          </span>
                        </Hint>
                        <Button
                          size="sm"
                          variant={inviteState ? "ghost" : "secondary"}
                          className="h-7 shrink-0 text-[11px]"
                          disabled={Boolean(inviteState) || !socket?.connected}
                          onClick={() =>
                            startInvite(friend.user._id, friend.user.nickname)
                          }
                        >
                          {inviteState === "sending" && (
                            <Loader2 className="size-3 animate-spin" />
                          )}
                          {inviteState === "sent"
                            ? t("groups.inviteSentShort")
                            : inviteState === "sending"
                              ? t("groups.inviteSending")
                              : t("groups.invite")}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {confirm && copy && (
        <Confirmation
          title={t(copy.titleKey)}
          reversible={copy.reversible}
          content={copy.lineKeys.map((key) => ({ text: t(key, copyValues) }))}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setConfirm(null),
            },
            {
              text: t(copy.actionKey),
              color: copy.actionColor,
              onClick: handleConfirm,
            },
          ]}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
