import fs from "fs-extra";
import path from "path";
import { CrashAnalysisPayload } from "@/types/CrashAnalysis";
import { analyzeGameCrash } from "./crashAnalyzer";
import { journal } from "../journal/journal";

const MOD_LOADING_FAILED =
  /Mod loading failures have occurred|Error during pre-loading phase/;
const SHUTDOWN_STARTED = /\]:\s*Stopping!$/;
const LAUNCH_ERROR = /^\[authlib-injector\] \[ERROR\] /;
const MAX_LAUNCH_ERRORS = 20;

export class GameExitTrace {
  modLoadingFailed = false;
  shutdownStarted = false;
  readonly launchErrors: string[] = [];

  constructor(readonly startedAt: number = Date.now()) {}

  line(text: string): void {
    if (!this.modLoadingFailed && MOD_LOADING_FAILED.test(text)) {
      this.modLoadingFailed = true;
    }
    if (text.endsWith("Stopping!") && SHUTDOWN_STARTED.test(text)) {
      this.shutdownStarted = true;
    }
    if (
      this.launchErrors.length < MAX_LAUNCH_ERRORS &&
      LAUNCH_ERROR.test(text)
    ) {
      this.launchErrors.push(text);
    }
  }
}

export async function hasCrashReportSince(
  versionPath: string,
  since: number,
): Promise<boolean> {
  const dir = path.join(versionPath, "crash-reports");
  const entries = await fs.readdir(dir).catch(() => [] as string[]);

  for (const entry of entries) {
    if (!entry.endsWith(".txt")) continue;
    const stats = await fs.stat(path.join(dir, entry)).catch(() => null);
    if (stats?.isFile() && stats.mtimeMs >= since) return true;
  }

  return false;
}

export function needsCrashAnalysis(
  code: number,
  trace: GameExitTrace,
  freshCrashReport: boolean,
): boolean {
  return code !== 0 || trace.modLoadingFailed || freshCrashReport;
}

export function isOrdinaryExit(
  code: number,
  trace: GameExitTrace,
  freshCrashReport: boolean,
  analysis: CrashAnalysisPayload | null,
): boolean {
  return (
    code !== 0 && trace.shutdownStarted && !freshCrashReport && !analysis
  );
}

export interface GameExit {
  versionPath: string;
  versionName: string;
  instance: number;
  code: number;
  trace: GameExitTrace;
  send: (channel: string, ...args: unknown[]) => void;
}

export async function reportGameExit(exit: GameExit): Promise<void> {
  const { versionPath, versionName, instance, code, trace, send } = exit;

  const freshCrashReport = await hasCrashReportSince(
    versionPath,
    trace.startedAt,
  );
  if (!needsCrashAnalysis(code, trace, freshCrashReport)) return;

  const analysis = await analyzeGameCrash(
    versionPath,
    code,
    trace.launchErrors.join("\n"),
  ).catch((error) => {
    console.error(
      `[crash] could not analyse the crash of ${versionName}:`,
      error,
    );
    return null;
  });

  if (isOrdinaryExit(code, trace, freshCrashReport, analysis)) {
    journal.info("game", "exit after shutdown", {
      versionName,
      instance,
      code,
    });
    return;
  }

  journal.info("game", "crash analysis", {
    versionName,
    instance,
    code,
    analysis: analysis ?? null,
  });

  if (!analysis) {
    send("crashUnresolved", {
      versionName,
      instance,
      versionPath,
      exitCode: code,
    });
    return;
  }

  send("crashAnalysis", versionName, instance, analysis);
}
