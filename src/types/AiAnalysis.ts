export type AiAnalysisConfidence = "high" | "medium" | "low";

export interface IAiLogContext {
  mcVersion?: string;
  loaderName?: string;
  loaderVersion?: string;
  javaVersion?: string;
  javaArch?: string;
  memoryMb?: number;
  os?: string;
  exitCode?: number;
  mods?: string[];
}

export interface IAiLogRequest {
  id: string;
  log: string;
  context: IAiLogContext;
  reportPath: string | null;
}

export interface IAiLogAnalysis {
  analysisId: string;
  cause: string;
  confidence: AiAnalysisConfidence;
  suspects: string[];
  steps: string[];
  cached: boolean;
}

export interface IAiFeedbackResult {
  ok: boolean;
  counted: boolean;
}

export interface IAiAnalysisFailure {
  reason: "unauthorized" | "rateLimited" | "unavailable";
}

export type IAiAnalysisResult =
  | { ok: true; analysis: IAiLogAnalysis }
  | { ok: false; error: IAiAnalysisFailure };

export interface ICrashUnresolvedPayload {
  versionName: string;
  instance: number;
  versionPath: string;
  exitCode: number;
}
