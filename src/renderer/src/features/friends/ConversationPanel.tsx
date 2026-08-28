import { useCallback, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { Socket } from "socket.io-client";
import { Boxes, PhoneCall, Play, Send, User, Users, X } from "lucide-react";
import {
  HeadDot,
  PlayerHead,
  accountFace,
  userFace,
} from "@renderer/features/accounts/AccountHead";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ILocalAccount } from "@/types/Account";
import type { IModpack } from "@/types/Backend";
import type { IGroup } from "@/types/Voice";
import type { Version } from "@renderer/classes/Version";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import {
  parseGroupJoinCode,
  parsePackShareCode,
} from "@renderer/utilities/packShare";
import { groupInitials } from "@renderer/features/voice/groupList";
import { LoaderLabel } from "@renderer/components/Loaders";
import { ChatSurface, type SenderView } from "./ChatSurface";
import { useDirectChat } from "./useDirectChat";
import { canJoinFriend, presenceDotColor } from "./presence";
import { isDmRoomWith } from "./voiceRoom";
import { PlatformIcon } from "./PlatformIcon";
import type { FriendEntry } from "./friendsList";

const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;

interface ConversationPanelProps {
  entry: FriendEntry;
  socket?: Socket;
  account?: ILocalAccount;
  ownUserId?: string;
  isConnected: boolean;
  isGameRunning: boolean;
  isCallBusy: boolean;
  voiceRoomId?: string;
  unreadAtOpen: number;
  groups: IGroup[];
  shareableVersions: Version[];
  versionsByShareCode: Map<string, Version>;
  presenceText: string;
  isPeerTyping: boolean;
  onTyping: (friendId: string) => void;
  onStopTyping: (friendId: string) => void;
  onJoin: () => void;
  onInvite: () => void;
  onStartCall: () => void;
  onViewProfile: () => void;
  onClose: () => void;
  onPlayModpack: (modpack: IModpack, version?: Version) => void;
  onAcceptGroupInvite: (code: string) => void;
  t: TFunction;
}

export function ConversationPanel({
  entry,
  socket,
  account,
  ownUserId,
  isConnected,
  isGameRunning,
  isCallBusy,
  voiceRoomId,
  unreadAtOpen,
  groups,
  shareableVersions,
  versionsByShareCode,
  presenceText,
  isPeerTyping,
  onTyping,
  onStopTyping,
  onJoin,
  onInvite,
  onStartCall,
  onViewProfile,
  onClose,
  onPlayModpack,
  onAcceptGroupInvite,
  t,
}: ConversationPanelProps) {
  const { friend, presence } = entry;
  const [isVersionPicker, setIsVersionPicker] = useState(false);
  const [isGroupPicker, setIsGroupPicker] = useState(false);

  const chat = useDirectChat({
    friendId: friend.user._id,
    socket,
    account,
    ownUserId,
    isConnected,
    onTyping,
    onStopTyping,
  });

  const resolveSender = useCallback(
    (senderId: string): SenderView =>
      senderId === ownUserId && account
        ? accountFace(account)
        : userFace(friend.user),
    [account, friend.user, ownUserId],
  );

  const handleSend = useCallback(() => {
    const text = chat.messageText.trim();
    if (!text) return;

    const groupCode = parseGroupJoinCode(text);
    if (groupCode) {
      const sent = chat.sendBody({
        _type: "groupInvite",
        value: JSON.stringify({
          code: groupCode,
          name: groups.find((group) => group.code === groupCode)?.name ?? "",
        }),
      });
      if (sent) chat.setMessageText("");
      return;
    }

    const parsed = parsePackShareCode(text);
    const isPack = parsed !== text && PACK_CODE_PATTERN.test(parsed);

    const sent = chat.sendBody({
      _type: isPack ? "modpack" : "text",
      value: isPack ? parsed : text,
    });
    if (sent) chat.setMessageText("");
  }, [chat, groups]);

  const canJoin = canJoinFriend(presence, isGameRunning);
  const canInvite = friend.isOnline && isGameRunning && !canJoin;
  const isCallDisabled =
    isCallBusy || isDmRoomWith(voiceRoomId, ownUserId, friend.user._id);

  const header = useMemo(
    () => (
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-3">
        <PlayerHead
          user={friend.user}
          size={36}
          badge={<HeadDot className={presenceDotColor(presence.kind)} />}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-sm font-medium">
              {friend.user.nickname}
            </p>
            <span className="shrink-0 text-faint">
              <PlatformIcon platform={friend.user.platform} />
            </span>
          </div>
          <p
            className={cn(
              "min-w-0 truncate text-[11px] leading-4",
              isPeerTyping ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {isPeerTyping ? t("friends.chatTyping") : presenceText}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canJoin && (
            <Button size="sm" className="h-8" onClick={onJoin}>
              <Play className="size-3.5" />
              {t("friends.joinFlow.playAction")}
            </Button>
          )}
          {canInvite && (
            <Button size="sm" variant="outline" className="h-8" onClick={onInvite}>
              <Send className="size-3.5" />
              {t("friends.invite")}
            </Button>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={!friend.isOnline || isCallDisabled}
                aria-label={t("voiceCall.start")}
                onClick={onStartCall}
              >
                <PhoneCall className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("voiceCall.start")}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t("accountInfo.viewAccount")}
                onClick={onViewProfile}
              >
                <User className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("accountInfo.viewAccount")}</TooltipContent>
          </Tooltip>

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    ),
    [
      canInvite,
      canJoin,
      friend.isOnline,
      friend.user,
      isCallDisabled,
      isPeerTyping,
      onClose,
      onInvite,
      onJoin,
      onStartCall,
      onViewProfile,
      presence.kind,
      presenceText,
      t,
    ],
  );

  return (
    <>
      <ChatSurface
        entries={chat.entries}
        header={header}
        resolveSender={resolveSender}
        isLoadingHistory={chat.isLoadingHistory}
        isLoadingEarlier={chat.isLoadingEarlier}
        hasMoreHistory={chat.hasMoreHistory}
        historyError={chat.historyError}
        onReloadHistory={chat.reloadHistory}
        onLoadEarlier={chat.loadEarlier}
        readReceiptKey={chat.readReceiptKey}
        isSending={chat.isUploading}
        isOffline={!isConnected}
        unreadCount={unreadAtOpen}
        messageText={chat.messageText}
        replyMessage={chat.replyMessage}
        imageUploadProgress={chat.imageUploadProgress}
        modpacks={chat.modpacks}
        failedModpacks={chat.failedModpacks}
        goneModpacks={chat.goneModpacks}
        versionsByShareCode={versionsByShareCode}
        canAttachImage={Boolean(account?.accessToken)}
        canAttachModpack={shareableVersions.length > 0}
        emptyHint={t("friends.chatEmptyHint", {
          nickname: friend.user.nickname,
        })}
        onMessageChange={chat.setMessageText}
        onSend={handleSend}
        onSendImageFile={chat.sendImageFile}
        onReply={chat.setReplyMessage}
        onCancelReply={() => chat.setReplyMessage(null)}
        onDeleteMessage={chat.deleteMessage}
        onToggleReaction={chat.toggleReaction}
        onOpenVersionSelect={() => setIsVersionPicker(true)}
        onOpenGroupInvite={
          groups.length > 0 ? () => setIsGroupPicker(true) : undefined
        }
        onAcceptGroupInvite={onAcceptGroupInvite}
        onPlayModpack={onPlayModpack}
        onRetryModpack={chat.retryModpack}
        onRetry={chat.retry}
        onDiscard={chat.discard}
      />

      <Dialog
        open={isVersionPicker}
        onOpenChange={(open) => !open && setIsVersionPicker(false)}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <Boxes className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("friends.shareBuildTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("friends.chatAttachModpackHint")}
            </DialogDescription>

            {shareableVersions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                {t("friends.noPublishedBuilds")}
              </p>
            ) : (
              <ScrollArea className="-mx-1 max-h-72 px-1">
                <div className="flex flex-col gap-0.5">
                  {shareableVersions.map((version) => (
                    <button
                      key={version.version.shareCode}
                      type="button"
                      className="flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-surface-3"
                      onClick={() => {
                        const code = version.version.shareCode;
                        if (code) {
                          chat.sendBody({ _type: "modpack", value: code });
                        }
                        setIsVersionPicker(false);
                      }}
                    >
                      {version.version.image && (
                        <img
                          src={resolveLocalImage(version.version.image)}
                          alt=""
                          className="size-8 shrink-0 rounded-md object-cover"
                          width={32}
                          height={32}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {version.version.name}
                      </span>
                      <LoaderLabel
                        loader={version.version.loader.name}
                        className="shrink-0 text-[11px] text-muted-foreground"
                      />
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                        {version.version.version.id}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isGroupPicker}
        onOpenChange={(open) => !open && setIsGroupPicker(false)}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
          <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
            <Users className="size-4 shrink-0 text-faint" />
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("friends.chatGroupInvite")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-2 px-4 py-3">
            <DialogDescription className="text-xs leading-4">
              {t("friends.chatGroupInviteHint")}
            </DialogDescription>

            <ScrollArea className="-mx-1 max-h-72 px-1">
              <div className="flex flex-col gap-0.5">
                {groups.map((group) => (
                  <button
                    key={group._id}
                    type="button"
                    className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-3"
                    onClick={() => {
                      chat.sendBody({
                        _type: "groupInvite",
                        value: JSON.stringify({
                          code: group.code,
                          name: group.name,
                        }),
                      });
                      setIsGroupPicker(false);
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[10px] font-semibold text-muted-foreground">
                      {groupInitials(group.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {group.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
                      <Users className="size-3" />
                      <span className="font-mono tabular-nums">
                        {group.members.length}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
