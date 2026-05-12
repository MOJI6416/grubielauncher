import React, { useCallback, useEffect, useMemo } from "react";
import { IModpack } from "@/types/Backend";
import { IFriend } from "@/types/IFriend";
import { IMessage } from "@/types/IMessage";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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
  Loader2,
  Package,
  SendHorizontal,
} from "lucide-react";
import { LoadingType } from "./Friends";
import { Version } from "@renderer/classes/Version";
import { formatDate } from "@renderer/utilities/date";
import { ILocalAccount } from "@/types/Account";
import { authDataAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { cn } from "@/lib/utils";

interface ChatModalProps {
  friend: IFriend;
  messages: IMessage[];
  messageText: string;
  isLoading: boolean;
  loadingType?: LoadingType;
  loadingIndex: number;
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
  onOpenVersionSelect,
  onPlayModpack,
  t,
}: ChatModalProps) {
  const isBusy =
    isLoading && (loadingType === "messageSend" || loadingType === "messages");
  const canSend = messageText.trim().length > 0 && !isBusy;
  const [authData] = useAtom(authDataAtom);
  const scrollTimerRef = React.useRef<number | null>(null);
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

  useEffect(() => {
    scrollToBottom();

    return () => {
      if (scrollTimerRef.current) {
        window.clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = null;
      }
    };
  }, [chatModpacks.length, loadingIndex, messages.length, scrollToBottom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      if (!messageText.trim()) return;
      if (isBusy) return;
      onSendMessage();
    },
    [isBusy, messageText, onSendMessage],
  );

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] min-w-0 overflow-hidden p-0 sm:max-w-lg">
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

        <div className="flex h-[28rem] max-h-[calc(100vh-8rem)] min-h-0 min-w-0 flex-col">
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
                <div className="flex min-w-0 flex-col gap-2 pr-3">
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

                    return (
                      <div
                        key={`${msg.time}-${index}`}
                        className={cn(
                          "flex min-w-0 items-start gap-2",
                          isOwnMessage && "flex-row-reverse",
                        )}
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
                            "flex min-w-0 max-w-[82%] flex-col overflow-hidden",
                            isOwnMessage && "items-end",
                          )}
                        >
                          {msg.message._type === "text" && (
                            <p
                              className={cn(
                                "w-fit max-w-full rounded-lg border bg-card px-3 py-2 text-xs leading-5 text-card-foreground whitespace-pre-wrap break-all",
                                isOwnMessage
                                  ? "border-primary/35"
                                  : "border-border",
                              )}
                            >
                              {msg.message.value}
                            </p>
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

                          <p
                            className={cn(
                              "w-fit max-w-full truncate px-1 pt-0.5 text-[10px] leading-4 text-muted-foreground/80",
                              isOwnMessage ? "self-end" : "self-start",
                            )}
                          >
                            {formatDate(new Date(msg.time))}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t bg-muted/30 p-3">
            <Button
              disabled={shareableVersions.length === 0 || isBusy}
              variant="secondary"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onOpenVersionSelect}
            >
              <Package size={18} />
            </Button>

            <div className="min-w-0 flex-1" ref={setMessageInputContainerRef}>
              <Input
                className="h-9"
                value={messageText}
                disabled={isBusy}
                onChange={(e) => onMessageChange(e.target.value)}
                onKeyDown={handleKeyDown}
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
      </DialogContent>
    </Dialog>
  );
}
