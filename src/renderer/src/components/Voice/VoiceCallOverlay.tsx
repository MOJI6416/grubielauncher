import { useAtom } from "jotai";
import { friendSocketAtom, voiceCallAtom } from "@renderer/stores/atoms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, PhoneOff } from "lucide-react";
import { useTranslation } from "react-i18next";

export function VoiceCallOverlay() {
  const [call] = useAtom(voiceCallAtom);
  const [friendSocket] = useAtom(friendSocketAtom);
  const { t } = useTranslation();

  if (call.status === "idle" || !call.peer) return null;

  const isIncoming = call.status === "incoming";

  return (
    <div
      className="fixed right-4 z-[60] flex w-72 items-center gap-3 rounded-xl border bg-card p-3 shadow-xl"
      style={{ top: "calc(env(titlebar-area-height, 0px) + 1rem)" }}
    >
      <Avatar className="h-10 w-10">
        <AvatarImage src={call.peer.image || ""} alt={call.peer.nickname} />
        <AvatarFallback>
          {call.peer.nickname.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{call.peer.nickname}</p>
        <p className="animate-pulse text-xs text-muted-foreground">
          {isIncoming ? t("voiceCall.incoming") : t("voiceCall.outgoing")}
        </p>
      </div>

      {isIncoming ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="icon"
            className="size-9 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() =>
              friendSocket?.emit("voiceCallAccept", { callId: call.callId })
            }
            aria-label={t("voiceCall.accept")}
          >
            <Phone className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="destructive"
            className="size-9 rounded-full"
            onClick={() =>
              friendSocket?.emit("voiceCallDecline", { callId: call.callId })
            }
            aria-label={t("voiceCall.decline")}
          >
            <PhoneOff className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          size="icon"
          variant="destructive"
          className="size-9 shrink-0 rounded-full"
          onClick={() =>
            friendSocket?.emit("voiceCallCancel", { callId: call.callId })
          }
          aria-label={t("voiceCall.cancel")}
        >
          <PhoneOff className="size-4" />
        </Button>
      )}
    </div>
  );
}
