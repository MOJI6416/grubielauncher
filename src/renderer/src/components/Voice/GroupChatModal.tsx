import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Boxes,
  Headphones,
  Loader2,
  LogIn,
  Settings2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@renderer/components/Hint";
import { LoaderLabel } from "@renderer/components/Loaders";
import { resolveLocalImage } from "@renderer/utilities/localMedia";
import type { IGroup, IGroupUser } from "@/types/Voice";
import type { IModpack } from "@/types/Backend";
import type { Version } from "@renderer/classes/Version";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  groupUnreadsAtom,
  groupsAtom,
  isFriendsConnectedAtom,
  openGroupChatIdAtom,
  saveGroupUnreads,
  versionsAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";
import { useFaceLookup } from "@renderer/features/accounts/faceDirectory";
import {
  ChatSurface,
  type SenderView,
} from "@renderer/features/friends/ChatSurface";
import { groupInitials } from "@renderer/features/voice/groupList";
import { voiceJoinErrorKey } from "@renderer/features/voice/errors";
import { groupPanelIdAtom } from "@renderer/features/voice/state";
import { useGroupChat } from "@renderer/features/voice/useGroupChat";
import {
  parseGroupJoinCode,
  parsePackShareCode,
} from "@renderer/utilities/packShare";
import { reportGroupJoinFailure } from "@renderer/utilities/groupJoin";
import { voiceConnect, voiceDisconnect } from "@renderer/utilities/voiceClient";
import { showFailureToast } from "@renderer/utilities/failures";

const api = window.api;
const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;

export function GroupChatModal({
  group,
  onPlayModpack,
  onClose,
}: {
  group: IGroup;
  onPlayModpack: (modpack: IModpack, version?: Version) => void | Promise<void>;
  onClose: () => void;
}) {
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const socket = useAtomValue(friendSocketAtom);
  const isConnected = useAtomValue(isFriendsConnectedAtom);
  const versions = useAtomValue(versionsAtom);
  const groups = useAtomValue(groupsAtom);
  const session = useAtomValue(voiceSessionMetaAtom);
  const setGroupUnreads = useSetAtom(groupUnreadsAtom);
  const setPanelGroupId = useSetAtom(groupPanelIdAtom);
  const setOpenGroupChatId = useSetAtom(openGroupChatIdAtom);
  const { t } = useTranslation();

  const [isVersionSelect, setVersionSelect] = useState(false);
  const [isGroupPicker, setGroupPicker] = useState(false);
  const [isJoiningVoice, setJoiningVoice] = useState(false);

  const chat = useGroupChat({
    groupId: group._id,
    socket,
    account,
    ownUserId: authData?.sub,
    isConnected,
  });

  useEffect(
    () => () => {
      setOpenGroupChatId(null);
    },
    [setOpenGroupChatId],
  );

  useEffect(() => {
    setGroupUnreads((prev) => {
      if (!prev[group._id]) return prev;
      const next = { ...prev };
      delete next[group._id];
      saveGroupUnreads(next);
      return next;
    });
  }, [group._id, chat.entries.length, setGroupUnreads]);

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

  const membersById = useMemo(() => {
    const map = new Map<string, IGroupUser>();
    for (const member of group.members) map.set(member._id, member);
    for (const banned of group.banned) {
      if (!map.has(banned._id)) map.set(banned._id, banned);
    }
    return map;
  }, [group.banned, group.members]);

  const faceOf = useFaceLookup();

  const resolveSender = useCallback(
    (senderId: string): SenderView => {
      const member = membersById.get(senderId);
      return faceOf({
        _id: senderId,
        nickname: member?.nickname || t("groups.formerMember"),
      });
    },
    [faceOf, membersById, t],
  );

  const isActiveRoom =
    session.state !== "disconnected" && session.roomId === group._id;
  const voiceCount = Math.max(
    group.participantCount ?? 0,
    group.voiceParticipants?.length ?? 0,
  );

  const handleJoinVoice = async () => {
    setJoiningVoice(true);
    try {
      const grant = await api.backend.groupJoinVoice(
        account?.accessToken || "",
        group._id,
      );
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
      setJoiningVoice(false);
    }
  };

  const handleSend = useCallback(() => {
    const text = chat.messageText.trim();
    if (!text) return;

    const joinCode = parseGroupJoinCode(text);
    if (joinCode) {
      const sent = chat.sendBody({
        _type: "groupInvite",
        value: JSON.stringify({
          code: joinCode,
          name: groups.find((item) => item.code === joinCode)?.name ?? "",
        }),
      });
      if (sent) chat.setMessageText("");
      return;
    }

    const shareCode = parsePackShareCode(text);
    const isPack = PACK_CODE_PATTERN.test(shareCode);

    const sent = chat.sendBody({
      _type: isPack ? "modpack" : "text",
      value: isPack ? shareCode : chat.messageText,
    });
    if (sent) chat.setMessageText("");
  }, [chat, groups]);

  const handleAcceptGroupInvite = useCallback(
    async (code: string) => {
      const token = account?.accessToken;
      if (!token) return;
      const joined = await api.backend.groupJoinByCode(token, code);
      if (!joined || typeof joined === "string") {
        reportGroupJoinFailure(joined ?? null, t);
      } else {
        toast.success(t("groups.joined", { group: joined.name }));
      }
    },
    [account?.accessToken, t],
  );

  const header = (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-xs font-semibold text-muted-foreground">
        {groupInitials(group.name)}
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        <Hint content={group.name} variant="text" truncatedOnly>
          <p className="min-w-0 truncate text-sm font-medium">{group.name}</p>
        </Hint>
        <p className="flex min-w-0 items-center gap-1 truncate text-[11px] leading-4 text-muted-foreground">
          <span>
            {t("groups.membersCount", { count: group.members.length })}
          </span>
          {voiceCount > 0 && (
            <>
              <span className="text-faint">·</span>
              <span className="text-success">
                {t("voice.inVoiceCount", { count: voiceCount })}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isActiveRoom ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-destructive"
            onClick={() => void voiceDisconnect()}
          >
            <Headphones className="size-3.5" />
            {t("voice.leaveShort")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={isJoiningVoice}
            onClick={() => void handleJoinVoice()}
          >
            {isJoiningVoice ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogIn className="size-3.5" />
            )}
            {t("groups.join")}
          </Button>
        )}

        <Hint content={t("groups.manage")}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("groups.manage")}
            onClick={() => setPanelGroupId(group._id)}
          >
            <Settings2 className="size-4" />
          </Button>
        </Hint>

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
        isSending={chat.isUploading}
        isOffline={!isConnected}
        messageText={chat.messageText}
        replyMessage={chat.replyMessage}
        imageUploadProgress={chat.imageUploadProgress}
        modpacks={chat.modpacks}
        failedModpacks={chat.failedModpacks}
        goneModpacks={chat.goneModpacks}
        onRetryModpack={chat.retryModpack}
        versionsByShareCode={versionsByShareCode}
        canAttachImage={Boolean(account?.accessToken)}
        canAttachModpack={shareableVersions.length > 0}
        emptyHint={t("groups.chatEmptyHint", { name: group.name })}
        onMessageChange={chat.setMessageText}
        onSend={handleSend}
        onSendImageFile={chat.sendImageFile}
        onReply={chat.setReplyMessage}
        onCancelReply={() => chat.setReplyMessage(null)}
        onDeleteMessage={chat.deleteMessage}
        onToggleReaction={chat.toggleReaction}
        onOpenVersionSelect={() => setVersionSelect(true)}
        onOpenGroupInvite={
          groups.length > 0 ? () => setGroupPicker(true) : undefined
        }
        onAcceptGroupInvite={handleAcceptGroupInvite}
        onPlayModpack={(modpack, version) =>
          void onPlayModpack(modpack, version)
        }
        onRetry={chat.retry}
        onDiscard={chat.discard}
      />

      <Dialog open={isVersionSelect} onOpenChange={setVersionSelect}>
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

            <ScrollArea className="-mx-1 max-h-72 px-1">
              <div className="flex flex-col gap-0.5">
                {shareableVersions.map((version) => (
                  <button
                    key={version.version.name}
                    type="button"
                    className="flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-surface-3"
                    onClick={() => {
                      const shareCode = version.version.shareCode;
                      if (!shareCode) return;
                      if (
                        !chat.sendBody({
                          _type: "modpack",
                          value: shareCode,
                        })
                      ) {
                        toast.error(t("friends.chatFailed"), {
                          description: t("friends.chatOffline"),
                        });
                        return;
                      }
                      setVersionSelect(false);
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isGroupPicker} onOpenChange={setGroupPicker}>
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
                {groups.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className="flex h-11 min-w-0 items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-3"
                    onClick={() => {
                      const sent = chat.sendBody({
                        _type: "groupInvite",
                        value: JSON.stringify({
                          code: item.code,
                          name: item.name,
                        }),
                      });
                      if (!sent) {
                        toast.error(t("friends.chatFailed"), {
                          description: t("friends.chatOffline"),
                        });
                        return;
                      }
                      setGroupPicker(false);
                    }}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[10px] font-semibold text-muted-foreground">
                      {groupInitials(item.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {item.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-faint">
                      <Users className="size-3" />
                      <span className="font-mono tabular-nums">
                        {item.members.length}
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
