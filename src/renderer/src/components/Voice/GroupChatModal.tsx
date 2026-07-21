import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  groupUnreadsAtom,
  groupsAtom,
  saveGroupUnreads,
  openGroupChatIdAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IGroup } from "@/types/Voice";
import { IMessage } from "@/types/IMessage";
import { IModpack } from "@/types/Backend";
import { Version } from "@renderer/classes/Version";
import {
  parseGroupJoinCode,
  parsePackShareCode,
} from "@renderer/utilities/packShare";
import { uploadChatImage } from "@renderer/utilities/chatUpload";
import { groupJoinErrorKey } from "@renderer/utilities/groupJoin";
import type { LoadingType } from "../Friends/Friends";

const ChatModal = lazy(() =>
  import("../Friends/ChatModal").then((module) => ({
    default: module.ChatModal,
  })),
);

const api = window.api;
const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;
const REPLY_PREVIEW_LIMIT = 240;

export function GroupChatModal({
  group,
  onPlayModpack,
  onClose,
}: {
  group: IGroup;
  onPlayModpack: (modpack: IModpack, version?: Version) => void | Promise<void>;
  onClose: () => void;
}) {
  const [account] = useAtom(accountAtom);
  const [authData] = useAtom(authDataAtom);
  const [socket] = useAtom(friendSocketAtom);
  const [versions] = useAtom(versionsAtom);
  const [groups] = useAtom(groupsAtom);
  const setOpenGroupChatId = useSetAtom(openGroupChatIdAtom);
  const setGroupUnreads = useSetAtom(groupUnreadsAtom);
  const { t } = useTranslation();

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadingType, setLoadingType] = useState<LoadingType | undefined>(
    "messages",
  );
  const [imageUploadProgress, setImageUploadProgress] = useState<
    number | null
  >(null);
  const [replyMessage, setReplyMessage] = useState<IMessage | null>(null);
  const [chatModpacks, setChatModpacks] = useState<IModpack[]>([]);
  const [failedChatModpacks, setFailedChatModpacks] = useState<Set<string>>(
    new Set(),
  );
  const [isVersionSelect, setIsVersionSelect] = useState(false);
  const [isGroupInvitePicker, setIsGroupInvitePicker] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const replyMessageRef = useRef<IMessage | null>(null);
  replyMessageRef.current = replyMessage;

  const shareableVersions = useMemo(
    () => versions.filter((v) => v.version.shareCode),
    [versions],
  );

  const membersById = useMemo(() => {
    const map = new Map<string, { nickname: string; image?: string | null }>();
    for (const member of group.members) {
      map.set(member._id, {
        nickname: member.nickname,
        image: member.image ?? null,
      });
    }
    return map;
  }, [group.members]);

  const resolveSenderById = useCallback(
    (senderId: string) => {
      const member = membersById.get(senderId);
      return {
        nickname: member?.nickname || "?",
        image: member?.image ?? null,
      };
    },
    [membersById],
  );

  useEffect(() => {
    setOpenGroupChatId(group._id);
    setGroupUnreads((prev) => {
      if (!prev[group._id]) return prev;
      const next = { ...prev };
      delete next[group._id];
      saveGroupUnreads(next);
      return next;
    });

    return () => {
      setOpenGroupChatId(null);
    };
  }, [group._id, setGroupUnreads, setOpenGroupChatId]);

  useEffect(() => {
    if (!socket) return;

    const onMessages = (data: { groupId: string; messages: IMessage[] }) => {
      if (data.groupId !== group._id) return;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setIsLoading(false);
      setLoadingType(undefined);
    };

    const onMessage = (data: { groupId: string; message: IMessage }) => {
      if (data.groupId !== group._id || !data.message) return;
      setMessages((prev) => [...prev, data.message]);
      if (data.message.sender === authData?.sub) {
        setIsLoading(false);
        setLoadingType(undefined);
      }
    };

    const onDeleted = (data: { groupId: string; messageId: string }) => {
      if (data.groupId !== group._id) return;
      setMessages((prev) =>
        prev.filter((message) => message.id !== data.messageId),
      );
    };

    const onReaction = (data: {
      groupId: string;
      messageId: string;
      reactions: IMessage["reactions"];
    }) => {
      if (data.groupId !== group._id) return;
      setMessages((prev) =>
        prev.map((message) =>
          message.id === data.messageId
            ? { ...message, reactions: data.reactions ?? [] }
            : message,
        ),
      );
    };

    socket.on("groupMessages", onMessages);
    socket.on("groupMessage", onMessage);
    socket.on("groupMessageDeleted", onDeleted);
    socket.on("groupMessageReaction", onReaction);

    setIsLoading(true);
    setLoadingType("messages");
    socket.emit("getGroupMessages", { groupId: group._id });

    return () => {
      socket.off("groupMessages", onMessages);
      socket.off("groupMessage", onMessage);
      socket.off("groupMessageDeleted", onDeleted);
      socket.off("groupMessageReaction", onReaction);
    };
  }, [socket, group._id, authData?.sub]);

  useEffect(() => {
    const knownIds = new Set(chatModpacks.map((modpack) => modpack._id));
    const wantedIds = [
      ...new Set(
        messages
          .filter((message) => message.message?._type === "modpack")
          .map((message) => String(message.message.value)),
      ),
    ].filter((id) => !knownIds.has(id) && !failedChatModpacks.has(id));

    if (wantedIds.length === 0) return;

    let cancelled = false;
    void (async () => {
      for (const id of wantedIds) {
        const result = await api.backend.getModpack(
          account?.accessToken || "",
          id,
        );
        if (cancelled) return;
        if (result?.data) {
          setChatModpacks((prev) =>
            prev.some((modpack) => modpack._id === id)
              ? prev
              : [...prev, result.data as IModpack],
          );
        } else {
          setFailedChatModpacks((prev) => new Set(prev).add(id));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, chatModpacks, failedChatModpacks, account?.accessToken]);

  const getReplyPreview = useCallback((message: IMessage | null) => {
    if (!message?.id) return undefined;
    const value =
      typeof message.message?.value === "string"
        ? message.message.value.slice(0, REPLY_PREVIEW_LIMIT)
        : "";
    if (!value) return undefined;

    return {
      id: message.id,
      sender: message.sender,
      type: message.message._type,
      value,
    };
  }, []);

  const sendChatMessage = useCallback(
    (body: IMessage["message"]) => {
      if (!authData || !socket || !body.value.trim()) return false;

      const replyTo = getReplyPreview(replyMessageRef.current);
      const message: IMessage = {
        sender: authData.sub,
        message: body,
        ...(replyTo ? { replyTo } : {}),
        time: new Date(),
      };

      socket.emit("sendGroupMessage", {
        groupId: group._id,
        message,
      });

      setReplyMessage(null);
      return true;
    },
    [authData, socket, group._id, getReplyPreview],
  );

  const handleSendMessage = useCallback(() => {
    const text = messageText.trim();
    if (!text) return;

    const groupJoinCode = parseGroupJoinCode(text);
    if (groupJoinCode) {
      if (
        sendChatMessage({
          _type: "groupInvite",
          value: JSON.stringify({
            code: groupJoinCode,
            name: groups.find((g) => g.code === groupJoinCode)?.name ?? "",
          }),
        })
      ) {
        setMessageText("");
      }
      return;
    }

    const parsedShareCode = parsePackShareCode(text);
    const isPackShare = PACK_CODE_PATTERN.test(parsedShareCode);

    if (
      sendChatMessage({
        _type: isPackShare ? "modpack" : "text",
        value: isPackShare ? parsedShareCode : messageText,
      })
    ) {
      setMessageText("");
    }
  }, [groups, messageText, sendChatMessage]);

  const handleSendImageFile = useCallback(
    async (file: File) => {
      if (!account?.accessToken || !authData?.sub) return;

      setIsLoading(true);
      setLoadingType("imageUpload");
      setImageUploadProgress(0);

      try {
        const safeName = (file.name || "image.png").trim() || "image.png";
        const url = await uploadChatImage({
          accessToken: account.accessToken,
          file,
          folder: `chat/${authData.sub}`,
          fileName: `chat_${Date.now()}_${safeName}`,
          onProgress: setImageUploadProgress,
        });
        sendChatMessage({ _type: "image", value: url });
      } catch {
        toast.error(t("friends.chatImageUploadError"));
      } finally {
        setIsLoading(false);
        setLoadingType(undefined);
        setImageUploadProgress(null);
      }
    },
    [account?.accessToken, authData?.sub, sendChatMessage, t],
  );

  const handleDeleteMessage = useCallback(
    (message: IMessage) => {
      if (!socket || !message.id) return;
      socket.emit("deleteGroupMessage", {
        groupId: group._id,
        messageId: message.id,
      });
    },
    [socket, group._id],
  );

  const handleToggleReaction = useCallback(
    (message: IMessage, emoji: string) => {
      if (!socket || !message.id) return;
      socket.emit("groupMessageReaction", {
        groupId: group._id,
        messageId: message.id,
        emoji,
      });
    },
    [socket, group._id],
  );

  const handleAcceptGroupInvite = useCallback(
    async (code: string) => {
      const token = account?.accessToken;
      if (!token) return;
      const joined = await api.backend.groupJoinByCode(token, code);
      if (!joined || typeof joined === "string") {
        toast.error(t(groupJoinErrorKey(joined ?? null)));
      } else {
        toast.success(t("groups.joined", { group: joined.name }));
      }
    },
    [account?.accessToken, t],
  );

  const handleSendGroupInvite = useCallback(
    (target: IGroup) => {
      sendChatMessage({
        _type: "groupInvite",
        value: JSON.stringify({ code: target.code, name: target.name }),
      });
      setIsGroupInvitePicker(false);
    },
    [sendChatMessage],
  );

  return (
    <>
      <Suspense fallback={null}>
        <ChatModal
        groupTitle={group.name}
        showSenderNames
        resolveSenderById={resolveSenderById}
        messages={messages}
        messageText={messageText}
        isLoading={isLoading}
        loadingType={loadingType}
        loadingIndex={-1}
        imageUploadProgress={imageUploadProgress}
        replyMessage={replyMessage}
        chatModpacks={chatModpacks}
        failedChatModpacks={failedChatModpacks}
        versions={versions}
        shareableVersions={shareableVersions}
        messagesRef={messagesRef}
        messageInputRef={messageInputRef}
        account={account}
        onClose={onClose}
        onMessageChange={setMessageText}
        onSendMessage={handleSendMessage}
        onSendImageFile={handleSendImageFile}
        onReplyToMessage={setReplyMessage}
        onCancelReply={() => setReplyMessage(null)}
        onDeleteMessage={handleDeleteMessage}
        onToggleReaction={handleToggleReaction}
        onOpenVersionSelect={() => setIsVersionSelect(true)}
        onPlayModpack={(modpack, version) => {
          onClose();
          void onPlayModpack(modpack, version);
        }}
        onSendGroupInvite={() => setIsGroupInvitePicker(true)}
        onAcceptGroupInvite={handleAcceptGroupInvite}
          t={t}
        />
      </Suspense>

      {isVersionSelect && (
        <Dialog open onOpenChange={(open) => !open && setIsVersionSelect(false)}>
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("friends.chatAttachModpack")}</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {shareableVersions.map((version) => (
                <Button
                  key={version.version.name}
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    const shareCode = version.version.shareCode;
                    if (shareCode) {
                      sendChatMessage({ _type: "modpack", value: shareCode });
                    }
                    setIsVersionSelect(false);
                  }}
                >
                  {version.version.name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isGroupInvitePicker && (
        <Dialog
          open
          onOpenChange={(open) => !open && setIsGroupInvitePicker(false)}
        >
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("friends.chatGroupInvite")}</DialogTitle>
            </DialogHeader>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {groups.map((item) => (
                <Button
                  key={item._id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleSendGroupInvite(item)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
