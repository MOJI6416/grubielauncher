import { watchStreamingApps } from "../services/StreamingWatch";
import { check, handleSafe } from "../utilities/ipc";

export function registerStreamerIpc() {
  handleSafe<string | null, [boolean]>(
    "streamer:watch",
    null,
    [check.boolean()],
    async (_, enabled) => await watchStreamingApps(enabled),
  );
}
