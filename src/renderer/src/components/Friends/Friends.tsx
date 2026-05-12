import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { IUser } from "@/types/IUser";
import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";
import { IFriend } from "@/types/IFriend";
import { useTranslation } from "react-i18next";
import { IMessage } from "@/types/IMessage";
import { ILocalFriend } from "@/types/ILocalFriend";
import {
  ClipboardCopy,
  Inbox,
  Loader2,
  SendHorizontal,
  UserPlus,
  Users,
} from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  friendRequestsAtom,
  friendSocketAtom,
  isShareModalOpenAtom,
  isRunningAtom,
  localFriendsAtom,
  ownPresenceAtom,
  pendingFriendChatAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  shareStateAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { useAtom } from "jotai";
import { IModpack } from "@/types/Backend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ISkinData } from "@/types/Skin";
import type { RunGameParams } from "@renderer/App";
import { Version } from "@renderer/classes/Version";
import { FriendItem } from "./FriendItem";
import { FriendRequestItem } from "./FriendRequestItem";
import { ActiveFriendShare } from "@/types/Share";
import { getShareErrorText } from "@renderer/utilities/share";
import { GameInviteResult } from "@/types/GameInvite";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { toast } from "sonner";
import { LazyDialogFallback } from "../LazyDialogFallback";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";

const api = window.api;

const loadSkinView = () =>
  import("../SkinView").then((module) => ({ default: module.SkinView }));
const loadAccountInfo = () => import("../Account/AccountInfo");
const loadAddVersion = () =>
  import("../Modals/Version/AddVersion").then((module) => ({
    default: module.AddVersion,
  }));
const loadChatModal = () =>
  import("./ChatModal").then((module) => ({ default: module.ChatModal }));

const LazySkinView = lazyWithPreload(loadSkinView);
const LazyAccountInfo = lazyWithPreload(loadAccountInfo);
const LazyAddVersion = lazyWithPreload(loadAddVersion);
const LazyChatModal = lazyWithPreload(loadChatModal);

export interface IFriendRequest {
  requestId: string;
  user: IUser;
  type: "requester" | "recipient";
}

export type LoadingType =
  | "general"
  | "friendRequest"
  | "accept"
  | "reject"
  | "skin"
  | "messages"
  | "messageSend"
  | "friendRemove"
  | "chatModpack"
  | "gameInvite";

type InviteGuideAction = "openShare";

interface InviteGuide {
  title: string;
  description: string;
  action?: InviteGuideAction;
}

interface FriendOperationError {
  operation:
    | "friendRequest"
    | "acceptFriendRequest"
    | "rejectFriendRequest"
    | "friendRemove"
    | "sendMessage"
    | "getMessages";
  code?: string;
}

const FRIEND_OPERATION_TIMEOUT_MS = 15000;

function getFriendLastActiveTime(friend: IFriend) {
  const lastActive = new Date(friend.user.lastActive).getTime();
  return Number.isNaN(lastActive) ? 0 : lastActive;
}

function getGuideSteps(description: string) {
  const matches = description.match(/\d+\.\s.*?(?=\s\d+\.|$)/g);
  if (!matches || matches.length < 2) return [];

  return matches.map((step) => step.replace(/^\d+\.\s*/, "").trim());
}

export function Friends({
  runGame,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
}) {
  const { t } = useTranslation();

  const [account] = useAtom(accountAtom);
  const [accounts] = useAtom(accountsAtom);
  const [versions] = useAtom(versionsAtom);
  const [isRunning] = useAtom(isRunningAtom);
  const [localFriends, setLocalFriends] = useAtom(localFriendsAtom);
  const [socket] = useAtom(friendSocketAtom);
  const [friendRequests, setFriendRequests] = useAtom(friendRequestsAtom);
  const [selectedFriend, setSelectedFriend] = useAtom(selectedFriendAtom);
  const [authData] = useAtom(authDataAtom);
  const [, setSelectedVersion] = useAtom(selectedVersionAtom);
  const [ownPresence] = useAtom(ownPresenceAtom);
  const [shareState] = useAtom(shareStateAtom);
  const [, setIsShareModalOpen] = useAtom(isShareModalOpenAtom);
  const [pendingFriendChat, setPendingFriendChat] = useAtom(
    pendingFriendChatAtom,
  );

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<LoadingType>();
  const [friends, setFriends] = useState<IFriend[]>([]);
  const [notReads, setNotReads] = useState<string[]>([]);
  const [activeShares, setActiveShares] = useState<ActiveFriendShare[]>([]);

  const [isRequests, setIsRequests] = useState(false);
  const [addFriend, setAddFriend] = useState(false);
  const [skinModal, setSkinModal] = useState(false);
  const [chatModal, setChatModal] = useState(false);
  const [friendRemoveModal, setFriendRemoveModal] = useState(false);
  const [accountInfo, setAccountInfo] = useState(false);
  const [isAddVersion, setIsAddVersion] = useState(false);
  const [isSelectVersions, setIsSelectVersions] = useState(false);
  const [inviteGuide, setInviteGuide] = useState<InviteGuide | null>(null);

  const [friendId, setFriendId] = useState("");
  const [friend, setFriend] = useState<IFriend>();
  const [user, setUser] = useState<IUser>();
  const [skinData, setSkinData] = useState<ISkinData>({ skin: "steve" });
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [chatModpacks, setChatModpacks] = useState<IModpack[]>([]);
  const [failedChatModpacks, setFailedChatModpacks] = useState<Set<string>>(
    new Set(),
  );
  const [loadingIndex, setLoadingIndex] = useState(-1);
  const [tempModpack, setTempModpack] = useState<IModpack>();

  const messagesRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const friendsRef = useRef(friends);
  const localFriendsRef = useRef(localFriends);
  const selectedFriendRef = useRef(selectedFriend);
  const chatModalRef = useRef(chatModal);
  const loadingTypeRef = useRef(loadingType);
  const authSubRef = useRef(authData?.sub);
  const messagesStateRef = useRef(messages);
  const chatModpackIdsRef = useRef<Set<string>>(new Set());
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFriendRequestRef = useRef<string | null>(null);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    localFriendsRef.current = localFriends;
  }, [localFriends]);

  useEffect(() => {
    selectedFriendRef.current = selectedFriend;
  }, [selectedFriend]);

  useEffect(() => {
    chatModalRef.current = chatModal;
  }, [chatModal]);

  useEffect(() => {
    loadingTypeRef.current = loadingType;
  }, [loadingType]);

  useEffect(() => {
    authSubRef.current = authData?.sub;
  }, [authData?.sub]);

  useEffect(() => {
    messagesStateRef.current = messages;
  }, [messages]);

  useEffect(() => {
    chatModpackIdsRef.current = new Set(
      chatModpacks.map((modpack) => modpack._id),
    );
  }, [chatModpacks]);

  const stopLoading = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }

    setIsLoading(false);
    setLoadingType(undefined);
  }, []);

  const startLoading = useCallback(
    (type: LoadingType) => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      setIsLoading(true);
      setLoadingType(type);

      loadingTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        setLoadingType(undefined);
        loadingTimeoutRef.current = null;
        toast.warning(t("friends.operationErrors.timeout"));
      }, FRIEND_OPERATION_TIMEOUT_MS);
    },
    [t],
  );

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return schedulePreload(
      [
        LazyChatModal.preload,
        LazyAccountInfo.preload,
        LazySkinView.preload,
        LazyAddVersion.preload,
      ],
      700,
    );
  }, []);

  const loadActiveShares = useCallback(async () => {
    if (!account?.accessToken) {
      setActiveShares([]);
      return;
    }

    const result = await api.share.fetchActiveFriendShares();

    if (result.ok && result.data) {
      setActiveShares(result.data);
    } else {
      setActiveShares([]);
    }
  }, [account?.accessToken]);

  const saveLocalFriends = useCallback(
    async (newLocalFriends: ILocalFriend[]) => {
      if (!account) return;

      setLocalFriends(newLocalFriends);

      const nextAccounts = accounts.map((currentAccount) =>
        currentAccount.type === account.type &&
        currentAccount.nickname === account.nickname
          ? { ...currentAccount, friends: newLocalFriends }
          : currentAccount,
      );

      await api.accounts.save(
        nextAccounts,
        `${account.type}_${account.nickname}`,
      );
    },
    [accounts, account, setLocalFriends],
  );

  const focusMessageInput = useCallback(() => {
    setTimeout(() => {
      messageInputRef?.current?.querySelector("input")?.focus();
    }, 200);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleFriends = async (data: { friends: IFriend[] }) => {
      if (loadingTypeRef.current === "friendRemove") {
        stopLoading();

        const localIndex = localFriendsRef.current.findIndex(
          (lf) => lf.id === selectedFriendRef.current,
        );

        if (localIndex !== -1) {
          const newLocalFriends = [...localFriendsRef.current];
          newLocalFriends.splice(localIndex, 1);
          await saveLocalFriends(newLocalFriends);
        }

        const nickname = friendsRef.current.find(
          (f) => f.user._id === selectedFriendRef.current,
        )?.user.nickname;
        toast.success(`${nickname} ${t("friends.deleted")}`);

        setSelectedFriend("");
        setFriendRemoveModal(false);
      }

      setFriends(data.friends);
    };

    const handleFriendNotFound = () => {
      pendingFriendRequestRef.current = null;
      stopLoading();
      toast.error(t("friends.notFound"));
    };

    const handleFriendUpdate = (data: IFriend) => {
      setFriends((prev) => {
        const index = prev.findIndex((f) => f.user._id === data.user._id);
        if (index === -1) return prev;

        const newFriends = [...prev];
        newFriends[index] = {
          ...newFriends[index],
          versionCode: data.versionCode,
          versionName: data.versionName,
          serverAddress: data.serverAddress,
          isOnline: data.isOnline,
        };
        return newFriends;
      });

      void loadActiveShares();
    };

    const handleGameInviteResult = (result: GameInviteResult) => {
      if (loadingTypeRef.current === "gameInvite") {
        stopLoading();
      }

      if (result.ok) {
        toast.success(t("friends.inviteSent"));
        return;
      }

      toast.warning(t(`friends.inviteErrors.${result.code || "unknown"}`));
    };

    const handleFriendOperationError = (error: FriendOperationError) => {
      stopLoading();

      if (error.operation === "getMessages") {
        setChatModal(false);
        setSelectedFriend("");
        setFriend(undefined);
      }

      const code = error.code || "unknown";
      const key = `friends.operationErrors.${code}`;
      const message = t(key);
      toast.warning(
        message === key ? t("friends.operationErrors.unknown") : message,
      );
    };

    socket.on("friends", handleFriends);
    socket.on("friendNotFound", handleFriendNotFound);
    socket.on("friendUpdate", handleFriendUpdate);
    socket.on("gameInviteResult", handleGameInviteResult);
    socket.on("friendOperationError", handleFriendOperationError);

    return () => {
      socket.off("friends", handleFriends);
      socket.off("friendUpdate", handleFriendUpdate);
      socket.off("friendNotFound", handleFriendNotFound);
      socket.off("gameInviteResult", handleGameInviteResult);
      socket.off("friendOperationError", handleFriendOperationError);
    };
  }, [
    socket,
    saveLocalFriends,
    stopLoading,
    t,
    setSelectedFriend,
    loadActiveShares,
  ]);

  useEffect(() => {
    if (!socket || !account) return;

    const loadModpack = async (modpackId: string, messageIndex: number) => {
      if (chatModpackIdsRef.current.has(modpackId)) return;
      chatModpackIdsRef.current.add(modpackId);
      setFailedChatModpacks((prev) => {
        if (!prev.has(modpackId)) return prev;
        const next = new Set(prev);
        next.delete(modpackId);
        return next;
      });

      setLoadingIndex(messageIndex);
      try {
        const modpackData = await api.backend.getModpack(
          account.accessToken || "",
          modpackId,
        );
        if (modpackData.data) {
          setChatModpacks((prev) => [...prev, modpackData.data!]);
        } else {
          chatModpackIdsRef.current.delete(modpackId);
          setFailedChatModpacks((prev) => new Set(prev).add(modpackId));
        }
      } catch (error) {
        chatModpackIdsRef.current.delete(modpackId);
        setFailedChatModpacks((prev) => new Set(prev).add(modpackId));
      } finally {
        setLoadingIndex(-1);
      }
    };

    const handleGetMessages = async (data: { messages: IMessage[] }) => {
      setFailedChatModpacks(new Set());
      setMessages(data.messages);
      stopLoading();

      for (const msg of data.messages) {
        if (!msg.message) continue;
        if (msg.message._type === "modpack") {
          await loadModpack(msg.message.value, data.messages.indexOf(msg));
        }
      }
    };

    const handleSendMessage = async (message: IMessage) => {
      if (loadingTypeRef.current === "messageSend") {
        setMessageText("");
        stopLoading();
      }

      const ownUserId = authSubRef.current;
      const activeFriendId = selectedFriendRef.current;
      const isOwnMessage = message.sender === ownUserId;
      const isActiveChatMessage =
        !!activeFriendId && message.sender === activeFriendId;

      if (!isOwnMessage && (!isActiveChatMessage || !chatModalRef.current)) {
        setNotReads((prev) =>
          prev.includes(message.sender) ? prev : [...prev, message.sender],
        );
        return;
      }

      setMessages((prev) => [...prev, message]);
      focusMessageInput();

      if (!isOwnMessage && isActiveChatMessage) {
        socket.emit("markMessagesRead", { friendId: message.sender });
      }

      if (message?.message?._type === "modpack") {
        await loadModpack(
          message.message.value,
          messagesStateRef.current.length,
        );
      }
    };

    socket.on("getMessages", handleGetMessages);
    socket.on("sendMessage", handleSendMessage);

    return () => {
      socket.off("getMessages", handleGetMessages);
      socket.off("sendMessage", handleSendMessage);
    };
  }, [socket, account, stopLoading, focusMessageInput]);

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages]);

  useEffect(() => {
    if (chatModal) focusMessageInput();
  }, [chatModal, focusMessageInput]);

  useEffect(() => {
    if (!socket) return;

    startLoading("general");
    socket.emit("getFriends");

    const handleFriendRequests = (data: { requests: IFriendRequest[] }) => {
      setFriendRequests(data.requests);
      stopLoading();
    };

    const handleNotReads = (data: { users: string[] }) => {
      setNotReads(data.users);
    };

    socket.on("friendRequests", handleFriendRequests);
    socket.on("notReads", handleNotReads);

    return () => {
      socket.off("friendRequests", handleFriendRequests);
      socket.off("notReads", handleNotReads);
    };
  }, [socket, startLoading, stopLoading, setFriendRequests]);

  useEffect(() => {
    if (!account?.accessToken) {
      setActiveShares([]);
      return;
    }

    void loadActiveShares();

    const interval = setInterval(() => {
      void loadActiveShares();
    }, 15000);

    return () => clearInterval(interval);
  }, [account?.accessToken, loadActiveShares]);

  useEffect(() => {
    if (loadingType === "accept" || loadingType === "reject") {
      stopLoading();
    } else if (loadingType === "friendRequest") {
      const pendingFriendId = pendingFriendRequestRef.current;
      const requestWasCreated =
        !!pendingFriendId &&
        friendRequests.some((fr) => fr.user._id === pendingFriendId);

      if (requestWasCreated) {
        pendingFriendRequestRef.current = null;
        stopLoading();
        setAddFriend(false);
      }
    }
  }, [friendRequests, loadingType, stopLoading]);

  const handleCopyId = useCallback(async () => {
    if (!authData) return;
    await api.clipboard.writeText(authData.sub);
    toast(t("common.copied"));
  }, [authData, t]);

  const handleSendFriendRequest = useCallback(() => {
    if (!socket || !friendId) return;
    pendingFriendRequestRef.current = friendId;
    startLoading("friendRequest");
    socket.emit("friendRequest", { friendId });
  }, [socket, friendId, startLoading]);

  const handleAcceptRequest = useCallback(
    (requestId: string) => {
      if (!socket) return;
      startLoading("accept");
      socket.emit("acceptFriendRequest", { requestId });
    },
    [socket, startLoading],
  );

  const handleRejectRequest = useCallback(
    (requestId: string) => {
      if (!socket) return;
      startLoading("reject");
      socket.emit("rejectFriendRequest", { requestId });
    },
    [socket, startLoading],
  );

  const handleViewAccount = useCallback(
    async (userId: string) => {
      try {
        if (!account?.accessToken) return;

        const userData = await api.backend.getUser(account.accessToken, userId);
        if (userData) {
          setUser(userData);
          setAccountInfo(true);
        } else {
          throw new Error();
        }
      } catch {
        toast.error(t("accountInfo.error"));
      }
    },
    [account, t],
  );

  const handleOpenChat = useCallback(
    (friendId: string) => {
      if (!socket) return;

      startLoading("messages");
      setSelectedFriend(friendId);
      setChatModal(true);

      const index = notReads.indexOf(friendId);
      if (index !== -1) {
        setNotReads((prev) => prev.filter((id) => id !== friendId));
      }

      socket.emit("getMessages", { friendId });
    },
    [socket, notReads, startLoading, setSelectedFriend],
  );

  useEffect(() => {
    if (!pendingFriendChat || !socket || friends.length === 0) return;

    const targetFriend = friends.find(
      (currentFriend) => currentFriend.user._id === pendingFriendChat,
    );
    if (!targetFriend) return;

    setFriend(targetFriend);
    setSelectedFriend(targetFriend.user._id);
    handleOpenChat(targetFriend.user._id);
    setPendingFriendChat(null);
  }, [
    friends,
    handleOpenChat,
    pendingFriendChat,
    setPendingFriendChat,
    setSelectedFriend,
    socket,
  ]);

  const handleViewSkin = useCallback(
    async (friend: IFriend) => {
      if (friend.user.platform === "microsoft" && !friend.user.uuid) {
        toast.error(t("skinView.error"));
        return;
      }

      startLoading("skin");
      try {
        const skinData = await api.skin.get(
          friend.user.platform,
          friend.user.uuid,
          friend.user.nickname,
          friend.user.platform === "discord" ? account?.accessToken : undefined,
        );

        if (!skinData) {
          toast.error(t("skinView.error"));
          return;
        }

        setFriend(friend);
        setSelectedFriend(friend.user._id);
        setSkinData(skinData);
        setSkinModal(true);
      } catch {
        setSkinModal(false);
        toast.error(t("skinView.error"));
      } finally {
        stopLoading();
      }
    },
    [account, setSelectedFriend, startLoading, stopLoading, t],
  );

  const handleToggleMute = useCallback(
    async (
      friend: IFriend,
      local: ILocalFriend | undefined,
      localIndex: number,
    ) => {
      const newLocalFriends = [...localFriends];

      if (!local) {
        local = { id: friend.user._id, isMuted: true };
        newLocalFriends.push(local);
      } else {
        local.isMuted = !local.isMuted;
        newLocalFriends[localIndex] = local;
      }

      await saveLocalFriends(newLocalFriends);

      toast.success(
        local.isMuted
          ? t("friends.notificationDisabled")
          : t("friends.notificationEnabled"),
      );
    },
    [localFriends, saveLocalFriends, t],
  );

  const handleRemoveFriend = useCallback(() => {
    if (!socket || !friend) return;
    startLoading("friendRemove");
    socket.emit("friendRemove", { friendId: friend.user._id });
  }, [socket, friend, startLoading]);

  const handleSendMessage = useCallback(() => {
    if (!authData || !socket || !friend || !messageText.trim()) return;

    startLoading("messageSend");

    const message: IMessage = {
      sender: authData.sub,
      message: {
        _type: "text",
        value: messageText,
      },
      time: new Date(),
    };

    socket.emit("sendMessage", {
      message,
      recipient: friend.user._id,
    });

    focusMessageInput();
  }, [authData, socket, friend, messageText, startLoading, focusMessageInput]);

  const handleSendModpack = useCallback(
    async (version: Version) => {
      if (
        !account ||
        !socket ||
        !version.version.shareCode ||
        !authData ||
        !friend
      )
        return;

      setIsSelectVersions(false);
      startLoading("messageSend");

      const message: IMessage = {
        sender: authData.sub,
        message: {
          _type: "modpack",
          value: version.version.shareCode,
        },
        time: new Date(),
      };

      socket.emit("sendMessage", {
        message,
        recipient: friend.user._id,
      });
    },
    [account, socket, authData, friend, startLoading],
  );

  const showInviteGuide = useCallback(
    (titleKey: string, descriptionKey: string, action?: InviteGuideAction) => {
      setInviteGuide({
        title: t(titleKey),
        description: t(descriptionKey),
        action,
      });
    },
    [t],
  );

  const handleInviteFriend = useCallback(
    (friend: IFriend) => {
      if (!socket) return;

      if (!friend.isOnline) {
        toast.warning(t("friends.inviteErrors.recipient_offline"));
        return;
      }

      if (!ownPresence.versionName) {
        showInviteGuide(
          "friends.inviteGuide.noGameTitle",
          "friends.inviteGuide.noGameDescription",
        );
        return;
      }

      if (!ownPresence.versionCode) {
        showInviteGuide(
          "friends.inviteGuide.unpublishedTitle",
          "friends.inviteGuide.unpublishedDescription",
        );
        return;
      }

      if (ownPresence.serverAddress) {
        startLoading("gameInvite");
        socket.emit("gameInvite", {
          recipientId: friend.user._id,
          target: {
            type: "server",
          },
        });
        return;
      }

      if (
        shareState.phase === "online" &&
        shareState.slug &&
        shareState.sessionId &&
        shareState.publicAddress
      ) {
        startLoading("gameInvite");
        socket.emit("gameInvite", {
          recipientId: friend.user._id,
          target: {
            type: "world",
            slug: shareState.slug,
            sessionId: shareState.sessionId,
            publicAddress: shareState.publicAddress,
            visibility: shareState.visibility,
          },
        });
        return;
      }

      if (
        [
          "share_starting",
          "tunnel_connecting",
          "pending",
          "reconnecting",
        ].includes(shareState.phase)
      ) {
        showInviteGuide(
          "friends.inviteGuide.shareStartingTitle",
          "friends.inviteGuide.shareStartingDescription",
        );
        return;
      }

      if (shareState.phase === "lan_ready" || shareState.candidate) {
        showInviteGuide(
          "friends.inviteGuide.worldReadyTitle",
          "friends.inviteGuide.worldReadyDescription",
          "openShare",
        );
        return;
      }

      showInviteGuide(
        "friends.inviteGuide.worldLanTitle",
        "friends.inviteGuide.worldLanDescription",
      );
    },
    [
      ownPresence.serverAddress,
      ownPresence.versionCode,
      ownPresence.versionName,
      shareState.candidate,
      shareState.phase,
      shareState.publicAddress,
      shareState.sessionId,
      shareState.slug,
      shareState.visibility,
      showInviteGuide,
      socket,
      startLoading,
      t,
    ],
  );

  const handleJoinFriend = useCallback(
    async (
      friend: IFriend | undefined,
      version: Version | undefined,
      activeShare: ActiveFriendShare | undefined,
    ) => {
      if (!friend?.isOnline) return;

      if (!friend.versionCode) {
        toast.warning(t("friends.friendBuildNotPublished"));
        return;
      }

      let address = friend?.serverAddress;

      if (activeShare) {
        const result = await api.share.connectToFriendShare(activeShare.slug);
        if (!result.ok || !result.data) {
          toast(getShareErrorText(t, result.error));
          return;
        }

        address = result.data.connectHost;
      }

      if (!address) {
        toast.warning(t("friends.friendNoJoinTarget"));
        return;
      }

      if (version) {
        setSelectedVersion(version);
        await runGame({
          version,
          quick: {
            multiplayer: address,
          },
        });
        return;
      }

      const modpackData = await api.backend.getModpack(
        account?.accessToken || "",
        friend.versionCode,
      );

      if (modpackData.data) {
        setTempModpack(modpackData.data);
        setIsAddVersion(true);
        toast.warning(t("share.installVersionToJoin"));
      } else {
        toast.error(t("share.errors.joinShareNotFound"));
      }
    },
    [account, runGame, setSelectedVersion, t],
  );

  const isFriendIdInvalid = useMemo(() => {
    return (
      !!friends.find((f) => f?.user?._id === friendId) ||
      friendId === authData?.sub ||
      !!friendRequests.find((fr) => fr.user._id === friendId) ||
      friendId === ""
    );
  }, [friends, friendId, authData, friendRequests]);

  const recipientRequests = useMemo(
    () => friendRequests.filter((fr) => fr.type === "recipient"),
    [friendRequests],
  );

  const activeShareByHost = useMemo(
    () => new Map(activeShares.map((share) => [share.hostUserId, share])),
    [activeShares],
  );

  const shareableVersions = useMemo(
    () => versions.filter((v) => v.version.shareCode),
    [versions],
  );

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      if (a.isOnline !== b.isOnline) {
        return a.isOnline ? -1 : 1;
      }

      const lastActiveDiff =
        getFriendLastActiveTime(b) - getFriendLastActiveTime(a);
      if (lastActiveDiff !== 0) {
        return lastActiveDiff;
      }

      return a.user.nickname.localeCompare(b.user.nickname);
    });
  }, [friends]);

  const inviteGuideSteps = useMemo(
    () => (inviteGuide ? getGuideSteps(inviteGuide.description) : []),
    [inviteGuide],
  );

  return (
    <TooltipProvider delayDuration={1000}>
      <Card className="h-full w-[320px] shrink-0 gap-0 overflow-hidden py-0">
        <CardHeader className="gap-2 border-b px-3 py-3 [.border-b]:pb-3">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {t("friends.title")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopyId}
                    aria-label={t("friends.copyId")}
                  >
                    <ClipboardCopy className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("friends.copyId")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => {
                      setFriendId("");
                      setFriend(undefined);
                      setAddFriend(true);
                    }}
                    aria-label={t("friends.sendRequest")}
                  >
                    <UserPlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("friends.sendRequest")}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Tabs
            value={isRequests ? "requests" : "friends"}
            onValueChange={(value) => setIsRequests(value === "requests")}
            className="gap-0"
          >
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="friends" className="gap-1.5 text-xs">
                <Users className="size-3.5" />
                {t("friends.title")}
              </TabsTrigger>
              <TabsTrigger value="requests" className="gap-1.5 text-xs">
                <Inbox className="size-3.5" />
                {t("friends.requests")}
                {recipientRequests.length > 0 && (
                  <Badge className="ml-0.5 border-transparent bg-primary px-1.5 py-0 text-primary-foreground shadow-none">
                    {recipientRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-2 pt-1.5">
          {isLoading && loadingType === "general" ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex h-full min-h-full flex-col gap-2">
                {!isRequests && socket?.connected ? (
                  sortedFriends.length > 0 ? (
                    <div className="flex flex-col gap-1.5 pr-2">
                      {sortedFriends.map((f) => {
                        const version = f.versionCode
                          ? versions.find(
                              (v) => v.version.shareCode === f.versionCode,
                            )
                          : undefined;
                        const activeShare = activeShareByHost.get(f.user._id);

                        const isNotRead = notReads.includes(f.user._id);
                        const localIndex = localFriends.findIndex(
                          (lf) => lf.id === f.user._id,
                        );
                        const local =
                          localIndex !== -1
                            ? localFriends[localIndex]
                            : undefined;

                        return (
                          <FriendItem
                            key={f.user._id}
                            friend={f}
                            activeShare={activeShare}
                            isNotRead={isNotRead}
                            local={local}
                            isRunning={isRunning}
                            onSelect={() => {
                              setSelectedFriend(f.user._id);
                              setFriend(f);
                            }}
                            onJoin={() =>
                              handleJoinFriend(f, version, activeShare)
                            }
                            onInvite={() => handleInviteFriend(f)}
                            onViewAccount={() => handleViewAccount(f.user._id)}
                            onOpenChat={() => {
                              setFriend(f);
                              handleOpenChat(f.user._id);
                            }}
                            onViewSkin={() => handleViewSkin(f)}
                            isViewSkinDisabled={
                              f.user.platform === "microsoft" && !f.user.uuid
                            }
                            onToggleMute={() =>
                              handleToggleMute(f, local, localIndex)
                            }
                            onRemove={() => {
                              setSelectedFriend(f.user._id);
                              setFriend(f);
                              setFriendRemoveModal(true);
                            }}
                            t={t}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <Empty className="min-h-full border">
                      <EmptyHeader>
                        <EmptyTitle>{t("friends.noFriends")}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )
                ) : undefined}

                {isRequests && socket?.connected ? (
                  friendRequests.length > 0 ? (
                    <div className="flex flex-col gap-1.5 pr-2">
                      {friendRequests.map((fr) => (
                        <FriendRequestItem
                          key={fr.requestId}
                          request={fr}
                          isLoading={isLoading}
                          loadingType={loadingType}
                          onAccept={() => handleAcceptRequest(fr.requestId)}
                          onReject={() => handleRejectRequest(fr.requestId)}
                          t={t}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty className="min-h-full border">
                      <EmptyHeader>
                        <EmptyTitle>{t("friends.noRequests")}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )
                ) : undefined}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={addFriend}
        onOpenChange={(open) => {
          if (!open) setAddFriend(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("friends.adding")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <label className="text-sm font-medium" htmlFor="friend-id">
              {t("friends.friendId")}
            </label>
            <Input
              id="friend-id"
              disabled={isLoading}
              value={friendId}
              onChange={(e) => setFriendId(e.currentTarget.value.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isFriendIdInvalid) {
                  handleSendFriendRequest();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              disabled={isFriendIdInvalid || loadingType === "friendRequest"}
              onClick={handleSendFriendRequest}
            >
              {isLoading && loadingType === "friendRequest" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizontal size={18} />
              )}
              {t("friends.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {inviteGuide && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setInviteGuide(null);
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{inviteGuide.title}</DialogTitle>
            </DialogHeader>
            <div className="rounded-lg border bg-muted/50 p-4">
              <DialogDescription asChild>
                {inviteGuideSteps.length > 0 ? (
                  <ol className="flex flex-col gap-3">
                    {inviteGuideSteps.map((step, index) => (
                      <li
                        key={`${step}-${index}`}
                        className="flex items-start gap-3"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted-foreground">
                          {index + 1}
                        </span>
                        <span className="text-sm leading-6 text-foreground">
                          {step}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm leading-6 text-foreground">
                    {inviteGuide.description}
                  </p>
                )}
              </DialogDescription>
            </div>
            <DialogFooter>
              {inviteGuide.action === "openShare" && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInviteGuide(null);
                    setIsShareModalOpen(true);
                  }}
                >
                  {t("friends.openSharePanel")}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setInviteGuide(null)}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {friend && skinModal && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazySkinView
            skinData={skinData}
            nickname={friend.user.nickname}
            isOwner={false}
            onClose={() => {
              setSkinModal(false);
              setFriend(undefined);
            }}
          />
        </Suspense>
      )}

      {friend && socket && chatModal && (
        <Suspense fallback={<LazyDialogFallback variant="form" />}>
          <LazyChatModal
            friend={friend}
            messages={messages}
            messageText={messageText}
            isLoading={isLoading}
            loadingType={loadingType}
            loadingIndex={loadingIndex}
            chatModpacks={chatModpacks}
            failedChatModpacks={failedChatModpacks}
            versions={versions}
            shareableVersions={shareableVersions}
            messagesRef={messagesRef}
            messageInputRef={messageInputRef}
            account={account}
            onClose={() => {
              setChatModal(false);
              setSelectedFriend("");
              setFriend(undefined);
            }}
            onMessageChange={setMessageText}
            onSendMessage={handleSendMessage}
            onOpenVersionSelect={() => setIsSelectVersions(true)}
            onPlayModpack={async (modpack: IModpack, version?: Version) => {
              if (version) {
                setSelectedVersion(version);
                setChatModal(false);
                await runGame({ version });
              } else {
                setTempModpack(modpack);
                setIsAddVersion(true);
              }
            }}
            t={t}
          />
        </Suspense>
      )}

      {friend && socket && friendRemoveModal && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !isLoading) {
              setFriendRemoveModal(false);
              setFriend(undefined);
            }
          }}
        >
          <DialogContent
            className="sm:max-w-sm"
            onEscapeKeyDown={(event) => {
              if (isLoading) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (isLoading) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("common.confirmation")}</DialogTitle>
            </DialogHeader>
            <Alert className="border-[var(--warning)]/40">
              <AlertTitle>
                {`${t("friends.deleteAlert")} ${friend.user.nickname}?`}
              </AlertTitle>
            </Alert>
            <DialogFooter className="gap-2">
              <Button
                variant="destructive"
                disabled={isLoading && loadingType === "friendRemove"}
                onClick={handleRemoveFriend}
              >
                {isLoading && loadingType === "friendRemove" && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t("common.yes")}
              </Button>
              <Button
                variant="secondary"
                disabled={isLoading && loadingType === "friendRemove"}
                onClick={() => setFriendRemoveModal(false)}
              >
                {t("common.no")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {accountInfo && user && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyAccountInfo
            onClose={() => setAccountInfo(false)}
            user={user}
            isOwner={false}
          />
        </Suspense>
      )}

      {isAddVersion && tempModpack && (
        <Suspense fallback={<LazyDialogFallback variant="wide" />}>
          <LazyAddVersion
            closeModal={() => setIsAddVersion(false)}
            modpack={tempModpack}
          />
        </Suspense>
      )}

      {isSelectVersions && friend && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setIsSelectVersions(false);
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("friends.shareBuildTitle")}</DialogTitle>
            </DialogHeader>
            <div>
              {shareableVersions.length === 0 ? (
                <div className="rounded-lg border bg-muted/50 p-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t("friends.noPublishedBuilds")}
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="flex flex-col gap-2 pr-2">
                    {shareableVersions.map((version) => (
                      <Button
                        key={version.version.shareCode}
                        className="h-auto w-full justify-start rounded-lg px-3 py-2.5"
                        variant="secondary"
                        onClick={() => handleSendModpack(version)}
                      >
                        <div className="flex w-full min-w-0 items-center gap-3">
                          {version.version.image && (
                            <img
                              src={version.version.image}
                              alt={version.version.name}
                              className="size-10 shrink-0 rounded-md object-cover"
                              width={40}
                              height={40}
                            />
                          )}
                          <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                            <p className="w-full truncate text-sm font-medium">
                              {version.version.name}
                            </p>
                            <p className="w-full truncate font-mono text-xs text-muted-foreground">
                              {version.version.shareCode}
                            </p>
                          </div>
                          <SendHorizontal
                            size={18}
                            className="ml-auto shrink-0 text-muted-foreground"
                          />
                        </div>
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  );
}

export function getPlatformIcon(platform: string) {
  switch (platform) {
    case "microsoft":
      return <FaMicrosoft size={20} />;
    case "elyby":
      return <TbSquareLetterE size={20} />;
    case "discord":
      return <FaDiscord size={20} />;
    default:
      return null;
  }
}
