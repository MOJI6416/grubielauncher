import { IAccountConf } from "@/types/Account";
import { check, handleSafe } from "../utilities/ipc";
import {
  loadAccountsConfig,
  mergeIncomingAccounts,
  mutateAccountsConfig,
} from "../utilities/accounts";

const MAX_ACCOUNTS = 256;

export function registerAccountsIpc() {
  handleSafe<IAccountConf | null>("accounts:load", null, async () => {
    return await loadAccountsConfig();
  });

  handleSafe<boolean, [IAccountConf["accounts"], string | null]>(
    "accounts:save",
    false,
    [
      check.arrayOf(check.object(), MAX_ACCOUNTS),
      check.optional(check.string(512)),
    ],
    async (_, accounts, lastPlayed) => {
      await mutateAccountsConfig((current) => ({
        accounts: mergeIncomingAccounts(current.accounts, accounts),
        lastPlayed: lastPlayed ?? null,
      }));

      return true;
    },
  );
}
