import type {
  IVoiceParticipantState,
  IVoiceSessionState,
  VoiceOverlayState,
} from "@/types/Voice";
import { HIDDEN_VOICE_OVERLAY } from "@/types/Voice";
import { isVoiceLive } from "./roomModel";
import { participantInitials, sortVoiceParticipants } from "./participants";

export function buildOverlayState(
  session: Pick<IVoiceSessionState, "state" | "participants">,
  isGameRunning: boolean,
  isEnabled: boolean,
  headUrlOf: (participant: IVoiceParticipantState) => string | null = () =>
    null,
): VoiceOverlayState {
  if (!isEnabled || !isGameRunning || !isVoiceLive(session.state)) {
    return HIDDEN_VOICE_OVERLAY;
  }

  return {
    visible: true,
    speakers: sortVoiceParticipants(session.participants)
      .filter(
        (participant) =>
          participant.isSpeaking &&
          !participant.isMuted &&
          !participant.isLocallyMuted,
      )
      .map((participant) => ({
        id: participant.identity,
        name: participant.name,
        initials: participantInitials(participant.name),
        headUrl: headUrlOf(participant),
        isLocal: participant.isLocal,
      })),
  };
}

export function sameOverlayState(
  a: VoiceOverlayState,
  b: VoiceOverlayState,
): boolean {
  if (a.visible !== b.visible) return false;
  if (a.speakers.length !== b.speakers.length) return false;
  return a.speakers.every((speaker, index) => {
    const other = b.speakers[index];
    return (
      speaker.id === other.id &&
      speaker.name === other.name &&
      speaker.headUrl === other.headUrl
    );
  });
}
