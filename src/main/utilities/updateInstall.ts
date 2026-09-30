import { app } from "electron";
import { autoUpdater } from "electron-updater";
import { clearUpdateAttempt, writeUpdateAttempt } from "./updateLoopGuard";
import { clearHiddenRelaunch, markHiddenRelaunch } from "./launchAtLogin";

let installing = false;

export async function scheduleUpdateInstall(options: {
  version: string;
  hidden?: boolean;
  delay: number;
  onInstall: () => void;
  onError: (error: Error) => void;
}): Promise<boolean> {
  if (installing) return false;
  installing = true;
  const pending: { timer?: NodeJS.Timeout; failed: boolean } = {
    failed: false,
  };
  const dir = app.getPath("userData");
  const fail = (error: Error) => {
    if (pending.failed) return;
    pending.failed = true;
    if (pending.timer) clearTimeout(pending.timer);
    autoUpdater.off("error", fail);
    if (options.hidden) clearHiddenRelaunch();
    void clearUpdateAttempt(dir).finally(() => {
      installing = false;
      options.onError(error);
    });
  };

  await writeUpdateAttempt(dir, {
    target: options.version,
    from: app.getVersion(),
    exe: process.execPath,
    at: Date.now(),
  });
  autoUpdater.once("error", fail);
  if (options.hidden) markHiddenRelaunch();
  options.onInstall();
  if (pending.failed) return false;
  pending.timer = setTimeout(() => {
    try {
      // Silent NSIS installation keeps a login start hidden. Force relaunch is
      // explicit because silent installation otherwise does not reopen the app.
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  }, options.delay);
  return true;
}
