import { ipcMain } from "electron";
import { isUsageFeature } from "@/shared/usageFeatures";
import { clearUsage, recordUsage } from "../utilities/usageStats";

export function registerUsageIpc() {
  ipcMain.removeAllListeners("usage:record");
  ipcMain.on("usage:record", (_event, feature: unknown) => {
    if (isUsageFeature(feature)) recordUsage(feature);
  });

  ipcMain.removeAllListeners("usage:clear");
  ipcMain.on("usage:clear", () => clearUsage());
}
