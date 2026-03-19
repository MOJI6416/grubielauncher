import { IAccountConf } from "@/types/Account";
import { ipcMain } from "electron";
import {
  loadAccountsConfig,
  saveAccountsConfig,
} from "../utilities/accounts";

export function registerAccountsIpc() {
  ipcMain.removeHandler("accounts:load");
  ipcMain.removeHandler("accounts:save");

  ipcMain.handle("accounts:load", async () => {
    return await loadAccountsConfig();
  });

  ipcMain.handle(
    "accounts:save",
    async (
      _,
      accounts: IAccountConf["accounts"],
      lastPlayed: string | null,
    ) => {
      if (
        !Array.isArray(accounts) ||
        (lastPlayed !== null && typeof lastPlayed !== "string")
      ) {
        throw new Error("Invalid accounts payload");
      }

      const data: IAccountConf = {
        accounts,
        lastPlayed,
      };

      await saveAccountsConfig(data);
      return true;
    },
  );
}
