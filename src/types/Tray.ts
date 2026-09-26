export interface TrayLabels {
  open: string;
  play: string;
  running: string;
  voice: string;
  mute: string;
  deafen: string;
  leave: string;
  incoming: string;
  accept: string;
  decline: string;
  quit: string;
  installUpdate: string;
  playing: string;
  hintTitle: string;
  hintBody: string;
}

export interface TrayInstance {
  name: string;
  running: boolean;
  image?: string;
  minecraft?: string;
  loader?: string;
}

export interface TrayVoice {
  title: string;
  muted: boolean;
  deafened: boolean;
  since: number;
  participants: number;
}

export interface TrayModel {
  lang: string;
  accent: string;
  closeToTray: boolean;
  instances: TrayInstance[];
  playing: string[];
  voice: TrayVoice | null;
  incomingCall: { nickname: string } | null;
  updateVersion: string | null;
  labels: TrayLabels;
}

export type TrayAction =
  | { type: "launch"; versionName: string }
  | { type: "toggleMute" }
  | { type: "toggleDeafen" }
  | { type: "leaveVoice" }
  | { type: "acceptCall" }
  | { type: "declineCall" };

export type TrayCommand =
  | TrayAction
  | { type: "open" }
  | { type: "quit" }
  | { type: "installUpdate" };

export const TRAY_MAX_INSTANCES = 5;
export const TRAY_POPUP_WIDTH = 320;
