import { handleSafe } from "../utilities/ipc";
import {
  readPackSessionQueue,
  readSyncQueue,
  reconcilePendingSessions,
  resolvePackSessions,
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

  handleSafe("statistics:getPackSessionQueue", [], async () => {
    return await readPackSessionQueue();
  });

  handleSafe(
    "statistics:resolvePackSessions",
    false,
    async (_, ids: string[]) => {
      await resolvePackSessions(ids);
      return true;
    },
  );
}
