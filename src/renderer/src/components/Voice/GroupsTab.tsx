import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  friendsAtom,
  groupUnreadsAtom,
  groupsAtom,
  mutedGroupsAtom,
  ownPresenceAtom,
  saveMutedGroups,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ban,
  Bell,
  BellOff,
  Copy,
  Crown,
  DoorOpen,
  EllipsisVertical,
  Gamepad2,
  KeyRound,
  Link,
  Loader2,
  MessageSquare,
  Pencil,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IGroup } from "@/types/Voice";
import { IModpack } from "@/types/Backend";
import { Version } from "@renderer/classes/Version";
import { Confirmation } from "../Modals/Confirmation";
import { GroupChatModal } from "./GroupChatModal";
import { voiceConnect, voiceDisconnect } from "@renderer/utilities/voiceClient";
import { groupJoinErrorKey } from "@renderer/utilities/groupJoin";

const api = window.api;

export function GroupsTab({
  onPlayModpack,
  createOpen,
  joinOpen,
  onCreateOpenChange,
  onJoinOpenChange,
}: {
  onPlayModpack: (modpack: IModpack, version?: Version) => void | Promise<void>;
  createOpen: boolean;
  joinOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onJoinOpenChange: (open: boolean) => void;
}) {
  const [account] = useAtom(accountAtom);
  const session = useAtomValue(voiceSessionMetaAtom);
  const [groups] = useAtom(groupsAtom);
  const [friends] = useAtom(friendsAtom);
  const [friendSocket] = useAtom(friendSocketAtom);
  const [groupUnreads] = useAtom(groupUnreadsAtom);
  const [mutedGroups, setMutedGroups] = useAtom(mutedGroupsAtom);
  const [ownPresence] = useAtom(ownPresenceAtom);
  const [authData] = useAtom(authDataAtom);
  const [shareState] = useAtom(shareStateAtom);
  const [shareOwnerAccountKey] = useAtom(shareOwnerAccountKeyAtom);
  const { t } = useTranslation();

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

  const [chatGroupId, setChatGroupId] = useState<string | null>(null);
  const [membersGroupId, setMembersGroupId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<{
    group: IGroup;
    memberId: string;
    nickname: string;
  } | null>(null);
  const [createName, setCreateName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busyGroupId, setBusyGroupId] = useState("");
  const [renameGroup, setRenameGroup] = useState<IGroup | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteGroup, setDeleteGroup] = useState<IGroup | null>(null);
  const [inviteGroup, setInviteGroup] = useState<IGroup | null>(null);
  const [inviteFriendId, setInviteFriendId] = useState("");

  const accessToken = account?.accessToken || "";

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    const group = await api.backend.groupCreate(accessToken, name);
    if (!group) {
      toast.error(t("groups.actionError"));
      return;
    }
    setCreateName("");
    onCreateOpenChange(false);
  };

  const handleJoinByCode = async () => {
    const code = joinCode.trim();
    if (!code) return;
    const group = await api.backend.groupJoinByCode(accessToken, code);
    if (!group || typeof group === "string") {
      toast.error(t(groupJoinErrorKey(group ?? null)));
      return;
    }
    setJoinCode("");
    onJoinOpenChange(false);
    toast.success(t("groups.joined", { group: group.name }));
  };

  const handleBan = async (group: IGroup, memberId: string) => {
    const ok = await api.backend.groupBanMember(
      accessToken,
      group._id,
      memberId,
    );
    if (!ok) toast.error(t("groups.actionError"));
  };

  const handleKickMember = async (group: IGroup, memberId: string) => {
    const ok = await api.backend.groupKickMember(
      accessToken,
      group._id,
      memberId,
    );
    if (!ok) toast.error(t("groups.actionError"));
  };

  const handleUnban = async (group: IGroup, memberId: string) => {
    const ok = await api.backend.groupUnbanMember(
      accessToken,
      group._id,
      memberId,
    );
    if (!ok) toast.error(t("groups.actionError"));
  };

  const handleTransferOwner = async (group: IGroup, memberId: string) => {
    const ok = await api.backend.groupTransferOwner(
      accessToken,
      group._id,
      memberId,
    );
    if (!ok) toast.error(t("groups.actionError"));
  };

  const toggleMuteGroup = (group: IGroup) => {
    setMutedGroups((prev) => {
      const next = prev.includes(group._id)
        ? prev.filter((id) => id !== group._id)
        : [...prev, group._id];
      saveMutedGroups(next);
      return next;
    });
  };

  const handleInviteToGame = (group: IGroup) => {
    if (!friendSocket || !gameInviteTarget) return;

    const friendIds = new Set(friends.map((friend) => friend.user._id));
    const recipients = group.members.filter(
      (member) => member._id !== authData?.sub && friendIds.has(member._id),
    );

    for (const member of recipients) {
      friendSocket.emit("gameInvite", {
        recipientId: member._id,
        target: gameInviteTarget,
      });
    }

    toast.success(t("groups.gameInvitesSent"));
  };

  const handleJoinVoice = async (group: IGroup) => {
    setBusyGroupId(group._id);
    try {
      const grant = await api.backend.groupJoinVoice(accessToken, group._id);
      if (!grant) {
        toast.error(t("groups.joinError"));
        return;
      }
      await voiceConnect(grant, {
        roomId: group._id,
        roomName: group.name,
        isRoomOwner: group.isOwner,
      });
    } catch {
      toast.error(t("groups.joinError"));
    } finally {
      setBusyGroupId("");
    }
  };

  const handleCopyCode = async (group: IGroup) => {
    await navigator.clipboard.writeText(group.code);
    toast.success(t("groups.codeCopied"));
  };

  const handleCopyInviteLink = async (group: IGroup) => {
    await navigator.clipboard.writeText(
      `grubielauncher://group/join/${group.code}`,
    );
    toast.success(t("groups.linkCopied"));
  };

  const handleResetCode = async (group: IGroup) => {
    const updated = await api.backend.groupResetCode(accessToken, group._id);
    if (!updated) {
      toast.error(t("groups.actionError"));
      return;
    }
    toast.success(t("groups.codeReset"));
  };

  const handleRename = async () => {
    if (!renameGroup) return;
    const name = renameValue.trim();
    if (!name) return;
    const updated = await api.backend.groupRename(
      accessToken,
      renameGroup._id,
      name,
    );
    setRenameGroup(null);
    if (!updated) toast.error(t("groups.actionError"));
  };

  const handleDelete = async () => {
    if (!deleteGroup) return;
    if (session.roomId === deleteGroup._id) await voiceDisconnect();
    const ok = await api.backend.groupDelete(accessToken, deleteGroup._id);
    setDeleteGroup(null);
    if (!ok) toast.error(t("groups.actionError"));
  };

  const handleLeave = async (group: IGroup) => {
    if (session.roomId === group._id) await voiceDisconnect();
    const ok = await api.backend.groupLeave(accessToken, group._id);
    if (!ok) toast.error(t("groups.actionError"));
  };

  const handleSendInvite = () => {
    if (!friendSocket || !inviteGroup || !inviteFriendId) return;
    friendSocket.emit("groupInvite", {
      recipientId: inviteFriendId,
      groupId: inviteGroup._id,
    });
    setInviteGroup(null);
    setInviteFriendId("");
  };

  const invitableFriends = inviteGroup
    ? friends.filter(
        (friend) =>
          !inviteGroup.members.some((member) => member._id === friend.user._id),
      )
    : [];

  return (
    <div className="flex flex-col gap-2 pl-0.5 pr-2">
      {groups.length === 0 ? (
        <Empty className="min-h-24 border">
          <EmptyHeader>
            <EmptyTitle>{t("groups.noGroups")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1.5">
          {groups.map((group) => {
            const isCurrent =
              session.roomId === group._id && session.state !== "disconnected";
            const isBusy = busyGroupId === group._id;

            return (
              <div
                key={group._id}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 ${
                  isCurrent ? "border-primary/50 bg-primary/10" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm">
                    <span className="truncate">{group.name}</span>
                    {mutedGroups.includes(group._id) && (
                      <BellOff className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    {group.members.length}
                    {group.participantCount > 0 && (
                      <button
                        type="button"
                        disabled={isBusy || isCurrent}
                        onClick={() => void handleJoinVoice(group)}
                        aria-label={t("groups.join")}
                      >
                        <Badge
                          variant="secondary"
                          className="ml-1 cursor-pointer px-1 py-0 text-[10px] transition-colors hover:bg-primary/20"
                        >
                          {t("groups.inCall", { n: group.participantCount })}
                        </Badge>
                      </button>
                    )}
                    {(group.voiceParticipants?.length ?? 0) > 0 && (
                      <span className="ml-0.5 flex -space-x-1.5">
                        {(group.voiceParticipants ?? [])
                          .slice(0, 5)
                          .map((identity) => {
                            const member = group.members.find(
                              (candidate) => candidate._id === identity,
                            );
                            return (
                              <Avatar
                                key={identity}
                                size="sm"
                                className="h-4 w-4 ring-1 ring-background"
                                title={member?.nickname}
                              >
                                <AvatarImage
                                  src={member?.image || ""}
                                  alt={member?.nickname || ""}
                                />
                                <AvatarFallback className="text-[7px]">
                                  {(member?.nickname || "?")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            );
                          })}
                      </span>
                    )}
                  </p>
                </div>

                <Button
                  size="icon"
                  variant="secondary"
                  className="relative size-7 shrink-0"
                  onClick={() => setChatGroupId(group._id)}
                  aria-label={t("groups.chat")}
                >
                  <MessageSquare className="size-3.5" />
                  {(groupUnreads[group._id] || 0) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                      {Math.min(groupUnreads[group._id], 99)}
                    </span>
                  )}
                </Button>

                <Button
                  size="icon"
                  variant={isCurrent ? "destructive" : "secondary"}
                  className="size-7 shrink-0"
                  disabled={isBusy}
                  onClick={() =>
                    isCurrent
                      ? void voiceDisconnect()
                      : void handleJoinVoice(group)
                  }
                  aria-label={
                    isCurrent ? t("voice.disconnect") : t("groups.join")
                  }
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isCurrent ? (
                    <PhoneOff className="size-3.5" />
                  ) : (
                    <PhoneCall className="size-3.5" />
                  )}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="size-7 shrink-0"
                    >
                      <EllipsisVertical className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setMembersGroupId(group._id)}
                    >
                      <Users className="size-3.5" />
                      {t("groups.members")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setInviteFriendId("");
                        setInviteGroup(group);
                      }}
                    >
                      <UserPlus className="size-3.5" />
                      {t("groups.invite")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!gameInviteTarget}
                      onClick={() => handleInviteToGame(group)}
                    >
                      <Gamepad2 className="size-3.5" />
                      {t("groups.inviteToGame")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => void handleCopyCode(group)}
                    >
                      <Copy className="size-3.5" />
                      {t("groups.copyCode")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void handleCopyInviteLink(group)}
                    >
                      <Link className="size-3.5" />
                      {t("groups.copyLink")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => toggleMuteGroup(group)}>
                      {mutedGroups.includes(group._id) ? (
                        <Bell className="size-3.5" />
                      ) : (
                        <BellOff className="size-3.5" />
                      )}
                      {mutedGroups.includes(group._id)
                        ? t("groups.unmuteNotifications")
                        : t("groups.muteNotifications")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />
                    {group.isOwner ? (
                      <>
                        <DropdownMenuItem
                          onClick={() => {
                            setRenameValue(group.name);
                            setRenameGroup(group);
                          }}
                        >
                          <Pencil className="size-3.5" />
                          {t("groups.rename")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => void handleResetCode(group)}
                        >
                          <KeyRound className="size-3.5" />
                          {t("groups.resetCode")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteGroup(group)}
                        >
                          <Trash2 className="size-3.5" />
                          {t("groups.delete")}
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => void handleLeave(group)}
                      >
                        <DoorOpen className="size-3.5" />
                        {t("groups.leave")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {inviteGroup && (
        <Dialog open onOpenChange={(open) => !open && setInviteGroup(null)}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {t("groups.inviteTitle", { group: inviteGroup.name })}
              </DialogTitle>
            </DialogHeader>
            {invitableFriends.length > 0 ? (
              <Select value={inviteFriendId} onValueChange={setInviteFriendId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("groups.invitePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {invitableFriends.map((friend) => (
                    <SelectItem key={friend.user._id} value={friend.user._id}>
                      {friend.user.nickname}
                      {friend.isOnline ? "" : ` ${t("groups.offline")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("groups.noInvitableFriends")}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteGroup(null)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={!inviteFriendId} onClick={handleSendInvite}>
                <Send className="size-4" />
                {t("groups.invite")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {(() => {
        const chatGroup = chatGroupId
          ? groups.find((item) => item._id === chatGroupId)
          : undefined;
        if (!chatGroup) return null;
        return (
          <GroupChatModal
            group={chatGroup}
            onPlayModpack={onPlayModpack}
            onClose={() => setChatGroupId(null)}
          />
        );
      })()}

      {createOpen && (
        <Dialog open onOpenChange={onCreateOpenChange}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("groups.create")}</DialogTitle>
            </DialogHeader>
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
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onCreateOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!createName.trim()}
                onClick={() => void handleCreate()}
              >
                {t("groups.create")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {joinOpen && (
        <Dialog open onOpenChange={onJoinOpenChange}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("groups.joinByCode")}</DialogTitle>
            </DialogHeader>
            <Input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleJoinByCode();
              }}
              placeholder={t("groups.codePlaceholder")}
              className="font-mono"
              maxLength={9}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => onJoinOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!joinCode.trim()}
                onClick={() => void handleJoinByCode()}
              >
                {t("groups.joinByCode")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {(() => {
        const membersGroup = membersGroupId
          ? groups.find((item) => item._id === membersGroupId)
          : undefined;
        if (!membersGroup) return null;

        return (
          <Dialog
            open
            onOpenChange={(open) => !open && setMembersGroupId(null)}
          >
            <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>
                  {t("groups.membersTitle", { group: membersGroup.name })}
                </DialogTitle>
              </DialogHeader>
              <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
                {membersGroup.members.map((member) => {
                  const isGroupOwner = member._id === membersGroup.owner._id;

                  return (
                    <div
                      key={member._id}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                    >
                      <Avatar size="sm" className="h-7 w-7">
                        <AvatarImage
                          src={member.image || ""}
                          alt={member.nickname}
                        />
                        <AvatarFallback>
                          {member.nickname.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {member.nickname}
                      </p>
                      {isGroupOwner ? (
                        <Crown className="size-3.5 shrink-0 text-primary" />
                      ) : (
                        membersGroup.isOwner && (
                          <span className="flex shrink-0 items-center gap-1">
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-7"
                              onClick={() =>
                                setTransferTarget({
                                  group: membersGroup,
                                  memberId: member._id,
                                  nickname: member.nickname,
                                })
                              }
                              aria-label={t("groups.transferOwner")}
                            >
                              <Crown className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-7"
                              onClick={() =>
                                void handleKickMember(membersGroup, member._id)
                              }
                              aria-label={t("voice.kick")}
                            >
                              <UserX className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="secondary"
                              className="size-7 text-destructive"
                              onClick={() =>
                                void handleBan(membersGroup, member._id)
                              }
                              aria-label={t("groups.ban")}
                            >
                              <Ban className="size-3.5" />
                            </Button>
                          </span>
                        )
                      )}
                    </div>
                  );
                })}

                {membersGroup.isOwner && membersGroup.banned.length > 0 && (
                  <>
                    <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">
                      {t("groups.bannedSection")}
                    </p>
                    {membersGroup.banned.map((banned) => (
                      <div
                        key={banned._id}
                        className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5"
                      >
                        <Avatar size="sm" className="h-7 w-7">
                          <AvatarImage
                            src={banned.image || ""}
                            alt={banned.nickname}
                          />
                          <AvatarFallback>
                            {banned.nickname.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-sm">
                          {banned.nickname}
                        </p>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="size-7 shrink-0"
                          onClick={() =>
                            void handleUnban(membersGroup, banned._id)
                          }
                          aria-label={t("groups.unban")}
                        >
                          <RotateCcw className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {renameGroup && (
        <Dialog open onOpenChange={(open) => !open && setRenameGroup(null)}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("groups.renameTitle")}</DialogTitle>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleRename();
              }}
              maxLength={48}
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameGroup(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={!renameValue.trim()}
                onClick={() => void handleRename()}
              >
                {t("common.save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {transferTarget && (
        <Confirmation
          title={t("groups.transferOwner")}
          onClose={() => setTransferTarget(null)}
          content={[
            {
              text: t("groups.transferConfirm", {
                group: transferTarget.group.name,
                nickname: transferTarget.nickname,
              }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.no"),
              color: "secondary",
              onClick: () => setTransferTarget(null),
            },
            {
              text: t("common.yes"),
              color: "danger",
              onClick: async () => {
                await handleTransferOwner(
                  transferTarget.group,
                  transferTarget.memberId,
                );
                setTransferTarget(null);
              },
            },
          ]}
        />
      )}

      {deleteGroup && (
        <Confirmation
          title={t("groups.delete")}
          onClose={() => setDeleteGroup(null)}
          content={[
            {
              text: t("groups.deleteConfirm", { name: deleteGroup.name }),
              color: "warning",
            },
          ]}
          buttons={[
            {
              text: t("common.no"),
              color: "secondary",
              onClick: () => setDeleteGroup(null),
            },
            {
              text: t("common.yes"),
              color: "danger",
              onClick: () => handleDelete(),
            },
          ]}
        />
      )}
    </div>
  );
}
