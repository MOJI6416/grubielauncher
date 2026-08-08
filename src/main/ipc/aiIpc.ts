import { IAiAnalysisResult, IAiFeedbackResult } from "@/types/AiAnalysis";
import { Backend } from "../services/Backend";
import {
  buildLogAnalysisRequest,
  getLauncherVersion,
  getPreparedRequest,
} from "../utilities/aiLogAnalysis";
import { handleSafe } from "../utilities/ipc";
import { assertReadablePath } from "../utilities/safePath";

export function registerAiIpc() {
  handleSafe(
    "ai:prepareCrashReport",
    null,
    async (
      _,
      versionPath: string,
      exitCode?: number,
      nickname?: string,
      versionName?: string,
      instance?: number,
    ) => {
      assertReadablePath(versionPath);

      return await buildLogAnalysisRequest(versionPath, {
        exitCode,
        nickname,
        versionName,
        instance,
      });
    },
  );

  handleSafe(
    "ai:analyzeCrash",
    { ok: false, error: { reason: "unavailable" } } as IAiAnalysisResult,
    async (_, at: string, requestId: string, locale: string) => {
      const request = getPreparedRequest(requestId);
      if (!request) {
        return {
          ok: false,
          error: { reason: "unavailable" },
        } as IAiAnalysisResult;
      }

      const backend = new Backend(at);

      return await backend.analyzeCrashLog(
        request,
        locale,
        getLauncherVersion(),
      );
    },
  );

  handleSafe(
    "ai:analysisFeedback",
    { ok: false, counted: false } as IAiFeedbackResult,
    async (_, at: string, analysisId: string, helpful: boolean) => {
      const backend = new Backend(at);

      return await backend.sendCrashAnalysisFeedback(analysisId, helpful);
    },
  );
}
