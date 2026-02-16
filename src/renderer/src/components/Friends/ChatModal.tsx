import React, { useCallback, useEffect, useMemo } from "react";
import { IModpack } from "@/types/Backend";
import { IFriend } from "@/types/IFriend";
import { IMessage } from "@/types/IMessage";
import {
  Alert,
  Avatar,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Spinner,
} from "@heroui/react";
import { Gamepad2, Package, SendHorizontal } from "lucide-react";
import { LoadingType } from "./Friends";
import { Version } from "@renderer/classes/Version";
import { formatDate } from "@renderer/utilities/date";
import { ILocalAccount } from "@/types/Account";
import { authDataAtom } from "@renderer/stores/atoms";
import { useAtom } from "jotai";

interface ChatModalProps {
  friend: IFriend;
  messages: IMessage[];
  messageText: string;
  isLoading: boolean;
  loadingType?: LoadingType;
  loadingIndex: number;
  chatModpacks: IModpack[];
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

  useEffect(() => {
    if (!messagesRef.current) return;
    const el = messagesRef.current;

    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, messagesRef]);

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
    <Modal isOpen={true} onClose={onClose}>
      <ModalContent>
        <ModalHeader>
          {t("friends.chatTitle")} {friend.user.nickname}
        </ModalHeader>

        <ModalBody>
          <div className="flex flex-col gap-4 justify-between">
            <Alert color="warning" title={t("friends.chatLimit")} />

            <div className="flex flex-col gap-4 h-96 justify-between">
              {isLoading && loadingType === "messages" ? (
                <div className="text-center">
                  <Spinner size="sm" />
                </div>
              ) : (
                <ScrollShadow className="h-full" ref={messagesRef}>
                  <div className="flex flex-col gap-2">
                    {messages.map((msg, index) => {
                      const sender = resolveSender(msg);

                      const isModpackMsg = msg.message._type === "modpack";
                      const modpackId = isModpackMsg
                        ? String(msg.message.value)
                        : "";
                      const modpack = isModpackMsg
                        ? modpackById.get(modpackId)
                        : undefined;
                      const version = modpack
                        ? versionByShareCode.get(modpack._id)
                        : undefined;

                      return (
                        <div
                          key={`${msg.time}-${index}`}
                          className="flex items-center gap-2"
                        >
                          <Avatar
                            src={sender.image || ""}
                            size="sm"
                            className="min-w-8 min-h-8"
                            name={sender.nickname}
                          />

                          <div className="flex flex-col min-w-0">
                            {msg.message._type === "text" && (
                              <span className="break-words">
                                <p>{msg.message.value}</p>
                              </span>
                            )}

                            {isModpackMsg &&
                              (loadingIndex === index ? (
                                <div className="flex items-center gap-2">
                                  <Spinner size="sm" />
                                  <p>{t("friends.chatAttachmentLoading")}</p>
                                </div>
                              ) : modpack ? (
                                <Card className="border-white/20 border-1">
                                  <CardBody>
                                    <div className="flex items-center gap-2 min-w-0">
                                      {modpack.conf.image && (
                                        <img
                                          src={modpack.conf.image}
                                          className="h-8 w-8 rounded-md"
                                          alt={modpack.conf.name}
                                          loading="lazy"
                                        />
                                      )}

                                      <p className="truncate flex-grow">
                                        {modpack.conf.name}
                                      </p>

                                      <Button
                                        size="sm"
                                        color="secondary"
                                        variant="flat"
                                        isIconOnly
                                        onPress={() =>
                                          onPlayModpack(modpack, version)
                                        }
                                      >
                                        <Gamepad2 size={20} />
                                      </Button>
                                    </div>
                                  </CardBody>
                                </Card>
                              ) : (
                                <p className="text-sm text-warning">
                                  {t("friends.chatAttachmentLoadError")}
                                </p>
                              ))}

                            <p className="text-xs text-gray-500">
                              {formatDate(new Date(msg.time))}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollShadow>
              )}

              <div className="flex items-center gap-2 w-full">
                <ButtonGroup>
                  <Button
                    isDisabled={shareableVersions.length === 0 || isBusy}
                    variant="flat"
                    isIconOnly
                    onPress={onOpenVersionSelect}
                  >
                    <Package size={20} />
                  </Button>
                </ButtonGroup>

                <div className="w-full">
                  <Input
                    value={messageText}
                    baseRef={messageInputRef}
                    isDisabled={isBusy}
                    onChange={(e) => onMessageChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <Button
                  variant="flat"
                  isIconOnly
                  isDisabled={!canSend}
                  isLoading={isLoading && loadingType === "messageSend"}
                  onPress={onSendMessage}
                >
                  <SendHorizontal size={20} />
                </Button>
              </div>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
