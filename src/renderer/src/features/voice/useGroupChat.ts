import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ILocalAccount } from "@/types/Account";
import type { IModpack } from "@/types/Backend";
import type { IMessage } from "@/types/IMessage";
import { uploadChatImage } from "@renderer/utilities/chatUpload";
import { showFailureToast } from "@renderer/utilities/failures";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import {
  appendEntry,
  applyReactions,
  createPendingEntry,
  dropEntry,
  markEntryFailed,
  markEntryPending,
  removeMessage,
  resolveEcho,
  unsentEntries,
  type ChatEntry,
} from "@renderer/features/friends/chatEntries";
import {
  applyHistoryPage,
  CHAT_PAGE_SIZE,
  historyFailure,
  knownMessageIds,
} from "@renderer/features/friends/chatPaging";
import {
  groupDraftKey,
  readChatDraft,
  writeChatDraft,
} from "@renderer/features/friends/chatDrafts";
import { uploadFailure } from "@renderer/features/friends/uploadFailure";

const api = window.api;
const SEND_TIMEOUT_MS = 12000;
const HISTORY_TIMEOUT_MS = 15000;
const OPERATION_TIMEOUT_MS = 15000;
const IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;

let localIdCounter = 0;

// Also the idempotency key the server stores with the message, so it has to be
// unique across devices, not only within this window.
function nextLocalId() {
  localIdCounter += 1;
  const unique =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `group-${unique}-${localIdCounter}`;
}

function isChatImageFile(file: File) {
  return file.type.startsWith("image/") || IMAGE_FILE_PATTERN.test(file.name);
}

export interface GroupChatOptions {
  groupId: string;
  socket?: Socket;
  account?: ILocalAccount;
  ownUserId?: string;
  isConnected: boolean;
}

export function useGroupChat({
  groupId,
  socket,
  account,
  ownUserId,
  isConnected,
}: GroupChatOptions) {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
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
  const groupIdRef = useLatestRef(groupId);
  const ownUserIdRef = useLatestRef(ownUserId);
  const replyRef = useLatestRef(replyMessage);
  const timersRef = useRef(new Map<string, number>());
  const operationTimersRef = useRef(new Map<string, number>());
  const requestedModpacksRef = useRef(new Set<string>());
  const modpackSessionRef = useRef(0);
  const cursorRef = useRef<number | null>(null);
  const olderRequestRef = useRef(false);
  const historyRequestRef = useRef(false);
  const resentUnsentRef = useRef(new Set<string>());
  const reloadHistoryRef = useRef<(() => void) | null>(null);
  const seenIdsRef = useRef<ReadonlySet<string>>(new Set());
  const storedDraftRef = useRef("");

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
    const draft = readChatDraft(ownUserId, groupDraftKey(groupId));

    seenIdsRef.current = new Set(draft.seen);
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
    setIsLoadingHistory(true);

    return () => {
      modpackSessionRef.current += 1;
      writeChatDraft(ownUserId, groupDraftKey(groupId), {
        text: messageTextRef.current,
        unsent: unsentEntries(entriesRef.current),
        seen: [...knownMessageIds(entriesRef.current)],
      });
    };
  }, [groupId, ownUserId, entriesRef, messageTextRef]);

  useEffect(() => {
    const key = `${ownUserId ?? ""}:${groupId}`;
    if (storedDraftRef.current !== key) {
      storedDraftRef.current = key;
      return;
    }

    writeChatDraft(ownUserId, groupDraftKey(groupId), {
      text: messageText,
      unsent: unsentEntries(entries),
      seen: [...knownMessageIds(entries)],
    });
  }, [entries, groupId, messageText, ownUserId]);

  useEffect(() => {
    if (!socket || !groupId) return;

    const requestHistory = () => {
      olderRequestRef.current = false;
      historyRequestRef.current = true;
      setIsLoadingEarlier(false);
      setHistoryError(null);
      setIsLoadingHistory(true);
      socket.emit("getGroupMessages", { groupId, limit: CHAT_PAGE_SIZE });
    };

    reloadHistoryRef.current = requestHistory;

    const handleMessages = (data: {
      groupId: string;
      messages: IMessage[];
      hasMore?: boolean;
      cursor?: number | null;
    }) => {
      if (data.groupId !== groupIdRef.current) return;

      const requestedOlder = olderRequestRef.current;
      olderRequestRef.current = false;

      setEntries((prev) => {
        const merged = applyHistoryPage(prev, data, {
          requestedOlder,
          cursor: cursorRef.current,
          seen: seenIdsRef.current,
        });
        cursorRef.current = merged.cursor;
        return merged.entries;
      });

      setHasMoreHistory(data.hasMore === true);
      setIsLoadingEarlier(false);
      setHistoryError(null);

      if (requestedOlder) return;
      historyRequestRef.current = false;
      setIsLoadingHistory(false);
    };

    const handleMessage = (data: { groupId: string; message: IMessage }) => {
      if (data.groupId !== groupIdRef.current || !data.message) return;

      const own = ownUserIdRef.current;
      if (data.message.sender === own) {
        // The echoed key names the exact bubble; the text match below is the
        // fallback for a backend that does not return one yet.
        const matched =
          (data.message.clientMessageId &&
            entriesRef.current.find(
              (entry) =>
                entry.status !== "sent" &&
                entry.localId === data.message.clientMessageId,
            )) ||
          entriesRef.current.find(
            (entry) =>
              entry.status !== "sent" &&
              entry.localId &&
              entry.message.message._type === data.message.message._type &&
              entry.message.message.value === data.message.message.value,
          );
        if (matched?.localId) clearTimer(matched.localId);
      }

      setEntries((prev) => resolveEcho(prev, data.message, own));
    };

    const handleDeleted = (data: { groupId: string; messageId: string }) => {
      if (data.groupId !== groupIdRef.current) return;
      clearOperationTimer(`delete:${data.messageId}`);
      setEntries((prev) => removeMessage(prev, data.messageId));
      setReplyMessage((current) =>
        current?.id === data.messageId ? null : current,
      );
    };

    const handleReaction = (data: {
      groupId: string;
      messageId: string;
      reactions?: IMessage["reactions"];
    }) => {
      if (data.groupId !== groupIdRef.current) return;
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
      groupId?: string;
      clientMessageId?: string;
    }) => {
      // Group events are all filtered by `groupId`; the refusal now carries one
      // too, so a failure in another group no longer blanks the open one.
      if (error?.groupId && error.groupId !== groupIdRef.current) return;

      if (error?.operation === "getGroupMessages") {
        const failure = historyFailure({
          requestedOlder: olderRequestRef.current,
          historyPending: historyRequestRef.current,
        });

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
        return;
      }

      if (error?.operation === "sendGroupMessage") {
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

      if (error?.operation === "deleteGroupMessage") {
        clearOperationTimers("delete:");
      }
      if (error?.operation === "groupMessageReaction") {
        clearOperationTimers("reaction:");
      }

      if (
        error?.operation === "sendGroupMessage" ||
        error?.operation === "deleteGroupMessage" ||
        error?.operation === "groupMessageReaction"
      ) {
        warnAboutError(error.code);
      }
    };

    socket.on("groupMessages", handleMessages);
    socket.on("groupMessage", handleMessage);
    socket.on("groupMessageDeleted", handleDeleted);
    socket.on("groupMessageReaction", handleReaction);
    socket.on("friendOperationError", handleOperationError);
    socket.on("connect", requestHistory);

    if (socket.connected) requestHistory();
    else setIsLoadingHistory(true);

    return () => {
      socket.off("groupMessages", handleMessages);
      socket.off("groupMessage", handleMessage);
      socket.off("groupMessageDeleted", handleDeleted);
      socket.off("groupMessageReaction", handleReaction);
      socket.off("friendOperationError", handleOperationError);
      socket.off("connect", requestHistory);
      reloadHistoryRef.current = null;
    };
  }, [
    socket,
    groupId,
    clearTimer,
    clearOperationTimer,
    clearOperationTimers,
    entriesRef,
    groupIdRef,
    ownUserIdRef,
    tRef,
  ]);

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
    const id = groupIdRef.current;
    const cursor = cursorRef.current;
    if (!socket || !id || cursor === null) return;
    if (olderRequestRef.current) return;

    olderRequestRef.current = true;
    setIsLoadingEarlier(true);
    socket.emit("getGroupMessages", {
      groupId: id,
      before: cursor,
      limit: CHAT_PAGE_SIZE,
    });
  }, [socket, groupIdRef]);

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
      if (!socket || !groupIdRef.current) return;

      if (!socket.connected) {
        setEntries((prev) => markEntryFailed(prev, localId));
        return;
      }

      armTimer(localId);
      socket.emit("sendGroupMessage", {
        groupId: groupIdRef.current,
        message,
        // Stored with the message, so a retry resolves to what is already in
        // the history instead of posting the same thing to the group twice.
        clientMessageId: localId,
      });
    },
    [armTimer, socket, groupIdRef],
  );

  const sendBody = useCallback(
    (body: IMessage["message"]) => {
      const own = ownUserIdRef.current;
      if (!own || !socket || !groupIdRef.current) return false;
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
      emitMessage(localId, message);
      return true;
    },
    [emitMessage, socket, groupIdRef, ownUserIdRef, replyRef],
  );

  const retry = useCallback(
    (localId: string) => {
      const entry = entriesRef.current.find((item) => item.localId === localId);
      if (!entry) return;

      setEntries((prev) => markEntryPending(prev, localId));
      emitMessage(localId, entry.message);
    },
    [emitMessage, entriesRef],
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
  }, [groupId, ownUserId, isConnected]);

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
    [account?.accessToken, sendBody, t, ownUserIdRef],
  );

  const warnOffline = useCallback(() => {
    toast.warning(tRef.current("friends.operationErrors.offline"));
  }, [tRef]);

  const deleteMessage = useCallback(
    (message: IMessage) => {
      if (!socket || !groupIdRef.current || !message.id) return;
      if (!socket.connected) {
        warnOffline();
        return;
      }

      socket.emit("deleteGroupMessage", {
        groupId: groupIdRef.current,
        messageId: message.id,
      });
      armOperationTimer(`delete:${message.id}`);
    },
    [armOperationTimer, socket, warnOffline, groupIdRef],
  );

  const toggleReaction = useCallback(
    (message: IMessage, emoji: string) => {
      if (!socket || !groupIdRef.current || !message.id) return;
      if (!socket.connected) {
        warnOffline();
        return;
      }

      socket.emit("groupMessageReaction", {
        groupId: groupIdRef.current,
        messageId: message.id,
        emoji,
      });
      armOperationTimer(`reaction:${message.id}`);
    },
    [armOperationTimer, socket, warnOffline, groupIdRef],
  );

  const isUploading = useMemo(
    () => imageUploadProgress !== null,
    [imageUploadProgress],
  );

  return {
    entries,
    isLoadingHistory,
    isLoadingEarlier,
    hasMoreHistory,
    historyError,
    reloadHistory,
    loadEarlier,
    isUploading,
    messageText,
    setMessageText,
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
