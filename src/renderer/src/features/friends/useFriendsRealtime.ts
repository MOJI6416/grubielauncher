import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Socket } from "socket.io-client";
import type { IFriend, IFriendRequest } from "@/types/IFriend";
import type { IMessage } from "@/types/IMessage";
import type { GameInviteResult } from "@/types/GameInvite";
import { takeGameInviteResult } from "./gameInvite";
import { friendRequestsAtom, friendsAtom } from "@renderer/stores/atoms";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { applyFriendUpdate } from "./friendUpdates";
import { keepPendingIds } from "./pendingIds";
import { outgoingRecipient } from "./outgoingSends";
import {
  applyChatsSummary,
  dropPreviewMessage,
  dropPreviews,
  normalizeChatsSummary,
  previewFromMessage,
  previewOfMessage,
  setPreview,
  type ChatPreviews,
} from "./chatSummary";
import {
  clearTyping,
  isTyping,
  markTyping,
  pruneTyping,
  shouldPingTyping,
  type TypingMap,
} from "./typing";
import {
  bumpUnread,
  clearUnread,
  dropUnknownFriends,
  keepLocalUnread,
  loadUnread,
  saveUnread,
  totalUnread,
  type UnreadCounts,
} from "./unread";

const LIST_SETTLE_MS = 8000;
const TYPING_SWEEP_MS = 1500;
const ANSWER_TIMEOUT_MS = 15000;

const LIST_OPERATIONS = new Set([
  "friendRequest",
  "acceptFriendRequest",
  "rejectFriendRequest",
  "friendRemove",
]);

export interface FriendsRealtimeOptions {
  socket?: Socket;
  accountKey: string;
  ownUserId?: string;
  openFriendId?: string;
}

export function useFriendsRealtime({
  socket,
  accountKey,
  ownUserId,
  openFriendId,
}: FriendsRealtimeOptions) {
  const { t } = useTranslation();

  const [friends, setFriends] = useAtom(friendsAtom);
  const [requests, setRequests] = useAtom(friendRequestsAtom);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryPending, setIsSummaryPending] = useState(false);
  const [unread, setUnread] = useState<UnreadCounts>({});
  const [previews, setPreviews] = useState<ChatPreviews>({});
  const [typing, setTyping] = useState<TypingMap>({});
  const [pendingRequestIds, setPendingRequestIds] = useState<string[]>([]);
  const [removingFriendId, setRemovingFriendId] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "sending">("idle");
  const [sentRequests, setSentRequests] = useState(0);

  const openFriendIdRef = useLatestRef(openFriendId);
  const ownUserIdRef = useLatestRef(ownUserId);
  const accountKeyRef = useLatestRef(accountKey);
  const removingRef = useLatestRef(removingFriendId);
  const friendsRef = useLatestRef(friends);
  const previewsRef = useRef<ChatPreviews>(previews);

  const updatePreviews = useCallback(
    (next: (current: ChatPreviews) => ChatPreviews) => {
      const value = next(previewsRef.current);
      if (value === previewsRef.current) return;
      previewsRef.current = value;
      setPreviews(value);
    },
    [],
  );

  const hasFriendsListRef = useRef(false);
  const hasSummaryRef = useRef(false);
  const readWhileAskingRef = useRef(new Set<string>());
  const [hasFriendsList, setHasFriendsList] = useState(false);

  useEffect(() => {
    hasFriendsListRef.current = false;
    hasSummaryRef.current = false;
    setHasFriendsList(false);
    setListError(null);
    setSummaryError(null);
    setIsSummaryPending(false);
    setUnread(loadUnread(accountKey));
    updatePreviews(() => ({}));
    setTyping({});
    setPendingRequestIds([]);
    setRemovingFriendId(null);
    setLookupState("idle");
  }, [accountKey]);

  useEffect(() => {
    saveUnread(accountKeyRef.current, unread);
  }, [unread]);

  useEffect(() => {
    if (!hasFriendsList) return;
    const known = friends.map((friend) => friend.user._id);
    setUnread((prev) => dropUnknownFriends(prev, known));
    updatePreviews((current) => dropPreviews(current, known));
  }, [friends, hasFriendsList, updatePreviews]);

  useEffect(() => {
    if (!isInitialLoading) return;

    const timer = window.setTimeout(() => {
      setIsInitialLoading(false);
      if (!hasFriendsListRef.current) setListError("timeout");
    }, LIST_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [isInitialLoading]);

  useEffect(() => {
    if (!isSummaryPending) return;

    const timer = window.setTimeout(() => {
      setIsSummaryPending(false);
      if (!hasSummaryRef.current) setSummaryError("timeout");
    }, LIST_SETTLE_MS);

    return () => window.clearTimeout(timer);
  }, [isSummaryPending]);

  const askSummary = useCallback((activeSocket: Socket) => {
    readWhileAskingRef.current = new Set();
    setSummaryError(null);
    setIsSummaryPending(true);
    activeSocket.emit("getChatsSummary");
  }, []);

  const reloadFriends = useCallback(() => {
    if (!socket) return;

    setListError(null);
    setIsInitialLoading(true);
    socket.emit("getFriends");
    askSummary(socket);
  }, [askSummary, socket]);

  const hasTyping = Object.keys(typing).length > 0;

  useEffect(() => {
    if (!hasTyping) return;

    const timer = window.setInterval(() => {
      setTyping((prev) => pruneTyping(prev, Date.now()));
    }, TYPING_SWEEP_MS);

    return () => window.clearInterval(timer);
  }, [hasTyping]);

  useEffect(() => {
    if (!socket) {
      setIsInitialLoading(false);
      return;
    }

    setIsInitialLoading(true);
    if (socket.connected) {
      socket.emit("getFriends");
      askSummary(socket);
    }

    const requestSummary = () => askSummary(socket);

    const handleFriends = (data: { friends: IFriend[] }) => {
      setIsInitialLoading(false);
      setListError(null);
      setFriends(Array.isArray(data?.friends) ? data.friends : []);
      if (!hasFriendsListRef.current) {
        hasFriendsListRef.current = true;
        setHasFriendsList(true);
      }

      const removing = removingRef.current;
      if (removing) {
        const stillThere = (data?.friends ?? []).some(
          (friend) => friend.user._id === removing,
        );
        if (!stillThere) setRemovingFriendId(null);
      }
    };

    const handleRequests = (data: { requests: IFriendRequest[] }) => {
      setIsInitialLoading(false);
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    };

    const handleChatsSummary = (payload: unknown) => {
      const summaries = normalizeChatsSummary(payload);
      const open = openFriendIdRef.current;

      hasSummaryRef.current = true;
      setIsSummaryPending(false);
      setSummaryError(null);

      const known = previewsRef.current;

      updatePreviews(
        () =>
          applyChatsSummary(summaries, { previews: known, unread: {} })
            .previews,
      );
      setUnread((prev) => {
        const applied = applyChatsSummary(summaries, {
          previews: known,
          unread: prev,
        });
        const kept = keepLocalUnread(
          applied.unread,
          prev,
          readWhileAskingRef.current,
        );
        return open ? clearUnread(kept, open) : kept;
      });
    };

    const handleFriendUpdate = (data: IFriend) => {
      setFriends((prev) => applyFriendUpdate(prev, data));

      const id = data?.user?._id;
      if (id && !data.isOnline) setTyping((prev) => clearTyping(prev, id));
    };

    const handleChatMessage = (message: IMessage & { friendId?: string }) => {
      if (!message?.sender) return;

      const own = ownUserIdRef.current;
      const open = openFriendIdRef.current;
      const peerId =
        message.friendId ||
        (message.sender === own
          ? (outgoingRecipient(message.message, message.id) ?? open)
          : message.sender);
      if (!peerId) return;
      if (!friendsRef.current.some((f) => f.user._id === peerId)) return;

      updatePreviews((current) =>
        setPreview(current, peerId, previewFromMessage(message)),
      );
      setTyping((prev) => clearTyping(prev, peerId));

      if (message.sender === own || message.sender === open) return;
      setUnread((prev) => bumpUnread(prev, message.sender));
    };

    const handleMessageRemoved = (data: { messageId?: string }) => {
      const messageId =
        typeof data?.messageId === "string" ? data.messageId : "";
      if (!previewOfMessage(previewsRef.current, messageId)) return;

      updatePreviews((current) => dropPreviewMessage(current, messageId));
      socket.emit("getChatsSummary");
    };

    const handleTyping = (data: { friendId?: string }) => {
      const id = typeof data?.friendId === "string" ? data.friendId : "";
      if (!id) return;
      setTyping((prev) => markTyping(prev, id, Date.now()));
    };

    const handleStopTyping = (data: { friendId?: string }) => {
      const id = typeof data?.friendId === "string" ? data.friendId : "";
      if (!id) return;
      setTyping((prev) => clearTyping(prev, id));
    };

    const handleFriendNotFound = () => {
      setLookupState("idle");
      toast.error(t("friends.notFound"));
    };

    const handleOperationError = (error: {
      operation?: string;
      code?: string;
    }) => {
      if (error?.operation && !LIST_OPERATIONS.has(error.operation)) return;

      setLookupState("idle");
      setPendingRequestIds([]);
      setRemovingFriendId(null);

      const code = error?.code || "unknown";
      const key = `friends.operationErrors.${code}`;
      const message = t(key);
      toast.warning(
        message === key ? t("friends.operationErrors.unknown") : message,
      );
    };

    const handleSocketError = (error: {
      operation?: string;
      code?: string;
    }) => {
      if (error?.operation === "getFriends") {
        setIsInitialLoading(false);
        setListError(error.code || "unknown");
        return;
      }

      if (
        error?.operation === "getChatsSummary" ||
        error?.operation === "getNotReads"
      ) {
        setIsSummaryPending(false);
        setSummaryError(error.code || "unknown");
      }
    };

    const handleInviteResult = (result: GameInviteResult) => {
      if (takeGameInviteResult(result?.recipientId)) return;
      if (result?.ok) {
        toast.success(t("friends.inviteSent"));
        return;
      }
      if (result?.notified === "telegram") {
        toast.success(t("friends.inviteNotifiedTelegram"));
        return;
      }

      const key = `friends.inviteErrors.${result?.code || "unknown"}`;
      const message = t(key);
      toast.warning(
        message === key ? t("friends.inviteErrors.unknown") : message,
      );
    };

    socket.on("friends", handleFriends);
    socket.on("friendRequests", handleRequests);
    socket.on("chatsSummary", handleChatsSummary);
    socket.on("friendUpdate", handleFriendUpdate);
    socket.on("sendMessage", handleChatMessage);
    socket.on("deleteMessage", handleMessageRemoved);
    socket.on("typing", handleTyping);
    socket.on("stopTyping", handleStopTyping);
    socket.on("friendNotFound", handleFriendNotFound);
    socket.on("friendOperationError", handleOperationError);
    socket.on("operationError", handleSocketError);
    socket.on("gameInviteResult", handleInviteResult);
    socket.on("connect", requestSummary);

    return () => {
      socket.off("friends", handleFriends);
      socket.off("friendRequests", handleRequests);
      socket.off("chatsSummary", handleChatsSummary);
      socket.off("friendUpdate", handleFriendUpdate);
      socket.off("sendMessage", handleChatMessage);
      socket.off("deleteMessage", handleMessageRemoved);
      socket.off("typing", handleTyping);
      socket.off("stopTyping", handleStopTyping);
      socket.off("friendNotFound", handleFriendNotFound);
      socket.off("friendOperationError", handleOperationError);
      socket.off("operationError", handleSocketError);
      socket.off("gameInviteResult", handleInviteResult);
      socket.off("connect", requestSummary);
    };
  }, [askSummary, socket, setFriends, setRequests, t, updatePreviews]);

  useEffect(() => {
    if (pendingRequestIds.length === 0) return;

    const known = new Set(requests.map((request) => request.requestId));
    setPendingRequestIds((prev) => keepPendingIds(prev, known));
  }, [requests]);

  const warnAboutTimeout = useCallback(() => {
    toast.warning(t("friends.operationErrors.timeout"));
  }, [t]);

  const isOffline = useCallback(() => {
    if (socket?.connected) return false;
    toast.warning(t("friends.operationErrors.offline"));
    return true;
  }, [socket, t]);

  useEffect(() => {
    if (pendingRequestIds.length === 0) return;

    const timer = window.setTimeout(() => {
      setPendingRequestIds([]);
      warnAboutTimeout();
    }, ANSWER_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [pendingRequestIds, warnAboutTimeout]);

  useEffect(() => {
    if (!openFriendId) return;
    readWhileAskingRef.current.add(openFriendId);
    setUnread((prev) => clearUnread(prev, openFriendId));
  }, [openFriendId]);

  const markRead = useCallback((friendId: string) => {
    if (friendId) readWhileAskingRef.current.add(friendId);
    setUnread((prev) => clearUnread(prev, friendId));
  }, []);

  const typingPingRef = useRef<{ id: string; at: number } | null>(null);

  const notifyTyping = useCallback(
    (friendId: string) => {
      if (!socket || !friendId) return;

      const now = Date.now();
      const last = typingPingRef.current;
      const lastAt = last && last.id === friendId ? last.at : null;
      if (!shouldPingTyping(lastAt, now)) return;

      typingPingRef.current = { id: friendId, at: now };
      socket.emit("typing", { friendId });
    },
    [socket],
  );

  const notifyStopTyping = useCallback(
    (friendId: string) => {
      if (!socket || !friendId) return;
      if (typingPingRef.current?.id !== friendId) return;

      typingPingRef.current = null;
      socket.emit("stopTyping", { friendId });
    },
    [socket],
  );

  const typingIds = useMemo(() => {
    const now = Date.now();
    return new Set(
      Object.keys(typing).filter((id) => isTyping(typing, id, now)),
    );
  }, [typing]);

  const acceptRequest = useCallback(
    (requestId: string) => {
      if (!socket || isOffline()) return;
      setPendingRequestIds((prev) => [...prev, requestId]);
      socket.emit("acceptFriendRequest", { requestId });
    },
    [isOffline, socket],
  );

  const rejectRequest = useCallback(
    (requestId: string) => {
      if (!socket || isOffline()) return;
      setPendingRequestIds((prev) => [...prev, requestId]);
      socket.emit("rejectFriendRequest", { requestId });
    },
    [isOffline, socket],
  );

  const sendFriendRequest = useCallback(
    (friendId: string) => {
      if (!socket || !friendId || isOffline()) return false;
      setLookupState("sending");
      socket.emit("friendRequest", { friendId });
      return true;
    },
    [isOffline, socket],
  );

  useEffect(() => {
    if (lookupState !== "sending") return;

    const timer = window.setTimeout(() => {
      setLookupState("idle");
      warnAboutTimeout();
    }, ANSWER_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [lookupState, warnAboutTimeout]);

  const outgoingCount = useMemo(
    () => requests.filter((request) => request.type === "requester").length,
    [requests],
  );
  const outgoingCountRef = useRef(outgoingCount);

  useEffect(() => {
    const previous = outgoingCountRef.current;
    outgoingCountRef.current = outgoingCount;

    if (lookupState !== "sending" || outgoingCount <= previous) return;
    setLookupState("idle");
    setSentRequests((count) => count + 1);
  }, [outgoingCount, lookupState]);

  const acceptGroupInvite = useCallback(
    (inviteId: string) => {
      if (!socket || isOffline()) return false;
      socket.emit("acceptGroupInvite", { inviteId });
      return true;
    },
    [isOffline, socket],
  );

  const declineGroupInvite = useCallback(
    (inviteId: string) => {
      if (!socket || isOffline()) return false;
      socket.emit("declineGroupInvite", { inviteId });
      return true;
    },
    [isOffline, socket],
  );

  const removeFriend = useCallback(
    (friendId: string) => {
      if (!socket || isOffline()) return;
      setRemovingFriendId(friendId);
      socket.emit("friendRemove", { friendId });
    },
    [isOffline, socket],
  );

  const requestTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!removingFriendId) return;

    requestTimeoutRef.current = window.setTimeout(() => {
      setRemovingFriendId(null);
      warnAboutTimeout();
    }, ANSWER_TIMEOUT_MS);

    return () => {
      if (requestTimeoutRef.current) {
        window.clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    };
  }, [removingFriendId, warnAboutTimeout]);

  const unreadTotal = useMemo(() => totalUnread(unread), [unread]);

  return {
    friends,
    requests,
    isInitialLoading,
    listError,
    summaryError,
    isSummaryPending,
    reloadFriends,
    unread,
    unreadTotal,
    previews,
    typingIds,
    notifyTyping,
    notifyStopTyping,
    markRead,
    pendingRequestIds,
    acceptRequest,
    rejectRequest,
    sendFriendRequest,
    sentRequests,
    isSendingRequest: lookupState === "sending",
    removeFriend,
    removingFriendId,
    acceptGroupInvite,
    declineGroupInvite,
    warnIfOffline: isOffline,
  };
}
