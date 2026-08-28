import {
  GameLogKind,
  IGameLogContent,
  IGameLogDiagnosis,
  IGameLogFile,
} from "@/types/GameLog";
import { analyzeCrashSource } from "../utilities/crashAnalyzer";
import { extractCrashSignature } from "../utilities/crashRules";
import { listGameLogs, readGameLog } from "../utilities/gameLogs";
import { check, handleSafe } from "../utilities/ipc";

const MAX_ANALYZED_CHARS = 256 * 1024;

const isPath = check.nonEmptyString(4096);
const isName = check.nonEmptyString(255);
const isKind = check.oneOf("latest", "debug", "archive", "crash", "native");

export function registerLogsIpc() {
  handleSafe<IGameLogFile[]>(
    "logs:list",
    [],
    [isPath],
    async (_, versionPath: string) => listGameLogs(versionPath),
  );

  handleSafe<IGameLogContent | null>(
    "logs:read",
    null,
    [isPath, isName, isKind],
    async (_, versionPath: string, name: string, kind: GameLogKind) =>
      readGameLog(versionPath, name, kind),
  );

  handleSafe<IGameLogDiagnosis | null>(
    "logs:analyze",
    null,
    [isPath, isName, isKind, check.optional(check.number())],
    async (
      _,
      versionPath: string,
      name: string,
      kind: GameLogKind,
      exitCode?: number,
    ) => {
      const content = await readGameLog(versionPath, name, kind);
      if (!content) return null;

      const text = content.text.slice(-MAX_ANALYZED_CHARS);
      return {
        analysis: await analyzeCrashSource(text, exitCode ?? undefined),
        signature: extractCrashSignature(text, exitCode ?? undefined),
      };
    },
  );
}
