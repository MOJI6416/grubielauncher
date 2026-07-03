import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { IUser } from "@/types/IUser";
import { FaDiscord, FaMicrosoft } from "react-icons/fa";
import { TbSquareLetterE } from "react-icons/tb";
import { IFriend } from "@/types/IFriend";
import { useTranslation } from "react-i18next";
import { IMessage } from "@/types/IMessage";
import { ILocalFriend } from "@/types/ILocalFriend";
import {
  Check,
  ClipboardCopy,
  Copy,
  Inbox,
  KeyRound,
  Loader2,
  MessagesSquare,
  Plus,
  RefreshCw,
  SendHorizontal,
  Share2,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  accountAtom,
  accountsAtom,
  authDataAtom,
  activeFriendSharesAtom,
  friendRequestsAtom,
  friendSocketAtom,
  friendsAtom,
  groupInvitesAtom,
  groupsAtom,
  voiceCallAtom,
  voiceSessionAtom,
  isShareModalOpenAtom,
  isRunningAtom,
  localFriendsAtom,
  ownPresenceAtom,
  pendingFriendChatAtom,
  selectedFriendAtom,
  selectedVersionAtom,
  shareOwnerAccountKeyAtom,
  shareStateAtom,
  versionsAtom,
} from "@renderer/stores/atoms";
import { useAtom, useAtomValue } from "jotai";
import {
  clearActiveFriendShares,
  refreshActiveFriendShares,
} from "@renderer/utilities/friendShares";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ISkinData } from "@/types/Skin";
import type { JoinFriendWorldParams, RunGameParams } from "@renderer/App";
import { Version } from "@renderer/classes/Version";
import { FriendItem } from "./FriendItem";
import { FriendRequestItem } from "./FriendRequestItem";
import { ActiveFriendShare } from "@/types/Share";
import { GameInviteResult } from "@/types/GameInvite";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { toast } from "sonner";
import { LazyDialogFallback } from "../LazyDialogFallback";
import { LazyAddVersion } from "../LazyAddVersion";
import {
  lazyWithPreload,
  schedulePreload,
} from "@renderer/utilities/lazyPreload";
import {
  parseGroupJoinCode,
  parsePackShareCode,
} from "@renderer/utilities/packShare";
import { uploadChatImage } from "@renderer/utilities/chatUpload";
import { groupJoinErrorKey } from "@renderer/utilities/groupJoin";
import { canCurrentAccountManageShare } from "@renderer/utilities/shareAccount";
import { GroupsTab } from "../Voice/GroupsTab";

const api = window.api;

const loadSkinView = () =>
  import("../SkinView").then((module) => ({ default: module.SkinView }));
const loadAccountInfo = () => import("../Account/AccountInfo");
const loadChatModal = () =>
  import("./ChatModal").then((module) => ({ default: module.ChatModal }));

const LazySkinView = lazyWithPreload(loadSkinView);
const LazyAccountInfo = lazyWithPreload(loadAccountInfo);
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
  | "imageUpload"
  | "friendRemove"
  | "chatModpack"
  | "friendCode"
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
    | "messageReaction"
    | "getMessages";
  code?: string;
}

const FRIEND_OPERATION_TIMEOUT_MS = 15000;
const FRIEND_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PACK_CODE_PATTERN = /^[a-fA-F0-9]{24}$/;
const CHAT_IMAGE_FILE_PATTERN = /\.(apng|gif|jpe?g|png|webp)$/i;

function getFriendLastActiveTime(friend: IFriend) {
  const lastActive = new Date(friend.user.lastActive).getTime();
  return Number.isNaN(lastActive) ? 0 : lastActive;
}

function FriendSection({
  label,
  friends,
  renderFriend,
}: {
  label: string;
  friends: IFriend[];
  renderFriend: (friend: IFriend) => ReactNode;
}) {
  if (friends.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <span className="tabular-nums opacity-70">{friends.length}</span>
      </p>
      {friends.map((friend) => renderFriend(friend))}
    </div>
  );
}

function getGuideSteps(description: string) {
  const matches = description.match(/\d+\.\s.*?(?=\s\d+\.|$)/g);
  if (!matches || matches.length < 2) return [];

  return matches.map((step) => step.replace(/^\d+\.\s*/, "").trim());
}

function normalizeFriendLookup(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^[a-f0-9]{24}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const compact = trimmed.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (compact.length !== 8) return "";
  if (![...compact].every((char) => FRIEND_CODE_ALPHABET.includes(char))) {
    return "";
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

function getChatImageFileName(fileName: string) {
  const safeName = fileName.trim() || "image.png";
  return `chat_${Date.now()}_${safeName}`;
}

function isChatImageFile(file: File) {
  return (
    file.type.startsWith("image/") || CHAT_IMAGE_FILE_PATTERN.test(file.name)
  );
}

function getChatReplyPreview(
  message: IMessage | null,
): IMessage["replyTo"] | undefined {
  if (!message) return undefined;
  if (!message.id || !message.message?.value) return undefined;

  return {
    id: message.id,
    sender: message.sender,
    type: message.message._type,
    value: message.message.value,
  };
}

export function Friends({
  runGame,
  joinFriendWorld,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  joinFriendWorld: (params: JoinFriendWorldParams) => Promise<void>;
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
  const [shareOwnerAccountKey] = useAtom(shareOwnerAccountKeyAtom);
  const [, setIsShareModalOpen] = useAtom(isShareModalOpenAtom);
  const [pendingFriendChat, setPendingFriendChat] = useAtom(
    pendingFriendChatAtom,
  );

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<LoadingType>();
  const [friends, setFriends] = useAtom(friendsAtom);
  const [notReads, setNotReads] = useState<string[]>([]);
  const activeShares = useAtomValue(activeFriendSharesAtom);
  const canManageCurrentShare = canCurrentAccountManageShare(
    shareOwnerAccountKey,
    account,
  );

  const [activeTab, setActiveTab] = useState<
    "friends" | "requests" | "groups"
  >("friends");
  const [addFriend, setAddFriend] = useState(false);
  const [skinModal, setSkinModal] = useState(false);
  const [chatModal, setChatModal] = useState(false);
  const [friendRemoveModal, setFriendRemoveModal] = useState(false);
  const [accountInfo, setAccountInfo] = useState(false);
  const [isAddVersion, setIsAddVersion] = useState(false);
  const [isSelectVersions, setIsSelectVersions] = useState(false);
  const [inviteGuide, setInviteGuide] = useState<InviteGuide | null>(null);
  const [friendCodeModal, setFriendCodeModal] = useState(false);
  const [ownFriendCode, setOwnFriendCode] = useState<string>();
  const [friendRequestsEnabled, setFriendRequestsEnabled] = useState(true);

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
  const [replyMessage, setReplyMessage] = useState<IMessage | null>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(
    null,
  );
  const [loadingIndex, setLoadingIndex] = useState(-1);
  const [tempModpack, setTempModpack] = useState<IModpack>();
  const [myGroups] = useAtom(groupsAtom);
  const [groupInvites] = useAtom(groupInvitesAtom);
  const [isGroupInvitePicker, setIsGroupInvitePicker] = useState(false);
  const [voiceSession] = useAtom(voiceSessionAtom);
  const [voiceCall] = useAtom(voiceCallAtom);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupOpen, setIsJoinGroupOpen] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const friendsRef = useRef(friends);
  const localFriendsRef = useRef(localFriends);
  const selectedFriendRef = useRef(selectedFriend);
  const chatModalRef = useRef(chatModal);
  const loadingTypeRef = useRef(loadingType);
  const authSubRef = useRef(authData?.sub);
  const messagesStateRef = useRef(messages);
  const replyMessageRef = useRef<IMessage | null>(replyMessage);
  const chatModpackIdsRef = useRef<Set<string>>(new Set());
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFriendRequestRef = useRef<string | null>(null);
  const chatOpenRequestRef = useRef(0);

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
    authSubRef.current = authData?.sub;
  }, [authData?.sub]);

  useEffect(() => {
    messagesStateRef.current = messages;
  }, [messages]);

  useEffect(() => {
    replyMessageRef.current = replyMessage;
  }, [replyMessage]);

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

    loadingTypeRef.current = undefined;
    setIsLoading(false);
    setLoadingType(undefined);
  }, []);

  const startLoading = useCallback(
    (type: LoadingType, timeoutMs = FRIEND_OPERATION_TIMEOUT_MS) => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }

      loadingTypeRef.current = type;
      setIsLoading(true);
      setLoadingType(type);

      loadingTimeoutRef.current = setTimeout(() => {
        loadingTypeRef.current = undefined;
        setIsLoading(false);
        setLoadingType(undefined);
        loadingTimeoutRef.current = null;
        toast.warning(t("friends.operationErrors.timeout"));
      }, timeoutMs);
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
      clearActiveFriendShares();
      return;
    }

    await refreshActiveFriendShares();
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
        chatOpenRequestRef.current += 1;
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
  }, [socket, saveLocalFriends, stopLoading, t, setSelectedFriend]);

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
      setReplyMessage(null);
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

    const handleDeleteMessage = (data: { messageId: string }) => {
      setMessages((prev) =>
        prev.filter((message) => message.id !== data.messageId),
      );
      setReplyMessage((current) =>
        current?.id === data.messageId ? null : current,
      );
    };

    const handleMessageReaction = (data: {
      messageId: string;
      reactions?: IMessage["reactions"];
    }) => {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === data.messageId
            ? {
                ...message,
                reactions: data.reactions ?? [],
              }
            : message,
        ),
      );
    };

    socket.on("getMessages", handleGetMessages);
    socket.on("sendMessage", handleSendMessage);
    socket.on("deleteMessage", handleDeleteMessage);
    socket.on("messageReaction", handleMessageReaction);

    return () => {
      socket.off("getMessages", handleGetMessages);
      socket.off("sendMessage", handleSendMessage);
      socket.off("deleteMessage", handleDeleteMessage);
      socket.off("messageReaction", handleMessageReaction);
    };
  }, [socket, account, stopLoading, focusMessageInput]);

  useEffect(() => {
    messagesRef.current?.scrollTo(0, messagesRef.current.scrollHeight);
  }, [messages.length]);

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
      clearActiveFriendShares();
      return;
    }

    void loadActiveShares();
  }, [account?.accessToken, loadActiveShares]);

  useEffect(() => {
    if (loadingType === "accept" || loadingType === "reject") {
      stopLoading();
    } else if (loadingType === "friendRequest") {
      const pendingFriendId = pendingFriendRequestRef.current;
      const requestWasCreated =
        !!pendingFriendId &&
        friendRequests.some(
          (fr) =>
            fr.user._id === pendingFriendId ||
            normalizeFriendLookup(fr.user.friendCode || "") === pendingFriendId,
        );

      if (requestWasCreated) {
        pendingFriendRequestRef.current = null;
        stopLoading();
        setAddFriend(false);
      }
    }
  }, [friendRequests, loadingType, stopLoading]);

  const loadFriendCodeSettings = useCallback(async () => {
    if (!authData || !account?.accessToken) return null;

    const userData = await api.backend.getUser(
      account.accessToken,
      authData.sub,
    );
    if (!userData) return null;

    setOwnFriendCode(userData.friendCode);
    setFriendRequestsEnabled(userData.friendRequestsEnabled !== false);
    return userData;
  }, [account?.accessToken, authData]);

  const handleOpenFriendCodeModal = useCallback(() => {
    setOwnFriendCode(authData?.friendCode);
    setFriendRequestsEnabled(authData?.friendRequestsEnabled !== false);
    setFriendCodeModal(true);
    void loadFriendCodeSettings();
  }, [
    authData?.friendCode,
    authData?.friendRequestsEnabled,
    loadFriendCodeSettings,
  ]);

  const handleCopyFriendCode = useCallback(async () => {
    if (!authData) return;

    const userData = ownFriendCode ? null : await loadFriendCodeSettings();
    const friendCode =
      ownFriendCode || userData?.friendCode || authData.friendCode;

    if (!friendCode) {
      toast.error(t("friends.friendCodeUnavailable"));
      return;
    }

    await api.clipboard.writeText(friendCode);
    toast(t("common.copied"));
  }, [authData, loadFriendCodeSettings, ownFriendCode, t]);

  const handleResetFriendCode = useCallback(async () => {
    if (!authData || !account?.accessToken) return;

    startLoading("friendCode");
    const userData = await api.backend.resetFriendCode(
      account.accessToken,
      authData.sub,
    );
    stopLoading();

    if (!userData?.friendCode) {
      toast.error(t("friends.friendCodeSaveError"));
      return;
    }

    setOwnFriendCode(userData.friendCode);
    setFriendRequestsEnabled(userData.friendRequestsEnabled !== false);
    toast.success(t("friends.friendCodeReset"));
  }, [account?.accessToken, authData, startLoading, stopLoading, t]);

  const handleFriendRequestsToggle = useCallback(
    async (checked: boolean) => {
      if (!authData || !account?.accessToken) return;

      setFriendRequestsEnabled(checked);
      const userData = await api.backend.updateFriendSettings(
        account.accessToken,
        authData.sub,
        { friendRequestsEnabled: checked },
      );

      if (!userData) {
        setFriendRequestsEnabled(!checked);
        toast.error(t("friends.friendCodeSaveError"));
        return;
      }

      setFriendRequestsEnabled(userData.friendRequestsEnabled !== false);
    },
    [account?.accessToken, authData, t],
  );

  const handleSendFriendRequest = useCallback(() => {
    if (!socket || !friendId) return;
    pendingFriendRequestRef.current = normalizeFriendLookup(friendId);
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

      const index = notReads.indexOf(friendId);
      if (index !== -1) {
        setNotReads((prev) => prev.filter((id) => id !== friendId));
      }

      const openRequest = ++chatOpenRequestRef.current;
      void LazyChatModal.preload()
        .then(() => {
          if (chatOpenRequestRef.current === openRequest) {
            setChatModal(true);
          }
        })
        .catch(() => {
          if (chatOpenRequestRef.current !== openRequest) return;

          stopLoading();
          toast.warning(t("friends.operationErrors.unknown"));
        });

      socket.emit("getMessages", { friendId });
    },
    [socket, notReads, startLoading, setSelectedFriend, stopLoading, t],
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

  const sendChatMessage = useCallback(
    (body: IMessage["message"]) => {
      if (!authData || !socket || !friend || !body.value.trim()) return false;

      startLoading("messageSend");
      const replyTo = getChatReplyPreview(replyMessageRef.current);

      const message: IMessage = {
        sender: authData.sub,
        message: body,
        ...(replyTo ? { replyTo } : {}),
        time: new Date(),
      };

      socket.emit("sendMessage", {
        message,
        recipient: friend.user._id,
      });

      setReplyMessage(null);
      focusMessageInput();
      return true;
    },
    [authData, socket, friend, startLoading, focusMessageInput],
  );

  const handleSendMessage = useCallback(() => {
    const text = messageText.trim();
    if (!text) return;

    const groupJoinCode = parseGroupJoinCode(text);
    if (groupJoinCode) {
      sendChatMessage({
        _type: "groupInvite",
        value: JSON.stringify({
          code: groupJoinCode,
          name: myGroups.find((g) => g.code === groupJoinCode)?.name ?? "",
        }),
      });
      return;
    }

    const parsedShareCode = parsePackShareCode(text);
    const isPackShare =
      parsedShareCode !== text && PACK_CODE_PATTERN.test(parsedShareCode);

    sendChatMessage({
      _type: isPackShare ? "modpack" : "text",
      value: isPackShare ? parsedShareCode : messageText,
    });
  }, [messageText, myGroups, sendChatMessage]);

  const sendChatImageUrl = useCallback(
    (url: string) => {
      if (
        !sendChatMessage({
          _type: "image",
          value: url,
        })
      ) {
        stopLoading();
      }
    },
    [sendChatMessage, stopLoading],
  );

  const handleSendChatImageFile = useCallback(
    async (file: File) => {
      if (!account?.accessToken || !authData?.sub) return;
      if (!isChatImageFile(file)) return;

      startLoading("imageUpload", 120000);
      setImageUploadProgress(0);

      try {
        const fileName = getChatImageFileName(file.name || "image.png");
        const url = await uploadChatImage({
          accessToken: account.accessToken,
          file,
          fileName,
          folder: `chat/${authData.sub}`,
          onProgress: setImageUploadProgress,
        });

        setImageUploadProgress(null);
        sendChatImageUrl(url);
      } catch {
        setImageUploadProgress(null);
        stopLoading();
        toast.error(t("friends.chatImageUploadError"));
      }
    },
    [
      account?.accessToken,
      authData?.sub,
      sendChatImageUrl,
      startLoading,
      stopLoading,
      t,
    ],
  );

  const handleDeleteChatMessage = useCallback(
    (message: IMessage) => {
      if (!socket || !friend || !message.id) return;

      socket.emit("deleteMessage", {
        recipient: friend.user._id,
        messageId: message.id,
      });
    },
    [socket, friend],
  );

  const handleToggleChatReaction = useCallback(
    (message: IMessage, emoji: string) => {
      if (!socket || !friend || !message.id) return;

      socket.emit("messageReaction", {
        recipient: friend.user._id,
        messageId: message.id,
        emoji,
      });
    },
    [socket, friend],
  );

  const handleReplyToChatMessage = useCallback(
    (message: IMessage) => {
      setReplyMessage(message);
      focusMessageInput();
    },
    [focusMessageInput],
  );

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
      sendChatMessage({
        _type: "modpack",
        value: version.version.shareCode,
      });
    },
    [account, socket, authData, friend, sendChatMessage],
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
        canManageCurrentShare &&
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
        canManageCurrentShare &&
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
        if (!canManageCurrentShare) {
          showInviteGuide(
            "friends.inviteGuide.worldLanTitle",
            "friends.inviteGuide.worldLanDescription",
          );
          return;
        }

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
      canManageCurrentShare,
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
      _version: Version | undefined,
      activeShare: ActiveFriendShare | undefined,
    ) => {
      if (!friend?.isOnline) return;

      const versionCode = activeShare?.versionShareCode || friend.versionCode;
      if (!versionCode) {
        toast.warning(t("friends.friendBuildNotPublished"));
        return;
      }

      await joinFriendWorld({
        versionCode,
        hostNickname: friend.user.nickname,
        slug: activeShare?.slug,
        address: friend.serverAddress || undefined,
      });
    },
    [joinFriendWorld, t],
  );

  const isFriendIdInvalid = useMemo(() => {
    const normalizedFriendId = normalizeFriendLookup(friendId);
    const currentOwnFriendCode = ownFriendCode || authData?.friendCode;
    const normalizedOwnFriendCode = currentOwnFriendCode
      ? normalizeFriendLookup(currentOwnFriendCode)
      : "";

    return (
      !normalizedFriendId ||
      !!friends.find(
        (f) =>
          f?.user?._id === normalizedFriendId ||
          normalizeFriendLookup(f?.user?.friendCode || "") ===
            normalizedFriendId,
      ) ||
      normalizedFriendId === authData?.sub ||
      normalizedFriendId === normalizedOwnFriendCode ||
      !!friendRequests.find(
        (fr) =>
          fr.user._id === normalizedFriendId ||
          normalizeFriendLookup(fr.user.friendCode || "") ===
            normalizedFriendId,
      )
    );
  }, [friends, friendId, authData, ownFriendCode, friendRequests]);

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

  const groupedFriends = useMemo(() => {
    const isPlaying = (f: IFriend) =>
      f.isOnline &&
      Boolean(
        f.versionName || f.serverAddress || activeShareByHost.get(f.user._id),
      );

    const byActivity = (a: IFriend, b: IFriend) => {
      const diff = getFriendLastActiveTime(b) - getFriendLastActiveTime(a);
      return diff !== 0
        ? diff
        : a.user.nickname.localeCompare(b.user.nickname);
    };

    const playing: IFriend[] = [];
    const online: IFriend[] = [];
    const offline: IFriend[] = [];

    for (const f of friends) {
      if (isPlaying(f)) playing.push(f);
      else if (f.isOnline) online.push(f);
      else offline.push(f);
    }

    playing.sort(byActivity);
    online.sort(byActivity);
    offline.sort(byActivity);

    return { playing, online, offline, total: friends.length };
  }, [friends, activeShareByHost]);

  const inviteGuideSteps = useMemo(
    () => (inviteGuide ? getGuideSteps(inviteGuide.description) : []),
    [inviteGuide],
  );

  const renderFriend = (f: IFriend) => {
    const version = f.versionCode
      ? versions.find((v) => v.version.shareCode === f.versionCode)
      : undefined;
    const activeShare = activeShareByHost.get(f.user._id);
    const isNotRead = notReads.includes(f.user._id);
    const localIndex = localFriends.findIndex((lf) => lf.id === f.user._id);
    const local = localIndex !== -1 ? localFriends[localIndex] : undefined;
    const voiceGroup =
      voiceSession.state !== "disconnected"
        ? myGroups.find((group) => group._id === voiceSession.roomId)
        : undefined;
    const isAlreadyInVoiceGroup = Boolean(
      voiceGroup &&
        voiceGroup.members.some((member) => member._id === f.user._id),
    );

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
        onJoin={() => handleJoinFriend(f, version, activeShare)}
        onInvite={() => handleInviteFriend(f)}
        onInviteToVoice={
          voiceGroup
            ? () => {
                if (isAlreadyInVoiceGroup) {
                  socket?.emit("groupVoicePing", {
                    recipientId: f.user._id,
                    groupId: voiceGroup._id,
                  });
                  toast.success(t("groups.voicePingSent"));
                } else {
                  socket?.emit("groupInvite", {
                    recipientId: f.user._id,
                    groupId: voiceGroup._id,
                  });
                }
              }
            : undefined
        }
        onViewAccount={() => handleViewAccount(f.user._id)}
        onOpenChat={() => {
          setFriend(f);
          handleOpenChat(f.user._id);
        }}
        onViewSkin={() => handleViewSkin(f)}
        isViewSkinDisabled={f.user.platform === "microsoft" && !f.user.uuid}
        onToggleMute={() => handleToggleMute(f, local, localIndex)}
        onRemove={() => {
          setSelectedFriend(f.user._id);
          setFriend(f);
          setFriendRemoveModal(true);
        }}
        t={t}
      />
    );
  };

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
              {activeTab === "friends" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={handleOpenFriendCodeModal}
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
                </>
              )}

              {activeTab === "groups" && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setIsCreateGroupOpen(true)}
                        aria-label={t("groups.create")}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("groups.create")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={() => setIsJoinGroupOpen(true)}
                        aria-label={t("groups.joinByCode")}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("groups.joinByCode")}</TooltipContent>
                  </Tooltip>
                </>
              )}

              {activeTab === "requests" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={handleOpenFriendCodeModal}
                      aria-label={t("friends.copyId")}
                    >
                      <ClipboardCopy className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("friends.copyId")}</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "friends" | "requests" | "groups")
            }
            className="gap-0"
          >
            <TabsList className="grid h-8 w-full grid-cols-3">
              <TabsTrigger value="friends" className="gap-1.5 text-xs">
                <Users className="size-3.5" />
                {t("friends.title")}
              </TabsTrigger>
              <TabsTrigger value="groups" className="gap-1.5 text-xs">
                <MessagesSquare className="size-3.5" />
                {t("groups.tab")}
              </TabsTrigger>
              <TabsTrigger value="requests" className="relative gap-1.5 text-xs">
                <Inbox className="size-3.5" />
                {t("friends.requests")}
                {recipientRequests.length + groupInvites.length > 0 && (
                  <Badge className="absolute -right-1 -top-1.5 flex h-4 min-w-4 items-center justify-center border-transparent bg-primary px-1 py-0 text-[10px] leading-none text-primary-foreground shadow-none">
                    {recipientRequests.length + groupInvites.length}
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
                {!socket?.connected ? (
                  <Empty className="min-h-full border">
                    <EmptyHeader>
                      <EmptyTitle>{t("friends.disconnected")}</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : null}
                {activeTab === "groups" && socket?.connected ? (
                  <GroupsTab
                    onPlayModpack={async (modpack, version) => {
                      if (version) {
                        setSelectedVersion(version);
                        await runGame({ version });
                      } else {
                        setTempModpack(modpack);
                        setIsAddVersion(true);
                      }
                    }}
                    createOpen={isCreateGroupOpen}
                    joinOpen={isJoinGroupOpen}
                    onCreateOpenChange={setIsCreateGroupOpen}
                    onJoinOpenChange={setIsJoinGroupOpen}
                  />
                ) : undefined}

                {activeTab === "friends" && socket?.connected ? (
                  groupedFriends.total > 0 ? (
                    <div className="flex flex-col gap-3 pr-2">
                      <FriendSection
                        label={t("friends.playing")}
                        friends={groupedFriends.playing}
                        renderFriend={renderFriend}
                      />
                      <FriendSection
                        label={t("friends.online")}
                        friends={groupedFriends.online}
                        renderFriend={renderFriend}
                      />
                      <FriendSection
                        label={t("friends.offline")}
                        friends={groupedFriends.offline}
                        renderFriend={renderFriend}
                      />
                    </div>
                  ) : (
                    <Empty className="min-h-full border">
                      <EmptyHeader>
                        <EmptyTitle>{t("friends.noFriends")}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )
                ) : undefined}

                {activeTab === "requests" && socket?.connected ? (
                  friendRequests.length + groupInvites.length > 0 ? (
                    <div className="flex flex-col gap-1.5 pr-2">
                      {groupInvites.length > 0 && (
                        <>
                          <p className="px-1 text-xs font-medium text-muted-foreground">
                            {t("groups.invites")}
                          </p>
                          {groupInvites.map((invite) => (
                            <div
                              key={invite._id}
                              className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2 py-1.5"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">
                                  {invite.group.name}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {t("groups.invitedBy", {
                                    nickname: invite.inviter.nickname,
                                  })}
                                </p>
                              </div>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="size-7 shrink-0"
                                onClick={() =>
                                  socket?.emit("acceptGroupInvite", {
                                    inviteId: invite._id,
                                  })
                                }
                                aria-label={t("groups.accept")}
                              >
                                <Check className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="destructive"
                                className="size-7 shrink-0"
                                onClick={() =>
                                  socket?.emit("declineGroupInvite", {
                                    inviteId: invite._id,
                                  })
                                }
                                aria-label={t("groups.decline")}
                              >
                                <X className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </>
                      )}
                      {friendRequests.length > 0 && (
                        <p className="px-1 pt-1 text-xs font-medium text-muted-foreground">
                          {t("friends.friendRequestsSection")}
                        </p>
                      )}
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
        open={friendCodeModal}
        onOpenChange={(open) => setFriendCodeModal(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              {t("friends.friendCodeTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("friends.friendCodeDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="rounded-xl border bg-card p-4 text-card-foreground">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <KeyRound className="size-4" />
                {t("friends.friendCode")}
              </div>
              <div className="flex min-h-12 items-center justify-center rounded-lg border bg-background px-4">
                {ownFriendCode || authData?.friendCode ? (
                  <p className="select-all text-center font-mono text-2xl font-semibold tracking-[0.2em]">
                    {ownFriendCode || authData?.friendCode}
                  </p>
                ) : (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={handleCopyFriendCode}>
                  <Copy className="size-4" />
                  {t("common.copy")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={isLoading && loadingType === "friendCode"}
                  onClick={handleResetFriendCode}
                >
                  {isLoading && loadingType === "friendCode" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("friends.resetFriendCode")}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 text-card-foreground">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {t("friends.friendRequestsEnabledTitle")}
                  </p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {t("friends.friendRequestsEnabledDescription")}
                  </p>
                </div>
                <Switch
                  checked={friendRequestsEnabled}
                  onCheckedChange={(checked) =>
                    handleFriendRequestsToggle(checked === true)
                  }
                  aria-label={t("friends.friendRequestsEnabledTitle")}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addFriend}
        onOpenChange={(open) => {
          if (!open) setAddFriend(false);
        }}
      >
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5" />
              {t("friends.adding")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <label className="text-sm font-medium" htmlFor="friend-id">
              {t("friends.friendId")}
            </label>
            <Input
              id="friend-id"
              disabled={isLoading}
              placeholder="ABCD-1234"
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
        <Suspense fallback={<LazyDialogFallback variant="chat" />}>
          <LazyChatModal
            friend={friend}
            messages={messages}
            messageText={messageText}
            isLoading={isLoading}
            loadingType={loadingType}
            loadingIndex={loadingIndex}
            imageUploadProgress={imageUploadProgress}
            replyMessage={replyMessage}
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
              setReplyMessage(null);
            }}
            onMessageChange={setMessageText}
            onSendMessage={handleSendMessage}
            onSendImageFile={handleSendChatImageFile}
            onReplyToMessage={handleReplyToChatMessage}
            onCancelReply={() => setReplyMessage(null)}
            onDeleteMessage={handleDeleteChatMessage}
            onToggleReaction={handleToggleChatReaction}
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
            onSendGroupInvite={
              myGroups.length > 0
                ? () => setIsGroupInvitePicker(true)
                : undefined
            }
            onAcceptGroupInvite={async (code) => {
              const token = account?.accessToken;
              if (!token) return;
              const joined = await api.backend.groupJoinByCode(token, code);
              if (!joined || typeof joined === "string") {
                toast.error(t(groupJoinErrorKey(joined ?? null)));
              } else {
                toast.success(t("groups.joined", { group: joined.name }));
              }
            }}
            onStartCall={() => {
              if (!socket || !friend) return;
              socket.emit("voiceCallRequest", {
                recipientId: friend.user._id,
              });
            }}
            callDisabled={
              voiceCall.status !== "idle" ||
              (voiceSession.state !== "disconnected" &&
                authData?.sub != null &&
                voiceSession.roomId ===
                  `dm_${[authData.sub, friend.user._id].sort().join("_")}`)
            }
            t={t}
          />
        </Suspense>
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
              {myGroups.map((group) => (
                <Button
                  key={group._id}
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    sendChatMessage({
                      _type: "groupInvite",
                      value: JSON.stringify({
                        code: group.code,
                        name: group.name,
                      }),
                    });
                    setIsGroupInvitePicker(false);
                  }}
                >
                  {group.name}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
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
            aria-describedby={undefined}
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
            <Alert variant="warning">
              <TriangleAlert />
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
          <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Share2 className="size-5" />
                {t("friends.shareBuildTitle")}
              </DialogTitle>
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
