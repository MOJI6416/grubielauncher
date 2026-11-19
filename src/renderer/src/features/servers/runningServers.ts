import { atom } from "jotai";
import type { ServerRunState, ServerRunStatePayload } from "@/types/Server";

export const runningServersAtom = atom<ServerRunStatePayload[]>([]);

export const SERVER_STATE_LABEL_KEYS: Record<ServerRunState, string> = {
  stopped: "serverManager.stateStopped",
  starting: "serverManager.stateStarting",
  running: "serverManager.stateRunning",
  stopping: "serverManager.stateStopping",
};

export function serverPathKey(value: string): string {
  return value.replace(/[\\/]+/g, "/").replace(/\/$/, "").toLowerCase();
}

export function applyServerRunState(
  list: readonly ServerRunStatePayload[],
  payload: ServerRunStatePayload,
): ServerRunStatePayload[] {
  const key = serverPathKey(payload.serverPath);
  const rest = list.filter((entry) => serverPathKey(entry.serverPath) !== key);
  return payload.state === "stopped" ? rest : [...rest, payload];
}

export function isServerOfInstance(
  serverPath: string,
  versionPath: string,
): boolean {
  return (
    !!versionPath &&
    serverPathKey(serverPath) === `${serverPathKey(versionPath)}/server`
  );
}
