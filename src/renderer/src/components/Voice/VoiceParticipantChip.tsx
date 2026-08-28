import { useTranslation } from "react-i18next";
import { MicOff, UserX, Volume2, VolumeX } from "lucide-react";
import {
  AccountHead,
  type HeadFace,
} from "@renderer/features/accounts/AccountHead";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { IVoiceParticipantState } from "@/types/Voice";
import { volumePercent } from "@renderer/features/voice/participants";
import {
  voiceSetParticipantMuted,
  voiceSetParticipantVolume,
} from "@renderer/utilities/voiceClient";

export function VoiceParticipantChip({
  participant,
  face,
  canKick,
  compact = false,
  className,
  onKick,
}: {
  participant: IVoiceParticipantState;
  face: HeadFace;
  canKick: boolean;
  compact?: boolean;
  className?: string;
  onKick: () => void;
}) {
  const { t } = useTranslation();
  const isSilent = participant.isMuted || participant.isLocallyMuted;
  const isSpeaking = participant.isSpeaking && !isSilent;

  const status = participant.isLocallyMuted
    ? t("voice.mutedForYou")
    : participant.isMuted
      ? t("voice.mutedMic")
      : participant.isLocal
        ? t("voice.you")
        : participant.volume !== 1
          ? `${volumePercent(participant.volume)}%`
          : t("voice.listening");

  const body = (
    <>
      <span className="relative shrink-0">
        <AccountHead
          account={face}
          size={compact ? 20 : 28}
          className={cn(isSpeaking && "ring-2 ring-success")}
        />
        {isSilent && (
          <span
            className={cn(
              "absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-surface-3 ring-2 ring-card",
              compact ? "size-3" : "size-3.5",
            )}
          >
            {participant.isLocallyMuted ? (
              <VolumeX className="size-2 text-destructive" />
            ) : (
              <MicOff className="size-2 text-muted-foreground" />
            )}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 text-left">
        <Hint content={`${participant.name} · ${status}`} variant="text">
          <span
            className={cn(
              "block truncate",
              compact ? "text-[11px] leading-4" : "text-[12px] leading-4",
              isSpeaking ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {participant.name}
          </span>
        </Hint>
        {!compact && (
          <span className="block truncate text-[10px] leading-3.5 text-faint">
            {status}
          </span>
        )}
      </span>
    </>
  );

  const shell = cn(
    "flex shrink-0 items-center gap-2 rounded-lg border px-1.5 transition-colors",
    compact ? "h-8 w-[116px]" : "h-11 w-[136px]",
    isSpeaking
      ? "border-success/40 bg-success/10"
      : "border-transparent bg-surface-2",
    className,
  );

  if (participant.isLocal) {
    return <span className={shell}>{body}</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            shell,
            "outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label={participant.name}
        >
          {body}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-60 p-2">
        <p className="mb-2 truncate px-1 text-sm font-medium">
          {participant.name}
        </p>

        <div className="rounded-lg bg-surface-2 p-2">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Volume2 className="size-3.5" />
              {t("voice.volume")}
            </span>
            <span className="font-mono tabular-nums">
              {volumePercent(participant.volume)}%
            </span>
          </div>
          <Slider
            value={[volumePercent(participant.volume)]}
            max={200}
            step={5}
            disabled={participant.isLocallyMuted}
            onValueChange={(value) =>
              voiceSetParticipantVolume(
                participant.identity,
                (value[0] ?? 100) / 100,
              )
            }
          />
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-8 w-full justify-start"
          onClick={() =>
            voiceSetParticipantMuted(
              participant.identity,
              !participant.isLocallyMuted,
            )
          }
        >
          {participant.isLocallyMuted ? (
            <Volume2 className="size-3.5" />
          ) : (
            <VolumeX className="size-3.5" />
          )}
          {participant.isLocallyMuted
            ? t("voice.unmuteForYou")
            : t("voice.muteForYou")}
        </Button>

        {canKick && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-full justify-start text-destructive hover:text-destructive"
            onClick={onKick}
          >
            <UserX className="size-3.5" />
            {t("voice.kick")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
