import { handleSafe } from "../utilities/ipc";
import {
  readSyncQueue,
  reconcilePendingSessions,
  resolveSyncEntries,
} from "../utilities/statistics";

export function registerStatisticsIpc() {
  void reconcilePendingSessions();

  handleSafe("statistics:getSyncQueue", [], async () => {
    return await readSyncQueue();
  });

  handleSafe(
    "statistics:resolveSyncEntries",
    false,
    async (_, ids: string[]) => {
      await resolveSyncEntries(ids);
      return true;
    },
  );
}
