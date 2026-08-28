import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ILocalAccount } from "@/types/Account";
import type { IModpack } from "@/types/Backend";
import type { IMessage } from "@/types/IMessage";
import { uploadChatImage } from "@renderer/utilities/chatUpload";
import { showFailureToast } from "@renderer/utilities/failures";
import { uploadFailure } from "./uploadFailure";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import {
  applyReactions,
  appendEntry,
  createPendingEntry,
  dropEntry,
  markEntryFailed,
  markEntryPending,
  removeMessage,
  resolveEcho,
  unsentEntries,
  type ChatEntry,
} from "./chatEntries";
import { readChatDraft, writeChatDraft } from "./chatDrafts";
import { outgoingRecipient, rememberOutgoing } from "./outgoingSends";
import {
  applyHistoryPage,
  CHAT_PAGE_SIZE,
  historyFailure,
  knownMessageIds,
} from "./chatPaging";
import { hasPendingReconcile, hasPendingResend } from "./outbox";
import { lastReadOwnKey, mergeReadSeq } from "./readReceipt";

const api = window.api;
const SEND_TIMEOUT_MS = 12000;
const HISTORY_TIMEOUT_MS = 15000;
const OPERATION_TIMEOUT_MS = 15000;
const TYPING_IDLE_MS = 4000;
const IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;

let localIdCounter = 0;

// Also the idempotency key the server stores with the message, so it has to be
// unique across devices, not only within this window: a clock-and-counter id
// can repeat on the user's second machine, and the server would then answer a
// genuinely new message with an old one.
function nextLocalId() {
  localIdCounter += 1;
  const unique =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-${unique}-${localIdCounter}`;
}

function isChatImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

function findPendingMatch(entries: ChatEntry[], message: IMessage) {
  if (message.clientMessageId) {
    const exact = entries.find(
      (entry) =>
        entry.status !== "sent" && entry.localId === message.clientMessageId,
    );
    if (exact) return exact;
  }

  return entries.find(
    (entry) =>
      entry.status !== "sent" &&
      entry.localId &&
      entry.message.message._type === message.message._type &&
      entry.message.message.value === message.message.value,
  );
}

export interface DirectChatOptions {
  friendId?: string;
  socket?: Socket;
  account?: ILocalAccount;
  ownUserId?: string;
  isConnected: boolean;
  onTyping?: (friendId: string) => void;
  onStopTyping?: (friendId: string) => void;
}

export function useDirectChat({
  friendId,
  socket,
  account,
  ownUserId,
  isConnected,
  onTyping,
  onStopTyping,
}: DirectChatOptions) {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [peerReadSeq, setPeerReadSeq] = useState(0);
  const [messageText, setMessageText] = useState("");
  const [replyMessage, setReplyMessage] = useState<IMessage | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(
    null,
  );
  const [modpacks, setModpacks] = useState<Map<string, IModpack>>(new Map());
  const [failedModpacks, setFailedModpacks] = useState<Set<string>>(new Set());
  const [goneModpacks, setGoneModpacks] = useState<Set<string>>(new Set());
  const [modpackAttempt, setModpackAttempt] = useState(0);

  const entriesRef = useLatestRef(entries);
  const messageTextRef = useLatestRef(messageText);
  const friendIdRef = useLatestRef(friendId);
  const ownUserIdRef = useLatestRef(ownUserId);
  const replyRef = useLatestRef(replyMessage);
  const timersRef = useRef(new Map<string, number>());
  const operationTimersRef = useRef(new Map<string, number>());
  const requestedModpacksRef = useRef(new Set<string>());
  const modpackSessionRef = useRef(0);
  const cursorRef = useRef<number | null>(null);
  const olderRequestRef = useRef(false);
  const historyRequestRef = useRef(false);
  const typingIdleRef = useRef<number | null>(null);
  const resentUnsentRef = useRef(new Set<string>());
  const seenIdsRef = useRef<ReadonlySet<string>>(new Set());
  const removedIdsRef = useRef(new Set<string>());
  const reloadHistoryRef = useRef<(() => void) | null>(null);
  const onTypingRef = useLatestRef(onTyping);
  const onStopTypingRef = useLatestRef(onStopTyping);

  const clearTimer = useCallback((localId: string) => {
    const timer = timersRef.current.get(localId);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timersRef.current.delete(localId);
  }, []);

  const armTimer = useCallback(
    (localId: string) => {
      clearTimer(localId);
      const timer = window.setTimeout(() => {
        timersRef.current.delete(localId);
        setEntries((prev) => markEntryFailed(prev, localId));
      }, SEND_TIMEOUT_MS);
      timersRef.current.set(localId, timer);
    },
    [clearTimer],
  );

  const clearOperationTimer = useCallback((key: string) => {
    const timer = operationTimersRef.current.get(key);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    operationTimersRef.current.delete(key);
  }, []);

  const clearOperationTimers = useCallback((prefix: string) => {
    for (const key of [...operationTimersRef.current.keys()]) {
      if (!key.startsWith(prefix)) continue;
      window.clearTimeout(operationTimersRef.current.get(key));
      operationTimersRef.current.delete(key);
    }
  }, []);

  const armOperationTimer = useCallback(
    (key: string) => {
      clearOperationTimer(key);
      const timer = window.setTimeout(() => {
        operationTimersRef.current.delete(key);
        toast.warning(tRef.current("friends.operationErrors.timeout"));
      }, OPERATION_TIMEOUT_MS);
      operationTimersRef.current.set(key, timer);
    },
    [clearOperationTimer, tRef],
  );

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
      for (const timer of operationTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      operationTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    const draft = readChatDraft(ownUserId, friendId);

    seenIdsRef.current = new Set(draft.seen);
    removedIdsRef.current = new Set();
    setEntries(draft.unsent);
    setMessageText(draft.text);
    setReplyMessage(null);
    setModpacks(new Map());
    setFailedModpacks(new Set());
    setGoneModpacks(new Set());
    requestedModpacksRef.current = new Set();
    modpackSessionRef.current += 1;
    cursorRef.current = null;
    olderRequestRef.current = false;
    historyRequestRef.current = false;
    setHasMoreHistory(false);
    setIsLoadingEarlier(false);
    setHistoryError(null);
    setPeerReadSeq(0);
    setIsLoadingHistory(Boolean(friendId));

    return () => {
      modpackSessionRef.current += 1;
      writeChatDraft(ownUserId, friendId, {
        text: messageTextRef.current,
        unsent: unsentEntries(entriesRef.current),
        seen: [...knownMessageIds(entriesRef.current)],
      });
    };
  }, [friendId, ownUserId]);

  const storedDraftRef = useRef("");

  useEffect(() => {
    const key = `${ownUserId ?? ""}:${friendId ?? ""}`;
    if (storedDraftRef.current !== key) {
      storedDraftRef.current = key;
      return;
    }

    writeChatDraft(ownUserId, friendId, {
      text: messageText,
      unsent: unsentEntries(entries),
      seen: [...knownMessageIds(entries)],
    });
  }, [entries, friendId, messageText, ownUserId]);

  useEffect(() => {
    if (!socket || !friendId) return;

    const requestHistory = () => {
      olderRequestRef.current = false;
      historyRequestRef.current = true;
      setIsLoadingEarlier(false);
      setHistoryError(null);
      setIsLoadingHistory(true);
      socket.emit("getMessages", { friendId, limit: CHAT_PAGE_SIZE });
    };

    reloadHistoryRef.current = requestHistory;

    const handleGetMessages = (data: {
      friendId?: string;
      messages: IMessage[];
      hasMore?: boolean;
      cursor?: number | null;
      peerReadSeq?: number;
    }) => {
      if (data.friendId && data.friendId !== friendIdRef.current) return;

      const requestedOlder = olderRequestRef.current;
      olderRequestRef.current = false;

      setEntries((prev) => {
        const merged = applyHistoryPage(prev, data, {
          requestedOlder,
          cursor: cursorRef.current,
          seen: seenIdsRef.current,
          removed: removedIdsRef.current,
        });
        cursorRef.current = merged.cursor;
        return merged.entries;
      });

      setHasMoreHistory(data.hasMore === true);
      setIsLoadingEarlier(false);
      setHistoryError(null);

      if (requestedOlder) return;

      historyRequestRef.current = false;
      setPeerReadSeq((current) => mergeReadSeq(current, data.peerReadSeq));
      setIsLoadingHistory(false);
      socket.emit("markMessagesRead", { friendId });
    };

    const handleMessagesRead = (data: {
      friendId?: string;
      seq?: number;
      readAt?: string;
    }) => {
      if (data?.friendId !== friendIdRef.current) return;
      setPeerReadSeq((current) => mergeReadSeq(current, data.seq));
    };

    const handleSendMessage = (message: IMessage & { friendId?: string }) => {
      const own = ownUserIdRef.current;
      const isOwn = message.sender === own;
      const isFromPeer = message.sender === friendIdRef.current;
      if (!isOwn && !isFromPeer) return;

      if (message.friendId && message.friendId !== friendIdRef.current) return;

      if (isOwn && !message.friendId) {
        const target = outgoingRecipient(message.message, message.id);
        if (target && target !== friendIdRef.current) return;
      }

      if (isOwn) {
        const matched = findPendingMatch(entriesRef.current, message);
        if (matched?.localId) clearTimer(matched.localId);
      }

      setEntries((prev) => resolveEcho(prev, message, own));

      if (isFromPeer) {
        socket.emit("markMessagesRead", { friendId: message.sender });
      }
    };

    const handleDeleteMessage = (data: { messageId: string }) => {
      clearOperationTimer(`delete:${data.messageId}`);
      if (data.messageId) removedIdsRef.current.add(data.messageId);
      setEntries((prev) => removeMessage(prev, data.messageId));
      setReplyMessage((current) =>
        current?.id === data.messageId ? null : current,
      );
    };

    const handleReaction = (data: {
      messageId: string;
      reactions?: IMessage["reactions"];
    }) => {
      clearOperationTimer(`reaction:${data.messageId}`);
      setEntries((prev) => applyReactions(prev, data.messageId, data.reactions));
    };

    const warnAboutError = (code: string | undefined) => {
      const key = `friends.operationErrors.${code || "unknown"}`;
      const message = tRef.current(key);
      toast.warning(
        message === key
          ? tRef.current("friends.operationErrors.unknown")
          : message,
      );
    };

    const handleOperationError = (error: {
      operation?: string;
      code?: string;
      friendId?: string;
      clientMessageId?: string;
    }) => {
      // The refusal now names the chat it belongs to. Without that check an
      // error raised for another conversation blanked the open one.
      if (error?.friendId && error.friendId !== friendIdRef.current) return;

      if (error?.operation === "getMessages") {
        const failure = historyFailure({
          requestedOlder: olderRequestRef.current,
          historyPending: historyRequestRef.current,
          ambiguous: hasPendingReconcile(),
        });
        if (failure === "unknown") return;

        olderRequestRef.current = false;
        setIsLoadingEarlier(false);

        if (failure !== "history") {
          warnAboutError(error.code);
          return;
        }

        historyRequestRef.current = false;
        setIsLoadingHistory(false);
        setHistoryError(error.code || "unknown");
        if (entriesRef.current.length > 0) warnAboutError(error.code);
      }

      if (error?.operation === "sendMessage") {
        // Only the guess below can be wrong, so only the guess is suppressed
        // during a resend window; a refusal that names its message is exact.
        if (!error.clientMessageId && hasPendingResend()) return;

        const rejected = error.clientMessageId
          ? entriesRef.current.find(
              (entry) => entry.localId === error.clientMessageId,
            )
          : entriesRef.current.find(
              (entry) => entry.status === "pending" && entry.localId,
            );
        if (rejected?.localId) {
          clearTimer(rejected.localId);
          setEntries((prev) => markEntryFailed(prev, rejected.localId!));
        }
      }

      if (error?.operation === "deleteMessage") clearOperationTimers("delete:");
      if (error?.operation === "messageReaction") {
        clearOperationTimers("reaction:");
      }

      if (
        error?.operation === "sendMessage" ||
        error?.operation === "deleteMessage" ||
        error?.operation === "messageReaction"
      ) {
        warnAboutError(error.code);
      }
    };

    socket.on("getMessages", handleGetMessages);
    socket.on("messagesRead", handleMessagesRead);
    socket.on("sendMessage", handleSendMessage);
    socket.on("deleteMessage", handleDeleteMessage);
    socket.on("messageReaction", handleReaction);
    socket.on("friendOperationError", handleOperationError);
    socket.on("connect", requestHistory);

    if (socket.connected) requestHistory();
    else setIsLoadingHistory(true);

    return () => {
      socket.off("getMessages", handleGetMessages);
      socket.off("messagesRead", handleMessagesRead);
      socket.off("sendMessage", handleSendMessage);
      socket.off("deleteMessage", handleDeleteMessage);
      socket.off("messageReaction", handleReaction);
      socket.off("friendOperationError", handleOperationError);
      socket.off("connect", requestHistory);
      reloadHistoryRef.current = null;
    };
  }, [socket, friendId, clearTimer, clearOperationTimer, clearOperationTimers]);

  useEffect(() => {
    if (!isLoadingHistory || !isConnected) return;

    const timer = window.setTimeout(() => {
      historyRequestRef.current = false;
      setIsLoadingHistory(false);
      setHistoryError("timeout");
      if (entriesRef.current.length > 0) {
        toast.warning(tRef.current("friends.operationErrors.timeout"));
      }
    }, HISTORY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isLoadingHistory, isConnected, entriesRef, tRef]);

  useEffect(() => {
    if (!isLoadingEarlier || !isConnected) return;

    const timer = window.setTimeout(() => {
      olderRequestRef.current = false;
      setIsLoadingEarlier(false);
      toast.warning(tRef.current("friends.operationErrors.timeout"));
    }, HISTORY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isLoadingEarlier, isConnected, tRef]);

  const reloadHistory = useCallback(() => {
    reloadHistoryRef.current?.();
  }, []);

  const loadEarlier = useCallback(() => {
    const id = friendIdRef.current;
    const cursor = cursorRef.current;
    if (!socket || !id || cursor === null) return false;
    if (olderRequestRef.current) return false;

    olderRequestRef.current = true;
    setIsLoadingEarlier(true);
    socket.emit("getMessages", {
      friendId: id,
      before: cursor,
      limit: CHAT_PAGE_SIZE,
    });
    return true;
  }, [socket]);

  const stopTypingNow = useCallback(() => {
    if (typingIdleRef.current !== null) {
      window.clearTimeout(typingIdleRef.current);
      typingIdleRef.current = null;
    }

    const id = friendIdRef.current;
    if (id) onStopTypingRef.current?.(id);
  }, []);

  const changeMessageText = useCallback(
    (value: string) => {
      setMessageText(value);

      const id = friendIdRef.current;
      if (!id) return;

      if (!value.trim()) {
        stopTypingNow();
        return;
      }

      if (typingIdleRef.current !== null) {
        window.clearTimeout(typingIdleRef.current);
      }

      onTypingRef.current?.(id);
      typingIdleRef.current = window.setTimeout(() => {
        typingIdleRef.current = null;
        onStopTypingRef.current?.(id);
      }, TYPING_IDLE_MS);
    },
    [stopTypingNow],
  );

  useEffect(() => {
    if (!friendId) return;

    return () => {
      if (typingIdleRef.current !== null) {
        window.clearTimeout(typingIdleRef.current);
        typingIdleRef.current = null;
      }
      onStopTypingRef.current?.(friendId);
    };
  }, [friendId]);

  useEffect(() => {
    if (!account?.accessToken) return;

    const wanted: string[] = [];
    for (const entry of entries) {
      if (entry.message.message?._type !== "modpack") continue;
      const id = String(entry.message.message.value);
      if (!id || requestedModpacksRef.current.has(id)) continue;
      requestedModpacksRef.current.add(id);
      wanted.push(id);
    }

    if (wanted.length === 0) return;

    const session = modpackSessionRef.current;
    void (async () => {
      for (const id of wanted) {
        try {
          const result = await api.backend.getModpack(
            account.accessToken || "",
            id,
          );
          if (session !== modpackSessionRef.current) return;

          if (result?.data) {
            setModpacks((prev) => new Map(prev).set(id, result.data as IModpack));
          } else if (result?.status === "not_found") {
            setGoneModpacks((prev) => new Set(prev).add(id));
          } else {
            setFailedModpacks((prev) => new Set(prev).add(id));
          }
        } catch {
          if (session !== modpackSessionRef.current) return;
          setFailedModpacks((prev) => new Set(prev).add(id));
        }
      }
    })();
  }, [entries, account?.accessToken, modpackAttempt]);

  const retryModpack = useCallback((modpackId: string) => {
    if (!modpackId) return;

    requestedModpacksRef.current.delete(modpackId);
    setFailedModpacks((prev) => {
      if (!prev.has(modpackId)) return prev;
      const next = new Set(prev);
      next.delete(modpackId);
      return next;
    });
    setModpackAttempt((attempt) => attempt + 1);
  }, []);

  const emitMessage = useCallback(
    (localId: string, message: IMessage) => {
      const recipient = friendIdRef.current;
      if (!socket || !recipient) return;

      if (!socket.connected) {
        setEntries((prev) => markEntryFailed(prev, localId));
        return;
      }

      armTimer(localId);
      rememberOutgoing(recipient, message.message);
      // The server stores this key with the message: a retry that carries it
      // resolves to what was already stored instead of sending a second copy.
      socket.emit("sendMessage", {
        message,
        recipient,
        clientMessageId: localId,
      });
    },
    [armTimer, socket],
  );

  const sendBody = useCallback(
    (body: IMessage["message"]) => {
      const own = ownUserIdRef.current;
      if (!own || !socket || !friendIdRef.current) return false;
      if (!body.value.trim()) return false;

      const reply = replyRef.current;
      const replyTo =
        reply?.id && reply.message?.value
          ? {
              id: reply.id,
              sender: reply.sender,
              type: reply.message._type,
              value: reply.message.value,
            }
          : undefined;

      const localId = nextLocalId();
      const message: IMessage = {
        sender: own,
        message: body,
        ...(replyTo ? { replyTo } : {}),
        time: new Date(),
      };

      setEntries((prev) =>
        appendEntry(prev, createPendingEntry(localId, message)),
      );
      setReplyMessage(null);
      stopTypingNow();
      emitMessage(localId, message);
      return true;
    },
    [emitMessage, socket, stopTypingNow],
  );

  const retry = useCallback(
    (localId: string) => {
      const entry = entriesRef.current.find((item) => item.localId === localId);
      if (!entry) return;

      setEntries((prev) => markEntryPending(prev, localId));
      emitMessage(localId, entry.message);
    },
    [emitMessage],
  );

  const discard = useCallback(
    (localId: string) => {
      clearTimer(localId);
      setEntries((prev) => dropEntry(prev, localId));
    },
    [clearTimer],
  );

  useEffect(() => {
    resentUnsentRef.current = new Set();
  }, [friendId, ownUserId, isConnected]);

  useEffect(() => {
    if (isLoadingHistory) return;

    for (const entry of entriesRef.current) {
      if (entry.status !== "failed" || !entry.localId) continue;
      const localId = entry.localId;
      if (resentUnsentRef.current.has(localId)) continue;

      resentUnsentRef.current.add(localId);
      setEntries((prev) => markEntryPending(prev, localId));
      emitMessage(localId, entry.message);
    }
  }, [isLoadingHistory, emitMessage, entriesRef]);

  const sendImageFile = useCallback(
    async (file: File) => {
      if (!account?.accessToken || !ownUserIdRef.current) return;
      if (!isChatImageFile(file)) return;

      setImageUploadProgress(0);
      try {
        const safeName = (file.name || "image.png").trim() || "image.png";
        const url = await uploadChatImage({
          accessToken: account.accessToken,
          file,
          fileName: `chat_${Date.now()}_${safeName}`,
          folder: `chat/${ownUserIdRef.current}`,
          onProgress: setImageUploadProgress,
        });

        setImageUploadProgress(null);
        sendBody({ _type: "image", value: url });
      } catch (error) {
        setImageUploadProgress(null);

        if (error instanceof Error && error.message === "upload_timeout") {
          toast.warning(t("friends.chatImageUploadError"), {
            description: t("friends.operationErrors.timeout"),
          });
          return;
        }

        showFailureToast(
          t("friends.chatImageUploadError"),
          uploadFailure(error),
          { channels: ["backend:"], context: { side: "grubie" } },
        );
      }
    },
    [account?.accessToken, sendBody, t],
  );

  const warnOffline = useCallback(() => {
    toast.warning(tRef.current("friends.operationErrors.offline"));
  }, [tRef]);

  const deleteMessage = useCallback(
    (message: IMessage) => {
      if (!socket || !friendIdRef.current || !message.id) return;
      if (!socket.connected) {
        warnOffline();
        return;
      }

      socket.emit("deleteMessage", {
        recipient: friendIdRef.current,
        messageId: message.id,
      });
      armOperationTimer(`delete:${message.id}`);
    },
    [armOperationTimer, socket, warnOffline],
  );

  const toggleReaction = useCallback(
    (message: IMessage, emoji: string) => {
      if (!socket || !friendIdRef.current || !message.id) return;
      if (!socket.connected) {
        warnOffline();
        return;
      }

      socket.emit("messageReaction", {
        recipient: friendIdRef.current,
        messageId: message.id,
        emoji,
      });
      armOperationTimer(`reaction:${message.id}`);
    },
    [armOperationTimer, socket, warnOffline],
  );

  const isUploading = useMemo(
    () => imageUploadProgress !== null,
    [imageUploadProgress],
  );

  const readReceiptKey = useMemo(
    () => lastReadOwnKey(entries, ownUserId, peerReadSeq),
    [entries, ownUserId, peerReadSeq],
  );

  return {
    entries,
    isLoadingHistory,
    isLoadingEarlier,
    hasMoreHistory,
    historyError,
    reloadHistory,
    loadEarlier,
    readReceiptKey,
    isUploading,
    messageText,
    setMessageText: changeMessageText,
    replyMessage,
    setReplyMessage,
    imageUploadProgress,
    modpacks,
    failedModpacks,
    goneModpacks,
    retryModpack,
    sendBody,
    retry,
    discard,
    sendImageFile,
    deleteMessage,
    toggleReaction,
  };
}
