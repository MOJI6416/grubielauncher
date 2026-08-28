import { useEffect } from "react";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { IFriendRequest } from "@/types/IFriend";
import { IUser } from "@/types/IUser";
import { IGroup, IGroupInvite, IVoiceCallPeer } from "@/types/Voice";
import { loadGroups } from "@renderer/features/friends/groups";
import {
  accountAtom,
  authDataAtom,
  friendRequestsAtom,
  friendSocketAtom,
  groupInvitesAtom,
  groupUnreadsAtom,
  groupsAtom,
  localFriendsAtom,
  mutedGroupsAtom,
  openGroupChatIdAtom,
  saveGroupUnreads,
  selectedFriendAtom,
} from "@renderer/stores/atoms";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { showFailureToast } from "@renderer/utilities/failures";
import { playSound } from "@renderer/utilities/sounds";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { voiceConnect } from "@renderer/utilities/voiceClient";

const api = window.api;

export function FriendsEventsHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const friendSocket = useAtomValue(friendSocketAtom);
  const setFriendRequests = useSetAtom(friendRequestsAtom);
  const setGroups = useSetAtom(groupsAtom);
  const setGroupInvites = useSetAtom(groupInvitesAtom);
  const setGroupUnreads = useSetAtom(groupUnreadsAtom);
  const localFriends = useAtomValue(localFriendsAtom);
  const localFriendsRef = useLatestRef(localFriends);
  const openGroupChatId = useAtomValue(openGroupChatIdAtom);
  const openGroupChatIdRef = useLatestRef(openGroupChatId);
  const mutedGroups = useAtomValue(mutedGroupsAtom);
  const mutedGroupsRef = useLatestRef(mutedGroups);

  useEffect(() => {
    if (!friendSocket) return;

    const store = getDefaultStore();

    const onFriendRequest = async (data: IFriendRequest) => {
      setFriendRequests((prev) =>
        prev.some((request) => request.requestId === data.requestId)
          ? prev
          : [...prev, data],
      );

      if (data.type == "recipient") {
        await api.other.notify({
          title: tRef.current("friends.newRequest"),
          body: tRef.current("friends.sentRequest", {
            nickname: data.user.nickname,
          }),
          icon: data.user.image || "",
        });
      }

      if (data.type == "requester") {
        toast.success(tRef.current("friends.requestSent"));
      }
    };

    const onFriendRequestRemove = async (data: {
      requestId: string;
      type: "accept" | "reject";
      user: IUser;
    }) => {
      const { requestId, type, user } = data;

      setFriendRequests((prev) => prev.filter((r) => r.requestId != requestId));

      if (user._id != store.get(authDataAtom)?.sub) {
        await api.other.notify({
          title: tRef.current(
            type == "accept"
              ? "friends.requestAccepted"
              : "friends.requestDeclined",
          ),
          body: tRef.current(
            type == "accept"
              ? "friends.acceptedRequest"
              : "friends.declinedRequest",
            { nickname: user.nickname },
          ),
          icon: user.image || "",
        });
      } else {
        toast.success(
          tRef.current(
            type == "accept"
              ? "friends.requestAccepted"
              : "friends.requestDeclined",
          ),
        );
      }
    };

    const onMessageNotification = async (user: IUser) => {
      const lf = localFriendsRef.current.find((x) => x.id == user._id);
      if (lf?.isMuted) return;

      if (user._id == store.get(selectedFriendAtom) && document.hasFocus()) {
        return;
      }

      await api.other.notify(
        {
          title: tRef.current("friends.newMessage"),
          body: tRef.current("friends.sentMessage", {
            nickname: user.nickname,
          }),
          icon: user.image || "",
        },
        { type: "friend_message", friendId: user._id },
      );
      toast(tRef.current("friends.newMessage"), {
        description: tRef.current("friends.sentMessage", {
          nickname: user.nickname,
        }),
      });
    };

    const onGroupsUpdated = () => {
      void loadGroups();
    };

    const onGroupVoiceCount = (data: {
      groupId: string;
      count: number;
      participants?: string[];
    }) => {
      if (typeof data?.groupId !== "string") return;
      setGroups((prev) =>
        prev.map((group) =>
          group._id === data.groupId
            ? {
                ...group,
                participantCount: data.count || 0,
                voiceParticipants: Array.isArray(data.participants)
                  ? data.participants
                  : [],
              }
            : group,
        ),
      );
    };

    const onGroupInvites = (data: { invites: IGroupInvite[] }) => {
      setGroupInvites(Array.isArray(data?.invites) ? data.invites : []);
    };

    const onGroupInviteReceived = async (invite: IGroupInvite) => {
      setGroupInvites((prev) =>
        prev.some((item) => item._id === invite._id) ? prev : [...prev, invite],
      );

      const lf = localFriendsRef.current.find(
        (x) => x.id == invite.inviter._id,
      );
      if (lf?.isMuted) return;

      const description = tRef.current("groupInvite.body", {
        nickname: invite.inviter.nickname,
        group: invite.group.name,
      });

      toast(tRef.current("groupInvite.title"), {
        description,
        duration: 15000,
        action: {
          label: tRef.current("groupInvite.accept"),
          onClick: () => {
            friendSocket.emit("acceptGroupInvite", { inviteId: invite._id });
          },
        },
      });

      await api.other.notify({
        title: tRef.current("groupInvite.title"),
        body: description,
        icon: invite.inviter.image || "",
      });
    };

    const onGroupInviteResolved = (data: {
      inviteId: string;
      accepted: boolean;
      code?: string;
      group?: IGroup;
    }) => {
      setGroupInvites((prev) =>
        prev.filter((item) => item._id !== data.inviteId),
      );

      if (data.accepted) {
        if (data.group) {
          toast.success(
            tRef.current("groupInvite.joined", { group: data.group.name }),
          );
        }
        void loadGroups();
        return;
      }

      if (!data.code) return;

      if (data.code === "banned") {
        toast.error(tRef.current("groups.bannedToast"));
        return;
      }

      if (data.code === "group_full") {
        toast.error(tRef.current("groups.fullToast"));
        return;
      }

      if (
        data.code === "invite_not_found" ||
        data.code === "group_not_found"
      ) {
        toast.error(tRef.current("groupInvite.gone"));
        return;
      }

      showErrorToast(
        tRef.current("groupInvite.acceptFailed"),
        tRef.current("errors.serverCode", { code: data.code }),
        tRef.current("common.copy"),
      );
    };

    const onGroupMessage = (data: {
      groupId?: string;
      message?: { sender?: string };
    }) => {
      const groupId = typeof data?.groupId === "string" ? data.groupId : "";
      if (!groupId) return;
      if (data.message?.sender === store.get(authDataAtom)?.sub) return;
      if (data.message?.sender === "system") return;
      if (openGroupChatIdRef.current === groupId) return;

      setGroupUnreads((prev) => {
        const next = { ...prev, [groupId]: (prev[groupId] || 0) + 1 };
        saveGroupUnreads(next);
        return next;
      });

      if (mutedGroupsRef.current.includes(groupId)) return;
      playSound("notify");
    };

    const onGroupVoicePinged = (data: {
      sender?: IVoiceCallPeer;
      group?: { _id: string; name: string };
    }) => {
      const sender = data?.sender;
      const group = data?.group;
      if (!sender?._id || !group?._id) return;

      const lf = localFriendsRef.current.find((x) => x.id == sender._id);
      if (lf?.isMuted) return;
      if (mutedGroupsRef.current.includes(group._id)) return;

      toast(tRef.current("groups.voicePingTitle"), {
        description: tRef.current("groups.voicePingBody", {
          nickname: sender.nickname,
          group: group.name,
        }),
        duration: 15000,
        action: {
          label: tRef.current("groups.voicePingJoin"),
          onClick: () => {
            void (async () => {
              const token = store.get(accountAtom)?.accessToken;
              if (!token) return;
              const grant = await api.backend.groupJoinVoice(token, group._id);
              if (!grant) {
                showFailureToast(tRef.current("groups.joinError"), undefined, {
                  channels: ["backend:groupJoinVoice"],
                });
                return;
              }
              try {
                await voiceConnect(grant, {
                  roomId: group._id,
                  roomName: group.name,
                  isRoomOwner: false,
                });
              } catch (error) {
                showFailureToast(tRef.current("groups.joinError"), error, {
                  context: { side: "grubie" },
                });
              }
            })();
          },
        },
      });
      playSound("notify");
    };

    const onGroupInviteResult = (result: { ok: boolean; code?: string }) => {
      if (result.ok) {
        toast.success(tRef.current("groups.inviteSent"));
      } else if (result.code === "invite_exists") {
        toast.info(tRef.current("groups.inviteExists"));
      } else if (result.code === "already_member") {
        toast.info(tRef.current("groups.alreadyMember"));
      } else {
        showErrorToast(
          tRef.current("groups.actionError"),
          tRef.current("errors.serverCode", { code: result.code || "unknown" }),
          tRef.current("common.copy"),
        );
      }
    };

    friendSocket.on("friendRequest", onFriendRequest);
    friendSocket.on("friendRequestRemove", onFriendRequestRemove);
    friendSocket.on("messageNotification", onMessageNotification);
    friendSocket.on("groupsUpdated", onGroupsUpdated);
    friendSocket.on("groupVoiceCount", onGroupVoiceCount);
    friendSocket.on("groupInvites", onGroupInvites);
    friendSocket.on("groupInviteReceived", onGroupInviteReceived);
    friendSocket.on("groupInviteResolved", onGroupInviteResolved);
    friendSocket.on("groupInviteResult", onGroupInviteResult);
    friendSocket.on("groupMessage", onGroupMessage);
    friendSocket.on("groupVoicePinged", onGroupVoicePinged);

    return () => {
      friendSocket.off("friendRequest", onFriendRequest);
      friendSocket.off("friendRequestRemove", onFriendRequestRemove);
      friendSocket.off("messageNotification", onMessageNotification);
      friendSocket.off("groupsUpdated", onGroupsUpdated);
      friendSocket.off("groupVoiceCount", onGroupVoiceCount);
      friendSocket.off("groupInvites", onGroupInvites);
      friendSocket.off("groupInviteReceived", onGroupInviteReceived);
      friendSocket.off("groupInviteResolved", onGroupInviteResolved);
      friendSocket.off("groupInviteResult", onGroupInviteResult);
      friendSocket.off("groupMessage", onGroupMessage);
      friendSocket.off("groupVoicePinged", onGroupVoicePinged);
    };
  }, [
    friendSocket,
    localFriendsRef,
    mutedGroupsRef,
    openGroupChatIdRef,
    setFriendRequests,
    setGroupInvites,
    setGroupUnreads,
    setGroups,
    tRef,
  ]);

  return null;
}
