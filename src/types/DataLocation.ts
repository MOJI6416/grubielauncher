export interface DataLocationFile {
  root?: string;
  move?: { from: string; to: string };
  cleanup?: string[];
}

export type DataTargetProblem =
  | "same"
  | "nested"
  | "notEmpty"
  | "readOnly"
  | "space"
  | "protected"
  | "cleanupPending"
  | "noData";

export type DataLocationPlan =
  | {
      kind: "move";
      target: string;
      bytes: number;
      freeBytes: number | null;
      sameVolume: boolean;
    }
  | { kind: "adopt"; target: string }
  | {
      kind: "error";
      problem: DataTargetProblem;
      target: string;
      bytes?: number;
      freeBytes?: number | null;
    };

export interface DataLocationInfo {
  root: string;
  defaultRoot: string;
  isDefault: boolean;
}

export type DataLocationApplyResult =
  | { ok: true }
  | { ok: false; problem: DataTargetProblem | "busy" | "stale" | "failed" };

export type DataMoveFailure =
  | "space"
  | "notEmpty"
  | "sourceMissing"
  | "verify"
  | "io";

export type DataLocationWindowState =
  | {
      kind: "moving";
      lang: string;
      from: string;
      to: string;
      phase: "scan" | "copy" | "finish";
      copiedBytes: number;
      totalBytes: number;
      cancelling: boolean;
    }
  | {
      kind: "failed";
      lang: string;
      from: string;
      to: string;
      reason: DataMoveFailure;
      detail: string | null;
    }
  | {
      kind: "missing";
      lang: string;
      root: string;
      busy: boolean;
      problem: DataTargetProblem | "stillMissing" | null;
    };

export type DataLocationWindowAction =
  | "cancel"
  | "continue"
  | "retry"
  | "pick"
  | "useDefault"
  | "quit";
