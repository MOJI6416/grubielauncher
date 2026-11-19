import type { Loader } from "./Loader";

export const SHARED_GROUPS = [
  "controls",
  "video",
  "servers",
  "packs",
  "hotbars",
  "history",
] as const;

export type SharedGroup = (typeof SHARED_GROUPS)[number];

export type SharedGroupBlock = "share";

export interface SharedInstanceRef {
  versionPath: string;
  mcVersion: string;
  loader: Loader;
  shareCode?: string;
}

export interface SharedInstanceStatus {
  connected: boolean;
  pending: boolean;
  off: SharedGroup[];
  blocked: Partial<Record<SharedGroup, SharedGroupBlock>>;
  hasBackup: boolean;
}

export interface SharedInstanceChoice {
  connected: boolean;
  off: SharedGroup[];
}

export interface SharedProfileSummary {
  autoConnect: boolean;
  options: number;
  servers: number;
  packs: number;
  hotbars: boolean;
  history: number;
}

export interface SharedOverview {
  profile: SharedProfileSummary;
  connected: string[];
}

export function isSharedGroup(value: unknown): value is SharedGroup {
  return (
    typeof value === "string" &&
    (SHARED_GROUPS as readonly string[]).includes(value)
  );
}
