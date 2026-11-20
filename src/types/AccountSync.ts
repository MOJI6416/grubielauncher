import type { BackdropFrame, ThemeColors, ThemeMode } from "@/shared/themes";

export type AccountSyncFailure =
  | "offline"
  | "unauthorized"
  | "unsupported"
  | "duplicate"
  | "data_required"
  | "limit"
  | "failed";

export type SyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AccountSyncFailure; id?: string };

export interface RemoteWardrobeItem {
  kind: "skin" | "cape";
  hash: string;
  name: string;
  model: "classic" | "slim" | null;
  cape: string | null;
  changedAt: number;
}

export interface ThemePushPayload {
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  backdrop: ({ dim: number; blur: number; panelOpacity: number } & BackdropFrame) | null;
  changedAt: number;
  clientId: string;
}

export type WardrobeSyncResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: AccountSyncFailure };
