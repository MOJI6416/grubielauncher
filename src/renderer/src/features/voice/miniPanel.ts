import type { IVoiceParticipantState, IVoiceSessionState } from "@/types/Voice";

export function isVoiceDockVisible(routeName: string): boolean {
  return routeName === "people";
}

export function shouldShowVoiceMiniPanel(
  session: Pick<IVoiceSessionState, "state">,
  routeName: string,
): boolean {
  if (session.state === "disconnected") return false;
  return !isVoiceDockVisible(routeName);
}

export function speakingCount(participants: IVoiceParticipantState[]): number {
  return participants.filter(
    (participant) => participant.isSpeaking && !participant.isMuted,
  ).length;
}

export function voiceMiniTone(
  session: Pick<IVoiceSessionState, "state" | "micIssue">,
): "live" | "warning" {
  if (session.micIssue !== "none") return "warning";
  return session.state === "connected" ? "live" : "warning";
}
