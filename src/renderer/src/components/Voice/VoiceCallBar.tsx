import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertTriangle,
  Headphones,
  HeadphoneOff,
  Link2,
  Mic,
  MicOff,
  PhoneOff,
  Settings2,
  UserPlus,
} from "lucide-react";
import { AccountHead } from "@renderer/features/accounts/AccountHead";
import { useFaceLookup } from "@renderer/features/accounts/faceDirectory";
import { Hint } from "@renderer/components/Hint";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  accountAtom,
  authDataAtom,
  friendSocketAtom,
  groupsAtom,
  voiceSessionAtom,
} from "@renderer/stores/atoms";
import { voiceLocalLevelAtom } from "@renderer/features/voice/state";
import {
  formatVoiceDuration,
  isVoiceLive,
  micButtonState,
  qualityRank,
  voiceRoomKind,
  voiceStatusKey,
} from "@renderer/features/voice/roomModel";
import {
  isAloneInRoom,
  pingableMembers,
  sortVoiceParticipants,
  splitOverflow,
} from "@renderer/features/voice/participants";
import {
  micIssueHintKey,
  micIssueTitleKey,
} from "@renderer/features/voice/errors";
import { canKickFromVoice } from "@renderer/features/voice/permissions";
import { groupConfirmCopy } from "@renderer/features/voice/groupConfirmations";
import { useVoicePing } from "@renderer/features/voice/useVoicePing";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import {
  voiceDisconnect,
  voiceRetryMic,
  voiceSetDeafened,
  voiceSetMicMuted,
} from "@renderer/utilities/voiceClient";
import { showFailureToast } from "@renderer/utilities/failures";
import { VoiceAudioPanel } from "./VoiceAudioPanel";
import { VoiceParticipantChip } from "./VoiceParticipantChip";
import { copyToClipboard } from "@renderer/utilities/clipboard";

const api = window.api;
const PING_COOLDOWN_MS = 60_000;
const LEVEL_BARS = 4;
const FULL_CHIP_LIMIT = 3;
const COMPACT_CHIP_LIMIT = 8;

const MIC_SETTINGS_URL: Record<string, string> = {
  win32: "ms-settings:privacy-microphone",
  darwin:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

function QualityBars({ rank }: { rank: number }) {
  return (
    <span className="flex items-end gap-[2px]" aria-hidden>
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={cn(
            "w-[3px] rounded-[1px]",
            index === 0 ? "h-1.5" : index === 1 ? "h-2.5" : "h-3.5",
            index < rank
              ? rank >= 3
                ? "bg-success"
                : rank === 2
                  ? "bg-success/70"
                  : "bg-warning"
              : "bg-surface-3",
          )}
        />
      ))}
    </span>
  );
}

function LevelMeter({ level }: { level: number }) {
  return (
    <span className="flex w-1 flex-col-reverse gap-[2px]" aria-hidden>
      {Array.from({ length: LEVEL_BARS }, (_, index) => (
        <span
          key={index}
          className={cn(
            "h-1 w-full rounded-[1px] transition-colors duration-75",
            index < level
              ? index === LEVEL_BARS - 1
                ? "bg-warning"
                : "bg-success"
              : "bg-surface-3",
          )}
        />
      ))}
    </span>
  );
}

export function VoiceCallBar({ inline = false }: { inline?: boolean } = {}) {
  const session = useAtomValue(voiceSessionAtom);
  const account = useAtomValue(accountAtom);
  const authData = useAtomValue(authDataAtom);
  const groups = useAtomValue(groupsAtom);
  const socket = useAtomValue(friendSocketAtom);
  const localLevel = useAtomValue(voiceLocalLevelAtom);
  const { t } = useTranslation();

  const [now, setNow] = useState(() => Date.now());
  const { ping, pending, pingedAt } = useVoicePing(socket);
  const [kickTarget, setKickTarget] = useState<{
    identity: string;
    name: string;
  } | null>(null);

  const isLive = isVoiceLive(session.state);

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

  const faceOf = useFaceLookup();

  const participantFace = (participant: { identity: string; name: string }) =>
    faceOf({
      _id: participant.identity,
      nickname: participant.name,
    });

  const participants = useMemo(
    () => sortVoiceParticipants(session.participants),
    [session.participants],
  );

  const selfId = authData?.sub || "";
  const roomKind = voiceRoomKind(session.roomId);
  const roomTitle =
    roomKind === "direct"
      ? session.roomName
      : (currentGroup?.name ?? session.roomName);

  const pingTargets = useMemo(() => {
    if (roomKind !== "group" || !currentGroup) return [];
    return pingableMembers(
      currentGroup.members,
      participants.map((participant) => participant.identity),
      selfId,
    );
  }, [currentGroup, participants, roomKind, selfId]);

  if (session.state === "disconnected") return null;

  const micState = micButtonState(session);
  const alone = isAloneInRoom(participants);
  const isCompactRoster = participants.length > FULL_CHIP_LIMIT;
  const roster = splitOverflow(
    participants,
    isCompactRoster ? COMPACT_CHIP_LIMIT : FULL_CHIP_LIMIT,
  );
  const micIssueTitle = micIssueTitleKey(session.micIssue);
  const systemMicSettingsUrl = MIC_SETTINGS_URL[api.platform] ?? "";

  const handleCopyInvite = async () => {
    if (!currentGroup) return;
    const copied = await copyToClipboard(
      `grubielauncher://group/join/${currentGroup.code}`,
    );
    if (!copied) return;
    toast.success(t("groups.linkCopied"));
  };

  const handleKick = async (identity: string) => {
    const accessToken = account?.accessToken || "";
    if (!accessToken || !session.roomId) return;

    const ok = await api.backend.groupKickMember(
      accessToken,
      session.roomId,
      identity,
    );
    if (!ok) {
      showFailureToast(t("groups.actionError"), undefined, {
        channels: ["backend:groupKickMember"],
      });
      return;
    }
    toast.success(t("groups.kicked"));
  };

  const kickCopy = groupConfirmCopy("kick");

  const handlePing = (memberId: string) => {
    if (!currentGroup) return;
    ping(memberId, currentGroup._id);
  };

  const pingButton = pingTargets.length > 0 && (
    <Popover>
      <Hint content={t("groups.inviteToVoice")}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            aria-label={t("groups.inviteToVoice")}
          >
            <UserPlus className="size-4" />
          </Button>
        </PopoverTrigger>
      </Hint>
      <PopoverContent align="end" side="top" className="w-64 p-2">
        <p className="mb-1.5 px-1 text-xs text-muted-foreground">
          {t("groups.inviteToVoiceHint")}
        </p>
        <ScrollArea className="max-h-56">
          <div className="flex flex-col gap-0.5 pr-2">
            {pingTargets.map((member) => {
              const cooling =
                now - (pingedAt[member._id] ?? 0) < PING_COOLDOWN_MS;
              const isSending = pending.includes(member._id);

              return (
                <div
                  key={member._id}
                  className="flex h-9 min-w-0 items-center gap-2 rounded-md px-1.5 hover:bg-surface-2"
                >
                  <AccountHead
                    account={faceOf({
                      _id: member._id,
                      nickname: member.nickname,
                    })}
                    size={24}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    {member.nickname}
                  </span>
                  <Button
                    size="xs"
                    variant={cooling || isSending ? "ghost" : "secondary"}
                    disabled={cooling || isSending}
                    onClick={() => handlePing(member._id)}
                  >
                    {isSending
                      ? t("groups.voicePinging")
                      : cooling
                        ? t("groups.voicePingSentShort")
                        : t("groups.voicePing")}
                  </Button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );

  return (
    <section
      className={cn(
        "flex h-[88px] items-stretch gap-3 overflow-hidden rounded-xl border bg-card px-3 py-2",
        isLive ? "border-border" : "border-warning/40",
        inline ? "w-full" : "fixed right-4 bottom-4 z-50 w-[720px]",
      )}
    >
      <div className="flex w-[188px] shrink-0 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <Headphones
            className={cn(
              "size-4 shrink-0",
              isLive ? "text-success" : "animate-pulse text-warning",
            )}
          />
          <Hint content={roomTitle} variant="text" truncatedOnly>
            <span className="min-w-0 truncate text-sm font-medium">
              {roomTitle || t("voice.title")}
            </span>
          </Hint>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{t(voiceStatusKey(session.state))}</span>
          {isLive && session.connectedAt > 0 && (
            <>
              <span className="text-faint">·</span>
              <span className="shrink-0 font-mono tabular-nums text-faint">
                {formatVoiceDuration(now - session.connectedAt)}
              </span>
            </>
          )}
          <span className="ml-auto shrink-0">
            <QualityBars rank={qualityRank(session.quality)} />
          </span>
        </div>

        {session.pttEnabled && (
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                "flex h-4 shrink-0 items-center rounded px-1 font-mono text-[9px] tracking-wide",
                session.pttPressed
                  ? "bg-success/20 text-success"
                  : "bg-surface-3 text-faint",
              )}
            >
              PTT
            </span>
            <span className="min-w-0 truncate text-[10px] text-faint">
              {session.pttBindLabel || t("settings.voicePttKeyNone")}
            </span>
          </div>
        )}
      </div>

      <span className="w-px shrink-0 bg-border" />

      <div className="flex min-w-0 flex-1 items-center">
        {micIssueTitle ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-warning/40 bg-surface-1 px-2.5 py-2">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-medium">
                {t(micIssueTitle)}
              </p>
              <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                {t(micIssueHintKey(session.micIssue))}
              </p>
            </div>
            {session.micIssue === "denied" && systemMicSettingsUrl && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={() =>
                  void api.shell.openExternal(systemMicSettingsUrl)
                }
              >
                {t("voice.micOpenSettings")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0"
              onClick={() => void voiceRetryMic()}
            >
              {t("voice.micRetry")}
            </Button>
          </div>
        ) : alone ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {participants.map((participant) => (
              <VoiceParticipantChip
                key={participant.identity}
                participant={participant}
                face={participantFace(participant)}
                canKick={false}
                onKick={() => undefined}
              />
            ))}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] text-muted-foreground">
                {t("voice.aloneTitle")}
              </p>
              <p className="line-clamp-2 text-[11px] leading-4 text-faint">
                {roomKind === "direct"
                  ? t("voice.aloneDirectHint")
                  : t("voice.aloneHint")}
              </p>
            </div>
            {currentGroup && (
              <Hint content={t("groups.copyLink")}>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8 shrink-0"
                  onClick={() => void handleCopyInvite()}
                  aria-label={t("groups.copyLink")}
                >
                  <Link2 className="size-4" />
                </Button>
              </Hint>
            )}
          </div>
        ) : (
          <div className="flex h-full min-w-0 flex-1 flex-wrap content-center items-center gap-1.5 overflow-hidden">
            {roster.visible.map((participant) => (
              <VoiceParticipantChip
                key={participant.identity}
                participant={participant}
                face={participantFace(participant)}
                canKick={canKickFromVoice(
                  currentGroup,
                  participant.identity,
                  selfId,
                )}
                compact={isCompactRoster}
                onKick={() =>
                  setKickTarget({
                    identity: participant.identity,
                    name: participant.name,
                  })
                }
              />
            ))}

            {roster.hidden > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 shrink-0 items-center rounded-lg border border-transparent bg-surface-2 px-2.5 font-mono text-[11px] tabular-nums text-muted-foreground transition-colors outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t("voice.moreParticipants", {
                      count: roster.hidden,
                    })}
                  >
                    +{roster.hidden}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-56 p-1.5">
                  <div className="flex flex-col gap-1">
                    {participants
                      .slice(participants.length - roster.hidden)
                      .map((participant) => (
                        <VoiceParticipantChip
                          key={participant.identity}
                          participant={participant}
                          face={participantFace(participant)}
                          canKick={canKickFromVoice(
                            currentGroup,
                            participant.identity,
                            selfId,
                          )}
                          className="w-full"
                          onKick={() =>
                            setKickTarget({
                              identity: participant.identity,
                              name: participant.name,
                            })
                          }
                        />
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>

      <span className="w-px shrink-0 bg-border" />

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="flex items-center gap-1">
          {(micState === "live" || micState === "ptt-active") && (
            <LevelMeter level={localLevel} />
          )}
          <Hint
            content={session.isMicMuted ? t("voice.unmute") : t("voice.mute")}
          >
            <Button
              size="icon"
              variant={
                micState === "muted" || micState === "deafened"
                  ? "destructive"
                  : "outline"
              }
              className={cn(
                "relative size-8",
                micState === "ptt-active" && "ring-2 ring-success",
                micState === "broken" && "border-warning text-warning",
              )}
              onClick={() => void voiceSetMicMuted(!session.isMicMuted)}
              aria-label={
                session.isMicMuted ? t("voice.unmute") : t("voice.mute")
              }
            >
              {session.isMicMuted ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>
          </Hint>
        </div>

        <Hint
          content={session.isDeafened ? t("voice.undeafen") : t("voice.deafen")}
        >
          <Button
            size="icon"
            variant={session.isDeafened ? "destructive" : "outline"}
            className="size-8"
            onClick={() => void voiceSetDeafened(!session.isDeafened)}
            aria-label={
              session.isDeafened ? t("voice.undeafen") : t("voice.deafen")
            }
          >
            {session.isDeafened ? (
              <HeadphoneOff className="size-4" />
            ) : (
              <Headphones className="size-4" />
            )}
          </Button>
        </Hint>

        {pingButton}

        <Popover>
          <Hint content={t("settings.sections.voice")}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                className="size-8 shrink-0"
                aria-label={t("settings.sections.voice")}
              >
                <Settings2 className="size-4" />
              </Button>
            </PopoverTrigger>
          </Hint>
          <PopoverContent align="end" side="top" className="w-80 p-3">
            <VoiceAudioPanel />
          </PopoverContent>
        </Popover>

        <Button
          size="sm"
          variant="destructive"
          className="h-8 shrink-0"
          onClick={() => void voiceDisconnect()}
        >
          <PhoneOff className="size-3.5" />
          {t("voice.leaveShort")}
        </Button>
      </div>

      {kickTarget && (
        <Confirmation
          title={t(kickCopy.titleKey)}
          reversible={kickCopy.reversible}
          content={kickCopy.lineKeys.map((key) => ({
            text: t(key, {
              nickname: kickTarget.name,
              group: roomTitle,
              name: roomTitle,
            }),
          }))}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setKickTarget(null),
            },
            {
              text: t(kickCopy.actionKey),
              color: kickCopy.actionColor,
              onClick: async () => {
                await handleKick(kickTarget.identity);
                setKickTarget(null);
              },
            },
          ]}
          onClose={() => setKickTarget(null)}
        />
      )}
    </section>
  );
}
