import type { ServerRunResult, ServerRunStatus } from "@/types/Server";

type ServerRuntimeBridge = {
  start: (serverPath: string) => Promise<ServerRunResult>;
  stop: (serverPath: string, force?: boolean) => Promise<ServerRunResult>;
  runStatus: (serverPath: string) => Promise<ServerRunStatus>;
  onRunState: (
    callback: (payload: {
      serverPath: string;
      state: ServerRunStatus["state"];
      pid: number | null;
    }) => void,
  ) => () => void;
  onRunOutput: (
    callback: (payload: { serverPath: string; lines: string[] }) => void,
  ) => () => void;
};

export function getServerRuntime(): ServerRuntimeBridge | null {
  const bridge = window.api.server as unknown as Partial<ServerRuntimeBridge>;

  if (
    typeof bridge?.start !== "function" ||
    typeof bridge.stop !== "function" ||
    typeof bridge.runStatus !== "function" ||
    typeof bridge.onRunState !== "function" ||
    typeof bridge.onRunOutput !== "function"
  ) {
    return null;
  }

  return bridge as ServerRuntimeBridge;
}
