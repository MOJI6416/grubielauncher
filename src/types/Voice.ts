export interface IVoiceTokenResponse {
  token: string;
  url: string;
}

export interface IGroupUser {
  _id: string;
  nickname: string;
  image?: string | null;
}

export interface IGroup {
  _id: string;
  name: string;
  code: string;
  owner: IGroupUser;
  members: IGroupUser[];
  banned: IGroupUser[];
  isOwner: boolean;
  participantCount: number;
  voiceParticipants?: string[];
}

export interface IGroupInvite {
  _id: string;
  group: {
    _id: string;
    name: string;
  };
  inviter: {
    _id: string;
    nickname: string;
    image?: string | null;
  };
  createdAt: string;
}

export type VoiceConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface IVoiceParticipantState {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  volume: number;
}

export interface IVoiceSessionState {
  state: VoiceConnectionState;
  roomId: string;
  roomName: string;
  isRoomOwner: boolean;
  participants: IVoiceParticipantState[];
  isMicMuted: boolean;
  isDeafened: boolean;
}

export type VoiceCallStatus = "idle" | "outgoing" | "incoming";

export interface IVoiceCallPeer {
  _id: string;
  nickname: string;
  image?: string | null;
}

export interface IVoiceCallState {
  status: VoiceCallStatus;
  callId: string;
  peer: IVoiceCallPeer | null;
}

export const INITIAL_VOICE_CALL: IVoiceCallState = {
  status: "idle",
  callId: "",
  peer: null,
};

export const INITIAL_VOICE_SESSION: IVoiceSessionState = {
  state: "disconnected",
  roomId: "",
  roomName: "",
  isRoomOwner: false,
  participants: [],
  isMicMuted: false,
  isDeafened: false,
};
