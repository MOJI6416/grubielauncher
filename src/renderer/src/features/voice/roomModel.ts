import type {
  IVoiceSessionState,
  VoiceConnectionState,
  VoiceQuality,
} from "@/types/Voice";

export const DIRECT_ROOM_PREFIX = "dm_";

export type VoiceRoomKind = "group" | "direct";

export function voiceRoomKind(roomId: string): VoiceRoomKind {
  return roomId.startsWith(DIRECT_ROOM_PREFIX) ? "direct" : "group";
}

export function isVoiceLive(state: VoiceConnectionState): boolean {
  return state === "connected" || state === "reconnecting";
}

export function voiceStatusKey(state: VoiceConnectionState): string {
  switch (state) {
    case "connected":
      return "voice.connected";
    case "reconnecting":
      return "voice.reconnecting";
    case "connecting":
      return "voice.connecting";
    default:
      return "voice.disconnected";
  }
}

export function qualityRank(quality: VoiceQuality): number {
  switch (quality) {
    case "excellent":
      return 3;
    case "good":
      return 2;
    case "poor":
      return 1;
    case "lost":
      return 0;
    default:
      return 0;
  }
}

export type MicButtonState =
  | "live"
  | "muted"
  | "deafened"
  | "ptt-idle"
  | "ptt-active"
  | "broken";

export function micButtonState(session: IVoiceSessionState): MicButtonState {
  if (session.micIssue !== "none") return "broken";
  if (session.isDeafened) return "deafened";
  if (session.isMicMuted) return "muted";
  if (session.pttEnabled) return session.pttPressed ? "ptt-active" : "ptt-idle";
  return "live";
}
