import React, { useCallback, useEffect, useMemo } from "react";
import { IModpack } from "@/types/Backend";
import { IFriend } from "@/types/IFriend";
import { IMessage } from "@/types/IMessage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CircleAlert,
  Gamepad2,
  ImagePlus,
  Loader2,
  Package,
  Paperclip,
  Reply,
  SendHorizontal,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import { LoadingType } from "./Friends";
import { Version } from "@renderer/classes/Version";
import { formatDate } from "@renderer/utilities/date";
import { ILocalAccount } from "@/types/Account";
import { authDataAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { cn } from "@/lib/utils";

const api = window.api;
const LINK_PATTERN = /(https?:\/\/[^\s]+)/gi;
const IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;
const EMOJI_FONT_STYLE: React.CSSProperties = {
  fontFamily:
    '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
  lineHeight: 1,
};
const CHAT_REACTION_EMOJIS = [
  "👍",
  "👎",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🎉",
  "🔥",
  "👏",
  "🙏",
  "😍",
  "😭",
  "🤔",
  "👀",
  "💀",
  "✨",
];

function isImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

interface ChatModalProps {
  friend: IFriend;
  messages: IMessage[];
  messageText: string;
  isLoading: boolean;
  loadingType?: LoadingType;
  loadingIndex: number;
  imageUploadProgress?: number | null;
  replyMessage?: IMessage | null;
  chatModpacks: IModpack[];
  failedChatModpacks: Set<string>;
  versions: Version[];
  shareableVersions: Version[];
  messagesRef: React.RefObject<HTMLDivElement | null>;
  messageInputRef: React.RefObject<HTMLInputElement | null>;
  account: ILocalAccount | undefined;
  onClose: () => void;
  onMessageChange: (text: string) => void;
  onSendMessage: () => void;
  onSendImageFile: (file: File) => void | Promise<void>;
  onReplyToMessage: (message: IMessage) => void;
  onCancelReply: () => void;
  onDeleteMessage: (message: IMessage) => void;
  onToggleReaction: (message: IMessage, emoji: string) => void;
  onOpenVersionSelect: () => void;
  onPlayModpack: (modpack: IModpack, version?: Version) => void;
  t: any;
}

type SenderView = { nickname: string; image?: string | null };

export function ChatModal({
  friend,
  messages,
  messageText,
  isLoading,
  loadingType,
  loadingIndex,
  imageUploadProgress,
  replyMessage,
  chatModpacks,
  failedChatModpacks,
  versions,
  shareableVersions,
  messagesRef,
  messageInputRef,
  account,
  onClose,
  onMessageChange,
  onSendMessage,
  onSendImageFile,
  onReplyToMessage,
  onCancelReply,
  onDeleteMessage,
  onToggleReaction,
  onOpenVersionSelect,
  onPlayModpack,
  t,
}: ChatModalProps) {
  const isBusy =
    isLoading &&
    (loadingType === "messageSend" ||
      loadingType === "imageUpload" ||
      loadingType === "messages");
  const canSend = messageText.trim().length > 0 && !isBusy;
  const canAttachModpack = shareableVersions.length > 0 && !isBusy;
  const canAttachImage = Boolean(account?.accessToken) && !isBusy;
  const canOpenAttachments = canAttachModpack || canAttachImage;
  const canUseMessageActions = !isBusy;
  const [authData] = useAtom(authDataAtom);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = React.useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] =
    React.useState<string | null>(null);
  const pendingReactionScrollIdRef = React.useRef<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragDepthRef = React.useRef(0);
  const scrollTimerRef = React.useRef<number | null>(null);
  const highlightTimerRef = React.useRef<number | null>(null);
  const messageNodeRefs = React.useRef(new Map<string, HTMLDivElement>());
  const setMessagesScrollAreaRef = useCallback(
    (node: HTMLDivElement | null) => {
      const viewport = node?.querySelector<HTMLDivElement>(
        '[data-slot="scroll-area-viewport"]',
      );

      (messagesRef as React.MutableRefObject<HTMLDivElement | null>).current =
        viewport ?? null;
    },
    [messagesRef],
  );
  const setMessageInputContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      (messageInputRef as React.MutableRefObject<HTMLElement | null>).current =
        node;
    },
    [messageInputRef],
  );

  const setMessageNodeRef = useCallback(
    (messageId?: string) => (node: HTMLDivElement | null) => {
      if (!messageId) return;

      if (node) {
        messageNodeRefs.current.set(messageId, node);
      } else {
        messageNodeRefs.current.delete(messageId);
      }
    },
    [],
  );

  const handleReactionPickerWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY || event.deltaX;
      event.currentTarget.scrollLeft += delta;
    },
    [],
  );

  const modpackById = useMemo(() => {
    const map = new Map<string, IModpack>();
    for (const mp of chatModpacks) map.set(mp._id, mp);
    return map;
  }, [chatModpacks]);

  const versionByShareCode = useMemo(() => {
    const map = new Map<string, Version>();
    for (const v of versions) {
      const code = v?.version?.shareCode;
      if (code) map.set(code, v);
    }
    return map;
  }, [versions]);

  const resolveSender = useCallback(
    (msg: IMessage): SenderView => {
      if (account && msg.sender === authData?.sub)
        return { nickname: account.nickname, image: account.image };
      return { nickname: friend.user.nickname, image: friend.user.image };
    },
    [account, authData?.sub, friend.user.image, friend.user.nickname],
  );

  const scrollToBottom = useCallback(() => {
    if (!messagesRef.current) return;
    const el = messagesRef.current;

    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight });
    });

    if (scrollTimerRef.current) {
      window.clearTimeout(scrollTimerRef.current);
    }

    scrollTimerRef.current = window.setTimeout(() => {
      if (!messagesRef.current) return;
      messagesRef.current.scrollTo({ top: messagesRef.current.scrollHeight });
    }, 80);
  }, [messagesRef]);

  const scrollToMessage = useCallback((messageId: string) => {
    const node = messageNodeRefs.current.get(messageId);
    if (!node) return;

    node.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightedMessageId(messageId);

    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }

    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimerRef.current = null;
    }, 1600);
  }, []);

  useEffect(() => {
    scrollToBottom();

    return () => {
      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = null;
      }
    };
  }, [chatModpacks.length, loadingIndex, messages.length, scrollToBottom]);

  useEffect(() => {
    const messageId = pendingReactionScrollIdRef.current;
    if (!messageId) return;

    pendingReactionScrollIdRef.current = null;
    requestAnimationFrame(() => {
      const node = messageNodeRefs.current.get(messageId);
      node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [messages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      if (!messageText.trim()) return;
      if (isBusy) return;
      onSendMessage();
    },
    [isBusy, messageText, onSendMessage],
  );
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      const imageFile = Array.from(event.clipboardData.files).find(isImageFile);

      if (!imageFile) return;
      event.preventDefault();
      void onSendImageFile(imageFile);
    },
    [onSendImageFile],
  );

  const getMessagePreviewText = useCallback(
    (message: IMessage | NonNullable<IMessage["replyTo"]>) => {
      const type = "message" in message ? message.message._type : message.type;
      const value =
        "message" in message ? message.message.value : message.value;

      if (type === "image") return t("friends.chatImage");
      if (type === "modpack") return t("friends.chatAttachModpack");
      return value;
    },
    [t],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";
      if (!file || !isImageFile(file)) return;
      void onSendImageFile(file);
    },
    [onSendImageFile],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;
      if (
        !Array.from(event.dataTransfer.items).some(
          (item) => item.kind === "file",
        )
      ) {
        return;
      }

      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingImage(true);
    },
    [canAttachImage],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [canAttachImage],
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingImage(false);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canAttachImage) return;

      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingImage(false);

      const imageFile = Array.from(event.dataTransfer.files).find(isImageFile);
      if (!imageFile) return;
      void onSendImageFile(imageFile);
    },
    [canAttachImage, onSendImageFile],
  );

  const renderLinkedText = useCallback((value: string) => {
    const parts = value.split(LINK_PATTERN).filter((part) => part.length > 0);

    return parts.map((part, index) => {
      const isLink = /^https?:\/\//i.test(part);
      if (!isLink) return <React.Fragment key={index}>{part}</React.Fragment>;

      return (
        <button
          key={`${part}-${index}`}
          type="button"
          className="break-all text-primary underline underline-offset-4 hover:text-primary/85"
          onClick={(event) => {
            event.stopPropagation();
            void api.shell.openExternal(part);
          }}
        >
          {part}
        </button>
      );
    });
  }, []);

  return (
    <>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className="max-h-[calc(100vh-2rem)] min-w-0 overflow-hidden p-0 sm:max-w-lg"
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onInteractOutside={(event) => {
            if (previewImage) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="flex min-w-0 items-center gap-3 leading-7">
              <Avatar size="sm" className="h-8 w-8">
                <AvatarImage
                  src={friend.user.image || ""}
                  alt={friend.user.nickname}
                />
                <AvatarFallback>
                  {friend.user.nickname.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 truncate leading-7">
                {t("friends.chatTitle")} {friend.user.nickname}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="relative flex h-[28rem] max-h-[calc(100vh-8rem)] min-h-0 min-w-0 flex-col">
            {isDraggingImage && (
              <div className="absolute inset-3 z-20 flex items-center justify-center rounded-xl border border-dashed border-primary/60 bg-background/80 text-sm font-medium text-foreground backdrop-blur-sm">
                {t("friends.chatDropImage")}
              </div>
            )}

            <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 py-3">
              {isLoading && loadingType === "messages" ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : (
                <ScrollArea
                  className="h-full min-w-0 overflow-hidden"
                  ref={setMessagesScrollAreaRef}
                >
                  <div className="flex min-w-0 flex-col gap-2 pr-3 pb-2">
                    {messages.map((msg, index) => {
                      if (!msg.message) return null;

                      const sender = resolveSender(msg);
                      const isOwnMessage = Boolean(
                        account && msg.sender === authData?.sub,
                      );

                      const isModpackMsg = msg.message._type === "modpack";
                      const modpackId = isModpackMsg
                        ? String(msg.message.value)
                        : "";
                      const modpack = isModpackMsg
                        ? modpackById.get(modpackId)
                        : undefined;
                      const isAttachmentFailed =
                        isModpackMsg && failedChatModpacks.has(modpackId);
                      const version = modpack
                        ? versionByShareCode.get(modpack._id)
                        : undefined;
                      const reactions = (msg.reactions ?? []).filter(
                        (reaction) =>
                          reaction.emoji && reaction.users?.length > 0,
                      );

                      return (
                        <div
                          key={msg.id ?? `${msg.time}-${index}`}
                          ref={setMessageNodeRef(msg.id)}
                          className={cn(
                            "flex min-w-0 items-start gap-2 rounded-xl transition-colors",
                            isOwnMessage && "flex-row-reverse",
                            highlightedMessageId === msg.id && "bg-primary/10",
                          )}
                          onMouseLeave={() => {
                            if (reactionPickerMessageId === msg.id) {
                              setReactionPickerMessageId(null);
                            }
                          }}
                        >
                          <Avatar size="sm" className="h-8 w-8">
                            <AvatarImage
                              src={sender.image || ""}
                              alt={sender.nickname}
                            />
                            <AvatarFallback>
                              {sender.nickname.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div
                            className={cn(
                              "group/message flex min-w-0 max-w-[82%] flex-col overflow-visible",
                              isOwnMessage && "items-end",
                            )}
                          >
                            {msg.replyTo && (
                              <button
                                type="button"
                                className={cn(
                                  "mb-1 w-fit max-w-full rounded-md border-l-2 border-primary/50 bg-muted/35 px-2 py-1 text-left text-[10px] leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
                                  isOwnMessage ? "self-end" : "self-start",
                                )}
                                onClick={() => scrollToMessage(msg.replyTo!.id)}
                              >
                                <p className="truncate">
                                  {getMessagePreviewText(msg.replyTo)}
                                </p>
                              </button>
                            )}

                            {msg.message._type === "text" && (
                              <div
                                className={cn(
                                  "w-fit max-w-full rounded-lg border bg-card px-3 py-2 text-xs leading-5 text-card-foreground whitespace-pre-wrap break-all",
                                  isOwnMessage
                                    ? "border-primary/35"
                                    : "border-border",
                                )}
                              >
                                {renderLinkedText(msg.message.value)}
                              </div>
                            )}

                            {msg.message._type === "image" && (
                              <button
                                type="button"
                                className={cn(
                                  "w-fit max-w-full overflow-hidden rounded-lg border bg-card p-1 text-card-foreground transition-colors hover:bg-accent",
                                  isOwnMessage
                                    ? "border-primary/35"
                                    : "border-border",
                                )}
                                onClick={() =>
                                  setPreviewImage(msg.message.value)
                                }
                              >
                                <img
                                  src={msg.message.value}
                                  className="max-h-56 max-w-full rounded-md object-contain"
                                  alt={t("friends.chatImage")}
                                  loading="lazy"
                                  onLoad={scrollToBottom}
                                />
                              </button>
                            )}

                            {isModpackMsg &&
                              (loadingIndex === index ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="size-4 animate-spin" />
                                  <p>{t("friends.chatAttachmentLoading")}</p>
                                </div>
                              ) : modpack ? (
                                <div
                                  className={cn(
                                    "flex w-fit max-w-full items-center gap-2 rounded-lg border bg-card px-2 py-2 text-xs text-card-foreground",
                                    isOwnMessage
                                      ? "border-primary/35"
                                      : "border-border",
                                  )}
                                >
                                  {modpack.conf.image && (
                                    <img
                                      src={modpack.conf.image}
                                      className="h-8 w-8 shrink-0 rounded-md object-cover"
                                      alt={modpack.conf.name}
                                      loading="lazy"
                                      onLoad={scrollToBottom}
                                    />
                                  )}

                                  <p className="min-w-0 flex-1 truncate">
                                    {modpack.conf.name}
                                  </p>

                                  <Button
                                    size="icon-sm"
                                    variant="outline"
                                    className="shrink-0 bg-background/80"
                                    onClick={() =>
                                      onPlayModpack(modpack, version)
                                    }
                                  >
                                    <Gamepad2 size={20} />
                                  </Button>
                                </div>
                              ) : isAttachmentFailed ? (
                                <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                  <CircleAlert className="size-4 shrink-0" />
                                  <p className="min-w-0 truncate">
                                    {t("friends.chatAttachmentLoadError")}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex w-fit max-w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                                  <Loader2 className="size-4 animate-spin" />
                                  <p>{t("friends.chatAttachmentLoading")}</p>
                                </div>
                              ))}

                            {reactions.length > 0 && (
                              <div
                                className={cn(
                                  "mt-1 flex max-w-full flex-wrap gap-1",
                                  isOwnMessage
                                    ? "justify-end"
                                    : "justify-start",
                                )}
                              >
                                {reactions.map((reaction) => {
                                  const isSelected = Boolean(
                                    authData?.sub &&
                                      reaction.users.includes(authData.sub),
                                  );

                                  return (
                                    <button
                                      key={reaction.emoji}
                                      type="button"
                                      disabled={!canUseMessageActions || !msg.id}
                                      className={cn(
                                        "flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none transition-colors",
                                        isSelected
                                          ? "border-primary/50 bg-primary/15 text-foreground"
                                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                      )}
                                      aria-label={t("friends.chatReaction")}
                                      onClick={() =>
                                        onToggleReaction(msg, reaction.emoji)
                                      }
                                    >
                                      <span
                                        className="flex size-3.5 items-center justify-center"
                                        style={EMOJI_FONT_STYLE}
                                      >
                                        {reaction.emoji}
                                      </span>
                                      <span>{reaction.users.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <div
                              className={cn(
                                "relative flex w-fit max-w-full items-center px-1 pt-0.5",
                                isOwnMessage ? "self-end" : "self-start",
                              )}
                            >
                              <p className="truncate text-[10px] leading-4 text-muted-foreground/80">
                                {formatDate(new Date(msg.time))}
                              </p>
                              {msg.id && (
                                <div
                                  className={cn(
                                    "absolute top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity hover:opacity-100 group-hover/message:opacity-100 group-focus-within/message:opacity-100",
                                    isOwnMessage
                                      ? "right-full mr-1"
                                      : "left-full ml-1",
                                  )}
                                  aria-hidden={!canUseMessageActions}
                                >
                                  <Button
                                    type="button"
                                    size="icon-xs"
                                    variant="ghost"
                                    className="size-5 rounded-md text-muted-foreground hover:text-foreground"
                                    disabled={!canUseMessageActions}
                                    aria-label={t("friends.chatReply")}
                                    onClick={() => onReplyToMessage(msg)}
                                  >
                                    <Reply className="size-3" />
                                  </Button>
                                  <div className="relative">
                                    <Button
                                      type="button"
                                      size="icon-xs"
                                      variant="ghost"
                                      className="size-5 rounded-md text-muted-foreground hover:text-foreground"
                                      disabled={!canUseMessageActions}
                                      aria-label={t("friends.chatReaction")}
                                      onClick={() =>
                                        setReactionPickerMessageId((current) =>
                                          current === msg.id ? null : msg.id!,
                                        )
                                      }
                                    >
                                      <SmilePlus className="size-3" />
                                    </Button>

                                      {reactionPickerMessageId === msg.id && (
                                        <div
                                        className={cn(
                                          "absolute bottom-full z-30 mb-1 flex w-44 gap-1 overflow-x-auto overflow-y-hidden overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl",
                                          isOwnMessage ? "right-0" : "left-0",
                                        )}
                                        onWheel={handleReactionPickerWheel}
                                        onWheelCapture={
                                          handleReactionPickerWheel
                                        }
                                      >
                                        {CHAT_REACTION_EMOJIS.map((emoji) => (
                                          <button
                                            key={emoji}
                                            type="button"
                                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-base transition-colors hover:bg-accent hover:text-accent-foreground"
                                            style={EMOJI_FONT_STYLE}
                                            aria-label={`${t("friends.chatReaction")} ${emoji}`}
                                            onClick={() => {
                                              pendingReactionScrollIdRef.current =
                                                msg.id ?? null;
                                              onToggleReaction(msg, emoji);
                                              setReactionPickerMessageId(null);
                                            }}
                                          >
                                            {emoji}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  {isOwnMessage && (
                                    <Button
                                      type="button"
                                      size="icon-xs"
                                      variant="ghost"
                                      className="size-5 rounded-md text-muted-foreground hover:text-destructive"
                                      disabled={!canUseMessageActions}
                                      aria-label={t(
                                        "friends.chatDeleteMessage",
                                      )}
                                      onClick={() => onDeleteMessage(msg)}
                                    >
                                      <Trash2 className="size-3" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="relative flex shrink-0 flex-col border-t bg-muted/30 p-3">
              {typeof imageUploadProgress === "number" && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${imageUploadProgress}%` }}
                  />
                </div>
              )}

              {replyMessage && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs">
                  <Reply className="size-3.5 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-muted-foreground">
                    {getMessagePreviewText(replyMessage)}
                  </p>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    className="size-6"
                    aria-label={t("common.close")}
                    onClick={onCancelReply}
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      disabled={!canOpenAttachments}
                      variant="secondary"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      aria-label={t("friends.chatAttach")}
                    >
                      <Paperclip size={18} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top">
                    <DropdownMenuItem
                      disabled={!canAttachModpack}
                      onSelect={onOpenVersionSelect}
                    >
                      <Package />
                      {t("friends.chatAttachModpack")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!canAttachImage}
                      onSelect={() => {
                        window.setTimeout(
                          () => fileInputRef.current?.click(),
                          0,
                        );
                      }}
                    >
                      <ImagePlus />
                      {t("friends.chatAttachImage")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <div
                  className="min-w-0 flex-1"
                  ref={setMessageInputContainerRef}
                >
                  <Input
                    className="h-9"
                    value={messageText}
                    disabled={isBusy}
                    onChange={(e) => onMessageChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                  />
                </div>

                <Button
                  size="icon"
                  className="h-9 w-9"
                  disabled={!canSend}
                  onClick={onSendMessage}
                >
                  {isLoading && loadingType === "messageSend" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <SendHorizontal size={20} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!previewImage}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogContent className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-2 sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader className="sr-only">
            <DialogTitle>{t("friends.chatImage")}</DialogTitle>
          </DialogHeader>
          <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-lg bg-muted/20">
            {previewImage && (
              <img
                src={previewImage}
                alt={t("friends.chatImage")}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
