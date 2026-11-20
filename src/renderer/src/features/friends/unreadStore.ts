import { useEffect } from "react";
import { atom, getDefaultStore, useAtom, useAtomValue } from "jotai";
import type { Socket } from "socket.io-client";
import type { IMessage } from "@/types/IMessage";
import { friendsAtom } from "@renderer/stores/atoms";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { normalizeChatsSummary } from "./chatSummary";
import { unreadFromSummary } from "./peopleHub";
import { bumpUnread, loadUnread, saveUnread, type UnreadCounts } from "./unread";

export const friendUnreadAtom = atom<UnreadCounts>({});

export const isPeopleLiveAtom = atom(false);

export function useFriendUnreadTracker({
  socket,
  accountKey,
  ownUserId,
}: {
  socket?: Socket;
  accountKey: string;
  ownUserId?: string;
}) {
  const [unread, setUnread] = useAtom(friendUnreadAtom);
  const isPeopleLive = useAtomValue(isPeopleLiveAtom);
  const liveRef = useLatestRef(isPeopleLive);
  const ownRef = useLatestRef(ownUserId);
  const accountKeyRef = useLatestRef(accountKey);

  useEffect(() => {
    setUnread(loadUnread(accountKey));
  }, [accountKey, setUnread]);

  useEffect(() => {
    saveUnread(accountKeyRef.current, unread);
  }, [accountKeyRef, unread]);

  useEffect(() => {
    if (!socket) return;

    const onSummary = (payload: unknown) => {
      if (liveRef.current) return;
      const summaries = normalizeChatsSummary(payload);
      setUnread((prev) => unreadFromSummary(summaries, prev));
    };

    const onMessage = (message: IMessage & { friendId?: string }) => {
      if (liveRef.current) return;
      const sender = message?.sender;
      if (!sender || sender === ownRef.current) return;
      const isFriend = getDefaultStore()
        .get(friendsAtom)
        .some((friend) => friend.user._id === sender);
      if (!isFriend) return;
      setUnread((prev) => bumpUnread(prev, sender));
    };

    socket.on("chatsSummary", onSummary);
    socket.on("sendMessage", onMessage);

    return () => {
      socket.off("chatsSummary", onSummary);
      socket.off("sendMessage", onMessage);
    };
  }, [liveRef, ownRef, setUnread, socket]);
}
