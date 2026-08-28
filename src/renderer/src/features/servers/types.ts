import type { ServerPingResult } from "../../../../main/utilities/serverPing";
import type { ServerStatus } from "./serverList";

export interface ServerPingState extends ServerStatus {
  result?: ServerPingResult;
  checkedAt?: number;
}

export function toPingState(result: ServerPingResult): ServerPingState {
  return {
    state: result.online ? "online" : "offline",
    latencyMs: result.latencyMs,
    players: result.players,
    checkedAt: Date.now(),
    result,
  };
}
