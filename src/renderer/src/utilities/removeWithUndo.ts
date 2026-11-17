import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { showUndoToast, UNDO_TOAST_MS } from "@renderer/utilities/undoToast";

const api = window.api;

const PARKED_SUFFIX = "deleting";
const PARKED_NAME = /\.\d{13}\.deleting$/;

const pending = new Map<string, () => void>();
let flushHooked = false;

export function isParkedName(name: string): boolean {
  return PARKED_NAME.test(name);
}

export function parkedPathFor(
  target: string,
  parkDir: string,
  now = Date.now(),
) {
  return api.path.join(
    parkDir,
    `${api.path.basename(target)}.${now}.${PARKED_SUFFIX}`,
  );
}

function hookFlush() {
  if (flushHooked) return;
  flushHooked = true;
  window.addEventListener("pagehide", () => {
    for (const finish of [...pending.values()]) finish();
  });
}

export async function sweepParked(folders: string[]): Promise<void> {
  await Promise.all(
    folders.map(async (folder) => {
      const names = await api.fs.readdir(folder).catch(ignoreFailure);
      for (const name of names ?? []) {
        const full = api.path.join(folder, name);
        if (isParkedName(name) && !pending.has(full)) {
          await api.shell.trashItem(full).catch(ignoreFailure);
        }
      }
    }),
  );
}

export async function removeWithUndo({
  target,
  parkDir,
  title,
  description,
  failTitle,
  failDescription,
  onRemoved,
  onRestored,
}: {
  target: string;
  parkDir: string;
  title: string;
  description?: string;
  failTitle: string;
  failDescription?: string;
  onRemoved: () => void;
  onRestored: () => void;
}): Promise<boolean> {
  const parked = parkedPathFor(target, parkDir);
  const fail = (error?: unknown) =>
    showFailureToast(failTitle, error, {
      channels: ["fs:rename", "fs:ensure", "shell:trashItem"],
      fallbackDescription: failDescription,
    });

  try {
    if (
      !(await api.fs.ensure(parkDir)) ||
      !(await api.fs.rename(target, parked))
    ) {
      fail();
      return false;
    }
  } catch (error) {
    fail(error);
    return false;
  }

  onRemoved();
  hookFlush();

  const finish = () => {
    if (!pending.delete(parked)) return;
    window.clearTimeout(timer);
    void api.shell.trashItem(parked).then((ok) => {
      if (!ok) fail();
    }, fail);
  };
  const timer = window.setTimeout(finish, UNDO_TOAST_MS);
  pending.set(parked, finish);

  showUndoToast(
    title,
    async () => {
      if (!pending.delete(parked)) return;
      window.clearTimeout(timer);

      try {
        if (!(await api.fs.rename(parked, target))) {
          fail();
          return;
        }
      } catch (error) {
        fail(error);
        return;
      }

      onRestored();
    },
    { description },
  );

  return true;
}
