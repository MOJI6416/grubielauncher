import { useEffect, useRef, useState } from "react";
import { getDefaultStore, useAtomValue } from "jotai";
import { toast } from "sonner";
import { Loader2, Phone, PhoneOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PlayerHead } from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  friendSocketAtom,
  friendsAtom,
  voiceCallAtom,
  voiceSessionMetaAtom,
} from "@renderer/stores/atoms";

const CALL_TOAST_ID = "voice-call";

export function VoiceCallToast() {
  const call = useAtomValue(voiceCallAtom);
  const session = useAtomValue(voiceSessionMetaAtom);
  const friends = useAtomValue(friendsAtom);
  const { t } = useTranslation();
  const shownRef = useRef(false);
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    setPending(null);
  }, [call.status, call.callId]);

  useEffect(() => {
    if (call.status === "idle" || !call.peer) {
      if (shownRef.current) {
        toast.dismiss(CALL_TOAST_ID);
        shownRef.current = false;
      }
      return;
    }

    const peer = call.peer;
    const callId = call.callId;
    const isIncoming = call.status === "incoming";
    const emit = (event: string, action: "accept" | "decline") => {
      if (pending) return;
      setPending(action);
      getDefaultStore().get(friendSocketAtom)?.emit(event, { callId });
    };

    const friend = friends.find((entry) => entry.user._id === peer._id);
    const activity = friend?.versionName || "";
    const leavingRoom =
      session.state === "disconnected" ? "" : session.roomName || "";

    shownRef.current = true;

    toast.custom(
      () => (
        <div className="flex w-full items-center gap-3">
          <span className="relative flex shrink-0 items-center justify-center">
            <span className="absolute size-12 animate-ping rounded-lg bg-primary/25" />
            <PlayerHead
              user={{
                _id: peer._id,
                nickname: peer.nickname,
                platform: friend?.user.platform ?? null,
                uuid: friend?.user.uuid ?? null,
              }}
              size={44}
              className="relative ring-2 ring-primary/60"
            />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{peer.nickname}</p>
            <p className="truncate text-xs text-muted-foreground">
              {isIncoming ? t("voiceCall.incoming") : t("voiceCall.outgoing")}
            </p>
            {leavingRoom ? (
              <p className="truncate text-[11px] leading-4 text-warning">
                {t("voiceCall.willLeaveRoom", { room: leavingRoom })}
              </p>
            ) : (
              activity && (
                <p className="truncate text-[11px] leading-4 text-faint">
                  {t("voiceCall.peerPlaying", { version: activity })}
                </p>
              )
            )}
          </div>

          {isIncoming ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <Hint content={t("voiceCall.accept")}>
                <Button
                  size="icon"
                  className="size-9 rounded-full bg-success text-success-foreground hover:bg-success/90"
                  disabled={!!pending}
                  onClick={() => emit("voiceCallAccept", "accept")}
                  aria-label={t("voiceCall.accept")}
                >
                  {pending === "accept" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Phone className="size-4" />
                  )}
                </Button>
              </Hint>
              <Hint content={t("voiceCall.decline")}>
                <Button
                  size="icon"
                  variant="destructive"
                  className="size-9 rounded-full"
                  disabled={!!pending}
                  onClick={() => emit("voiceCallDecline", "decline")}
                  aria-label={t("voiceCall.decline")}
                >
                  {pending === "decline" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <PhoneOff className="size-4" />
                  )}
                </Button>
              </Hint>
            </div>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 shrink-0"
              disabled={!!pending}
              onClick={() => emit("voiceCallCancel", "decline")}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <PhoneOff className="size-3.5" />
              )}
              {t("voiceCall.cancel")}
            </Button>
          )}
        </div>
      ),
      {
        id: CALL_TOAST_ID,
        duration: Infinity,
        dismissible: false,
        classNames: {
          toast:
            "border-border bg-popover text-popover-foreground rounded-xl px-4 py-3 shadow-lg",
        },
      },
    );
  }, [call.status, call.callId, call.peer, friends, pending, session, t]);

  useEffect(
    () => () => {
      toast.dismiss(CALL_TOAST_ID);
    },
    [],
  );

  return null;
}
