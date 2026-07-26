import { IAccountConf } from "@/types/Account";
import { ipcMain } from "electron";
import {
  loadAccountsConfig,
  mergeIncomingAccounts,
  mutateAccountsConfig,
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

      await mutateAccountsConfig((current) => ({
        accounts: mergeIncomingAccounts(current.accounts, accounts),
        lastPlayed,
      }));

      return true;
    },
  );
}
