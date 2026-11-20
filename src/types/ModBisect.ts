export const MOD_BISECT_VERSION = 1;

export interface ModBisectSnapshot {
  enabled: string[];
  disabled: string[];
}

export interface ModBisectAnswer {
  enabled: string[];
  problem: boolean;
  at: string;
}

export interface ModBisectPlanData {
  order: string[];
  kept: string[];
  dependencies: Record<string, string[]>;
}

export interface ModBisectSession {
  version: typeof MOD_BISECT_VERSION;
  startedAt: string;
  snapshot: ModBisectSnapshot;
  plan: ModBisectPlanData;
  extras: string[];
  extrasAnswer: boolean | null;
  answers: ModBisectAnswer[];
  labels: Record<string, string>;
  applied: string[];
}

export type ModBisectFailure = "running" | "exists" | "missing" | "changed";

export type ModBisectBeginResult =
  | { ok: true; session: ModBisectSession; failed: string[] }
  | { ok: false; reason: ModBisectFailure };

export type ModBisectApplyResult =
  | { ok: true; failed: string[] }
  | { ok: false; reason: ModBisectFailure };

export interface ModIdConflictFile {
  fileName: string;
  title: string;
  version: string;
  size: number;
  modifiedAt: number;
}

export interface ModIdConflict {
  modId: string;
  files: ModIdConflictFile[];
}
