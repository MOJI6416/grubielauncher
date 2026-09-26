import { TrayCommand, TrayModel } from "@/types/Tray";
import { AppUpdateState } from "@/types/AppUpdate";
import {
  getAppUpdateState,
  installDownloadedUpdate,
} from "../utilities/backgroundUpdates";
import { sanitizeTrayCommand, sanitizeTrayModel } from "../tray/trayMenu";
import { runTrayCommand, updateTray } from "../tray/tray";
import {
  getTrayPopupModel,
  hideTrayPopup,
  resizeTrayPopup,
  revealTrayPopup,
} from "../windows/trayPopup";
import {
  getLaunchAtLogin,
  LaunchAtLoginState,
  setLaunchAtLogin,
} from "../utilities/launchAtLogin";
import { check, handleSafe } from "../utilities/ipc";

export function registerTrayIpc() {
  handleSafe<void, [TrayModel]>(
    "tray:update",
    undefined,
    [check.object(16)],
    async (_, value) => {
      const model = sanitizeTrayModel(value);
      if (model) updateTray(model);
    },
  );

  handleSafe<TrayModel | null>("trayPopup:getModel", null, async () =>
    getTrayPopupModel(),
  );

  handleSafe<void, [TrayCommand]>(
    "trayPopup:run",
    undefined,
    [check.object(4)],
    async (_, value) => {
      const command = sanitizeTrayCommand(value);
      if (command) runTrayCommand(command);
    },
  );

  handleSafe<void, [number]>(
    "trayPopup:resize",
    undefined,
    [check.number()],
    async (_, height) => resizeTrayPopup(height),
  );

  handleSafe<void>("trayPopup:hide", undefined, async () => hideTrayPopup());

  handleSafe<void>("trayPopup:reveal", undefined, async () => revealTrayPopup());

  handleSafe<AppUpdateState>(
    "appUpdate:getState",
    { status: "idle" },
    async () => getAppUpdateState(),
  );

  handleSafe<boolean>(
    "appUpdate:install",
    false,
    async () => await installDownloadedUpdate(),
  );

  handleSafe<LaunchAtLoginState>(
    "system:getLaunchAtLogin",
    { supported: false, enabled: false },
    async () => await getLaunchAtLogin(),
  );

  handleSafe<LaunchAtLoginState, [boolean]>(
    "system:setLaunchAtLogin",
    { supported: false, enabled: false },
    [check.boolean()],
    async (_, enabled) => await setLaunchAtLogin(enabled),
  );
}
