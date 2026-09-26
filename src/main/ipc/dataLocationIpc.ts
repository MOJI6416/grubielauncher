import { app, BrowserWindow, dialog } from "electron";
import { check, handleSafe } from "../utilities/ipc";
import {
  getDataRoot,
  getDefaultDataRoot,
  isSamePath,
  readDataLocation,
  writeDataLocation,
} from "../utilities/dataRoot";
import { planDataTarget } from "../utilities/dataMove";
import { getProtectedDataRoots } from "../windows/dataLocationWindow";
import { HIDDEN_START_FLAG } from "../utilities/launchAtLogin";
import { gameRuntime } from "../utilities/runtime";
import { hasRunningServers } from "../game/Server";
import { isVersionInstallActive } from "./versionIpc";
import type {
  DataLocationApplyResult,
  DataLocationInfo,
  DataLocationPlan,
} from "@/types/DataLocation";

interface DataLocationChoice {
  chosen: string;
  exact: boolean;
}

let pendingChoice: DataLocationChoice | null = null;

function isLauncherBusy(): boolean {
  return (
    isVersionInstallActive() ||
    gameRuntime.processes.size > 0 ||
    hasRunningServers()
  );
}

function plan(choice: DataLocationChoice): Promise<DataLocationPlan> {
  return planDataTarget({
    chosen: choice.chosen,
    current: getDataRoot(),
    exact: choice.exact,
    protectedRoots: getProtectedDataRoots(),
    cleanup: readDataLocation().cleanup ?? [],
  });
}

function relaunch(): void {
  const args = process.argv
    .slice(1)
    .filter(
      (arg) => arg !== HIDDEN_START_FLAG && !arg.startsWith("grubielauncher:"),
    );
  app.relaunch({ args });
  setImmediate(() => app.quit());
}

export function registerDataLocationIpc() {
  handleSafe<DataLocationInfo>(
    "dataLocation:get",
    { root: "", defaultRoot: "", isDefault: true },
    () => {
      const root = getDataRoot();
      const defaultRoot = getDefaultDataRoot();
      return { root, defaultRoot, isDefault: isSamePath(root, defaultRoot) };
    },
  );

  handleSafe<DataLocationPlan | null>(
    "dataLocation:pick",
    null,
    async (event) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ["openDirectory", "createDirectory"],
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      const chosen = result.canceled ? null : result.filePaths[0];
      if (!chosen) return null;

      pendingChoice = { chosen, exact: false };
      return plan(pendingChoice);
    },
  );

  handleSafe<DataLocationPlan | null>(
    "dataLocation:planDefault",
    null,
    async () => {
      pendingChoice = { chosen: getDefaultDataRoot(), exact: true };
      return plan(pendingChoice);
    },
  );

  handleSafe<DataLocationApplyResult, ["move" | "adopt"]>(
    "dataLocation:apply",
    { ok: false, problem: "failed" },
    [check.oneOf("move", "adopt")],
    async (_event, kind) => {
      const choice = pendingChoice;
      if (!choice) return { ok: false, problem: "stale" };
      if (isLauncherBusy()) return { ok: false, problem: "busy" };

      const next = await plan(choice);
      if (next.kind === "error") return { ok: false, problem: next.problem };
      if (next.kind !== kind) return { ok: false, problem: "stale" };

      pendingChoice = null;
      const location = readDataLocation();

      if (next.kind === "adopt") {
        writeDataLocation({ root: next.target, cleanup: location.cleanup });
      } else {
        const current = getDataRoot();
        writeDataLocation({
          root: current,
          move: { from: current, to: next.target },
          cleanup: location.cleanup,
        });
      }

      relaunch();
      return { ok: true };
    },
  );
}
