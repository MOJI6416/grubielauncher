import type { ConnectivityCheckResult } from "./Connectivity";

export type JournalLevel = "debug" | "info" | "warn" | "error";

export type JournalSource = "main" | "ui";

export interface JournalEntry {
  t: number;
  l: JournalLevel;
  src: JournalSource;
  sid: string;
  s: string;
  m: string;
  d?: Record<string, unknown>;
  sp?: string;
  ms?: number;
}

export interface JournalUiEntry {
  t: number;
  l: JournalLevel;
  s: string;
  m: string;
  d?: Record<string, unknown>;
}

export interface JournalStatus {
  dir: string;
  sessionId: string;
  verboseUntil: number | null;
  files: number;
  sizeBytes: number;
}

export type SupportReportTrigger =
  | "settings"
  | "crash"
  | "stall"
  | "failure"
  | "tray"
  | "logs";

export interface SupportReportConsoleState {
  versionName: string;
  instance: number;
  status: string;
  startTime?: number;
}

export interface SupportReportUiState {
  route?: string;
  lang?: string;
  isRunning?: boolean;
  installActive?: boolean;
  onlineConnected?: boolean;
  consoles?: SupportReportConsoleState[];
}

export interface SupportReportRequest {
  trigger: SupportReportTrigger;
  comment?: string;
  versionName?: string;
  runConnectivity?: boolean;
  ui?: SupportReportUiState;
}

export type SupportReportSectionId =
  | "system"
  | "settings"
  | "accounts"
  | "instances"
  | "target"
  | "java"
  | "connectivity"
  | "journal"
  | "attachments"
  | "crashDumps";

export interface SupportReportSection {
  id: SupportReportSectionId;
  bytes: number;
  items?: number;
}

export interface SupportReportPrepared {
  id: string;
  sections: SupportReportSection[];
  totalBytes: number;
  compressedBytes: number;
  versionName?: string;
}

export type SupportReportFailureReason =
  | "expired"
  | "network"
  | "rateLimited"
  | "tooLarge"
  | "rejected";

export type SupportReportSendResult =
  | { ok: true; code: string; expiresAt: string }
  | { ok: false; reason: SupportReportFailureReason; status?: number };

export interface SupportReportHistoryItem {
  code: string;
  createdAt: number;
  expiresAt: string;
  trigger: SupportReportTrigger;
  versionName?: string;
}

export interface SupportBundleAttachment {
  name: string;
  size: number;
  truncated: boolean;
  text: string;
}

export interface SupportBundleInstance {
  name: string;
  minecraft: string;
  loader: string;
  loaderVersion?: string;
  mods: number;
  shareCode?: string;
  lastLaunch?: string;
  build?: number;
}

export interface SupportBundle {
  format: "grubie-support-report";
  version: 1;
  createdAt: string;
  sessionId: string;
  trigger: SupportReportTrigger;
  comment?: string;
  app: Record<string, unknown>;
  system: Record<string, unknown>;
  ui?: SupportReportUiState;
  settings?: Record<string, unknown> | null;
  accounts?: Array<Record<string, unknown>>;
  instances?: SupportBundleInstance[];
  target?: Record<string, unknown> | null;
  java?: Array<Record<string, unknown>>;
  connectivity?: ConnectivityCheckResult[] | null;
  journal: {
    files: string[];
    lines: number;
    truncated: boolean;
    text: string;
  };
  attachments: SupportBundleAttachment[];
  crashDumps?: Array<{ name: string; size: number; modifiedAt: string }>;
}

export interface LaunchStalledPayload {
  versionName: string;
  instance: number;
  afterMs: number;
  alive: boolean;
  outLines: number;
}
