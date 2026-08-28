import { useEffect, useRef } from "react";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { io } from "socket.io-client";
import { IFriend } from "@/types/IFriend";
import { accountIdentity } from "@renderer/features/accounts/identity";
import { bindConnectionState } from "@renderer/features/friends/connectionState";
import {
  checkFriendShares,
  resetFriendShareWatch,
} from "@renderer/features/friends/friendShareWatch";
import { resetFriendsState } from "@renderer/features/friends/resetFriendsState";
import { loadGroups } from "@renderer/features/friends/groups";
import {
  bindChatOutbox,
  flushChatDrafts,
} from "@renderer/features/friends/outbox";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  friendSocketAtom,
  friendsAtom,
  isFriendsConnectedAtom,
  localFriendsAtom,
  ownPresenceAtom,
  selectedFriendAtom,
} from "@renderer/stores/atoms";
import {
  ensureAccountSession,
  isJwtExpiringSoon,
} from "@renderer/utilities/accountSession";
import { useApiBase } from "../useApiBase";

const SHARE_WATCH_MS = 90_000;

export function FriendsSocketHost() {
  const apiBase = useApiBase();
  const authData = useAtomValue(authDataAtom);
  const selectedAccount = useAtomValue(accountAtom);
  const setFriendSocket = useSetAtom(friendSocketAtom);
  const setFriends = useSetAtom(friendsAtom);
  const setLocalFriends = useSetAtom(localFriendsAtom);
  const setIsFriendsConnected = useSetAtom(isFriendsConnectedAtom);
  const setOwnPresence = useSetAtom(ownPresenceAtom);
  const identityRef = useRef<string | null>(null);
  const identity = selectedAccount ? accountIdentity(selectedAccount) : "";

  useEffect(() => {
    const store = getDefaultStore();
    const ad = authData;
    const acc = selectedAccount;

    if (identityRef.current !== identity) {
      identityRef.current = identity;
      resetFriendsState();
    }

    if (!ad || !acc?.accessToken) {
      store.get(friendSocketAtom)?.disconnect();
      setFriendSocket(undefined);
      setIsFriendsConnected(false);
      resetFriendsState();
      setOwnPresence({
        versionName: "",
        versionCode: "",
        serverAddress: "",
      });
      return;
    }

    store.get(friendSocketAtom)?.disconnect();

    let sessionRefreshRequested = false;
    const refreshSession = () => {
      if (sessionRefreshRequested || acc.type === "plain") return;
      sessionRefreshRequested = true;

      void ensureAccountSession({
        accounts: store.get(accountsAtom),
        authData: ad,
        selectedAccount: acc,
        setAccounts: (next) => store.set(accountsAtom, next),
        setSelectedAccount: (next) => store.set(accountAtom, next),
      }).catch(() => {});
    };

    if (isJwtExpiringSoon(ad)) refreshSession();

    const socketIo = io(`${apiBase}/friends`, {
      auth: { token: acc.accessToken },
    });

    const unbindConnectionState = bindConnectionState(
      socketIo,
      setIsFriendsConnected,
    );
    const unbindOutbox = bindChatOutbox(socketIo, ad.sub);

    socketIo.on("connect_error", refreshSession);

    setFriendSocket(socketIo);
    setLocalFriends(acc.friends || []);

    resetFriendShareWatch();
    const handleSharePresence = () => void checkFriendShares();
    const requestFriends = () => socketIo.emit("getFriends");
    const requestGroups = () => {
      socketIo.emit("getGroupInvites");
      void loadGroups();
    };
    const handleFriendsList = (data: { friends: IFriend[] }) =>
      setFriends(Array.isArray(data?.friends) ? data.friends : []);
    const sendQueuedMessages = () =>
      flushChatDrafts(socketIo, ad.sub, store.get(selectedFriendAtom));

    socketIo.on("connect", handleSharePresence);
    socketIo.on("connect", requestFriends);
    socketIo.on("connect", requestGroups);
    socketIo.on("connect", sendQueuedMessages);
    socketIo.on("friends", handleFriendsList);
    socketIo.on("friendUpdate", handleSharePresence);
    const shareWatchInterval = setInterval(() => {
      void checkFriendShares();
    }, SHARE_WATCH_MS);

    return () => {
      clearInterval(shareWatchInterval);
      unbindConnectionState();
      unbindOutbox();
      socketIo.off("connect_error", refreshSession);
      socketIo.off("connect", handleSharePresence);
      socketIo.off("connect", requestFriends);
      socketIo.off("connect", requestGroups);
      socketIo.off("connect", sendQueuedMessages);
      socketIo.off("friends", handleFriendsList);
      socketIo.off("friendUpdate", handleSharePresence);
      socketIo.disconnect();
      setIsFriendsConnected(false);
      setFriendSocket(undefined);
    };
  }, [
    apiBase,
    identity,
    authData?.sub,
    selectedAccount?.accessToken,
    setFriendSocket,
    setFriends,
    setLocalFriends,
    setIsFriendsConnected,
    setOwnPresence,
  ]);

  return null;
}
