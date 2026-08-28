import { useEffect } from "react";
import { getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  INITIAL_VOICE_CALL,
  IVoiceCallPeer,
  IVoiceTokenResponse,
} from "@/types/Voice";
import { VoiceCallToast } from "@renderer/components/Voice/VoiceCallToast";
import {
  friendSocketAtom,
  localFriendsAtom,
  voiceCallAtom,
} from "@renderer/stores/atoms";
import { showErrorToast } from "@renderer/utilities/errorToast";
import { showFailureToast } from "@renderer/utilities/failures";
import { useLatestRef } from "@renderer/utilities/useLatestRef";
import { startCallSound, stopCallSound } from "@renderer/utilities/voiceCallSounds";
import { voiceConnect } from "@renderer/utilities/voiceClient";

const api = window.api;

export function VoiceCallHost() {
  const { t } = useTranslation();
  const tRef = useLatestRef(t);
  const friendSocket = useAtomValue(friendSocketAtom);
  const setVoiceCall = useSetAtom(voiceCallAtom);
  const localFriends = useAtomValue(localFriendsAtom);
  const localFriendsRef = useLatestRef(localFriends);

  useEffect(() => {
    if (!friendSocket) return;

    const store = getDefaultStore();

    const onVoiceCallIncoming = async (data: {
      callId: string;
      caller: IVoiceCallPeer;
    }) => {
      if (!data?.callId || !data?.caller) return;

      const lf = localFriendsRef.current.find((x) => x.id == data.caller._id);
      if (lf?.isMuted) {
        friendSocket.emit("voiceCallDecline", { callId: data.callId });
        return;
      }

      setVoiceCall({
        status: "incoming",
        callId: data.callId,
        peer: data.caller,
      });
      startCallSound("incoming");

      await api.other.notify({
        title: tRef.current("voiceCall.notificationTitle"),
        body: tRef.current("voiceCall.notificationBody", {
          nickname: data.caller.nickname,
        }),
        icon: data.caller.image || "",
      });
    };

    const onVoiceCallRinging = (data: {
      callId: string;
      recipient: IVoiceCallPeer;
    }) => {
      if (!data?.callId || !data?.recipient) return;
      setVoiceCall({
        status: "outgoing",
        callId: data.callId,
        peer: data.recipient,
      });
      startCallSound("outgoing");
    };

    const onVoiceCallAccepted = async (data: {
      callId: string;
      room: string;
      grant: IVoiceTokenResponse;
      peer: IVoiceCallPeer;
    }) => {
      stopCallSound();
      setVoiceCall(INITIAL_VOICE_CALL);

      try {
        await voiceConnect(data.grant, {
          roomId: data.room,
          roomName: data.peer?.nickname || "",
          isRoomOwner: false,
        });
      } catch (error) {
        showFailureToast(tRef.current("voiceCall.error"), error, {
          context: { side: "grubie" },
        });
      }
    };

    const onVoiceCallEnded = (data: { callId: string; reason?: string }) => {
      const current = store.get(voiceCallAtom);
      if (current.status === "idle" || current.callId !== data?.callId) return;

      stopCallSound();
      setVoiceCall(INITIAL_VOICE_CALL);

      const nickname = current.peer?.nickname || "";
      if (current.status === "outgoing") {
        if (data.reason === "declined") {
          toast(tRef.current("voiceCall.declined", { nickname }));
        } else if (data.reason === "timeout") {
          toast(tRef.current("voiceCall.noAnswer", { nickname }));
        } else if (data.reason === "error") {
          toast.error(tRef.current("voiceCall.error"));
        }
      } else {
        if (data.reason === "cancelled") {
          toast(tRef.current("voiceCall.cancelledByPeer", { nickname }));
        } else if (data.reason === "timeout") {
          toast(tRef.current("voiceCall.missed", { nickname }));
        } else if (data.reason === "error") {
          toast.error(tRef.current("voiceCall.error"));
        }
      }
    };

    const onVoiceCallError = (data: { code?: string }) => {
      stopCallSound();
      setVoiceCall(INITIAL_VOICE_CALL);

      if (data?.code === "busy") {
        toast.error(tRef.current("voiceCall.busy"));
      } else if (data?.code === "recipient_offline") {
        toast.error(tRef.current("voiceCall.offline"));
      } else if (data?.code === "too_soon") {
        toast.warning(tRef.current("voiceCall.tooSoon"));
      } else if (data?.code === "rate_limited") {
        toast.warning(tRef.current("voiceCall.rateLimited"));
      } else {
        showErrorToast(
          tRef.current("voiceCall.error"),
          tRef.current("errors.serverCode", { code: data?.code || "unknown" }),
          tRef.current("common.copy"),
        );
      }
    };

    const onDisconnect = () => {
      stopCallSound();
      setVoiceCall(INITIAL_VOICE_CALL);
    };

    friendSocket.on("voiceCallIncoming", onVoiceCallIncoming);
    friendSocket.on("voiceCallRinging", onVoiceCallRinging);
    friendSocket.on("voiceCallAccepted", onVoiceCallAccepted);
    friendSocket.on("voiceCallEnded", onVoiceCallEnded);
    friendSocket.on("voiceCallError", onVoiceCallError);
    friendSocket.on("disconnect", onDisconnect);

    return () => {
      friendSocket.off("voiceCallIncoming", onVoiceCallIncoming);
      friendSocket.off("voiceCallRinging", onVoiceCallRinging);
      friendSocket.off("voiceCallAccepted", onVoiceCallAccepted);
      friendSocket.off("voiceCallEnded", onVoiceCallEnded);
      friendSocket.off("voiceCallError", onVoiceCallError);
      friendSocket.off("disconnect", onDisconnect);
      stopCallSound();
    };
  }, [friendSocket, localFriendsRef, setVoiceCall, tRef]);

  return <VoiceCallToast />;
}
