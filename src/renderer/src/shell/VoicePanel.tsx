import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  ChevronsUpDown,
  Headphones,
  HeadphoneOff,
  Mic,
  MicOff,
  PhoneOff,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { IVoiceSessionState } from "@/types/Voice";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Hint } from "@renderer/components/Hint";
import { groupsAtom, voiceSessionAtom } from "@renderer/stores/atoms";
import {
  formatVoiceDuration,
  isVoiceLive,
  micButtonState,
  voiceRoomKind,
  voiceStatusKey,
} from "@renderer/features/voice/roomModel";
import {
  shouldShowVoiceMiniPanel,
  speakingCount,
  voiceMiniTone,
} from "@renderer/features/voice/miniPanel";
import { micIssueTitleKey } from "@renderer/features/voice/errors";
import { participantInitials } from "@renderer/features/voice/participants";
import {
  voiceDisconnect,
  voiceRetryMic,
  voiceSetDeafened,
  voiceSetMicMuted,
} from "@renderer/utilities/voiceClient";
import { currentRouteAtom } from "@renderer/navigation/store";
import { navigate } from "@renderer/navigation/navigate";

export function VoicePanel() {
  const session = useAtomValue(voiceSessionAtom);
  const route = useAtomValue(currentRouteAtom);
  const isVisible = shouldShowVoiceMiniPanel(session, route.name);

  return (
    <Collapse show={isVisible}>
      {isVisible ? <VoiceMiniPanel session={session} /> : null}
    </Collapse>
  );
}

function VoiceMiniPanel({ session }: { session: IVoiceSessionState }) {
  const groups = useAtomValue(groupsAtom);
  const { t } = useTranslation();

  const isLive = isVoiceLive(session.state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive || !session.connectedAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isLive, session.connectedAt]);

  const currentGroup = useMemo(
    () => groups.find((group) => group._id === session.roomId),
    [groups, session.roomId],
  );

  const roomKind = voiceRoomKind(session.roomId);
  const roomTitle =
    (roomKind === "direct"
      ? session.roomName
      : (currentGroup?.name ?? session.roomName)) || t("voice.title");

  const micState = micButtonState(session);
  const tone = voiceMiniTone(session);
  const micIssueTitle = micIssueTitleKey(session.micIssue);
  const speaking = speakingCount(session.participants);
  const openRoom = () =>
    navigate({
      name: "people",
      section: roomKind === "direct" ? "friends" : "groups",
    });

  return (
    <section
      aria-label={t("voice.title")}
      className={cn(
        "mb-1.5 flex flex-col gap-1.5 rounded-lg border bg-surface-2 px-2 py-1.5",
        tone === "live" ? "border-border" : "border-warning/40",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            tone === "live" ? "bg-success" : "animate-pulse bg-warning",
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[0.68rem] font-semibold tracking-[0.06em] uppercase",
            tone === "live" ? "text-success" : "text-warning",
          )}
        >
          {micIssueTitle ? t(micIssueTitle) : t(voiceStatusKey(session.state))}
        </span>

        {isLive && session.connectedAt > 0 && (
          <span className="shrink-0 font-mono text-[0.65rem] tabular-nums text-faint">
            {formatVoiceDuration(now - session.connectedAt)}
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={openRoom}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Headphones className="size-3.5 shrink-0 text-faint" />
          <Hint content={roomTitle} variant="text" side="right" truncatedOnly>
            <span className="min-w-0 flex-1 truncate text-[0.8rem] leading-4">
              {roomTitle}
            </span>
          </Hint>
        </button>

        {session.participants.length > 1 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("voice.inVoiceCount", {
                  count: session.participants.length,
                })}
                className="flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Users className="size-3" />
                <span className="font-mono text-[0.65rem] tabular-nums">
                  {session.participants.length}
                </span>
                <ChevronsUpDown className="size-2.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="w-52 p-1.5">
              <div className="flex flex-col gap-0.5">
                {session.participants.map((participant) => (
                  <div
                    key={participant.identity}
                    className="flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-medium",
                        participant.isSpeaking && !participant.isMuted
                          ? "bg-success/20 text-success"
                          : "bg-surface-3 text-faint",
                      )}
                    >
                      {participantInitials(participant.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {participant.name}
                    </span>
                    {participant.isMuted && (
                      <MicOff className="size-3 shrink-0 text-faint" />
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Hint
          side="top"
          content={
            micIssueTitle
              ? `${t(micIssueTitle)} — ${t("voice.micRetry")}`
              : session.isMicMuted
                ? t("voice.unmute")
                : t("voice.mute")
          }
        >
          <Button
            size="icon-sm"
            variant={
              micState === "muted" || micState === "deafened"
                ? "destructive"
                : "ghost"
            }
            className={cn(
              micState === "broken" && "text-warning",
              micState === "ptt-active" && "ring-2 ring-success",
            )}
            onClick={() =>
              micState === "broken"
                ? void voiceRetryMic()
                : void voiceSetMicMuted(!session.isMicMuted)
            }
            aria-label={
              micState === "broken"
                ? t("voice.micRetry")
                : session.isMicMuted
                  ? t("voice.unmute")
                  : t("voice.mute")
            }
          >
            {micState === "broken" ? (
              <TriangleAlert className="size-3.5" />
            ) : session.isMicMuted ? (
              <MicOff className="size-3.5" />
            ) : (
              <Mic className="size-3.5" />
            )}
          </Button>
        </Hint>

        <Hint
          content={session.isDeafened ? t("voice.undeafen") : t("voice.deafen")}
        >
          <Button
            size="icon-sm"
            variant={session.isDeafened ? "destructive" : "ghost"}
            onClick={() => void voiceSetDeafened(!session.isDeafened)}
            aria-label={
              session.isDeafened ? t("voice.undeafen") : t("voice.deafen")
            }
          >
            {session.isDeafened ? (
              <HeadphoneOff className="size-3.5" />
            ) : (
              <Headphones className="size-3.5" />
            )}
          </Button>
        </Hint>

        <span className="min-w-0 flex-1 truncate px-0.5 text-[0.65rem] text-faint">
          {speaking > 0
            ? t("voice.speakingCount", { count: speaking })
            : session.pttEnabled
              ? `PTT · ${session.pttBindLabel || t("settings.voicePttKeyNone")}`
              : ""}
        </span>

        <Hint content={t("voice.disconnect")}>
          <Button
            size="icon-sm"
            variant="destructive"
            onClick={() => void voiceDisconnect()}
            aria-label={t("voice.disconnect")}
          >
            <PhoneOff className="size-3.5" />
          </Button>
        </Hint>
      </div>
    </section>
  );
}
