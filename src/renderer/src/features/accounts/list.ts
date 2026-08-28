import type { AccountType, ILocalAccount } from "@/types/Account";
import { accountIdentity, type AccountLike } from "./identity";
import { providerRank } from "./providers";
import { readAccountSession } from "./session";

export type AccountListItem = Pick<ILocalAccount, "type" | "nickname"> & {
  id?: string;
  accessToken?: string;
  refreshToken?: string;
};

export function duplicateNicknames(accounts: AccountListItem[]): Set<string> {
  const seen = new Map<string, Set<AccountType>>();

  for (const account of accounts) {
    const key = account.nickname.trim().toLowerCase();
    const types = seen.get(key) ?? new Set<AccountType>();
    types.add(account.type);
    seen.set(key, types);
  }

  const duplicates = new Set<string>();
  for (const [nickname, types] of seen) {
    if (types.size > 1) duplicates.add(nickname);
  }

  return duplicates;
}

export function isAmbiguousNickname(
  account: AccountListItem,
  duplicates: Set<string>,
): boolean {
  return duplicates.has(account.nickname.trim().toLowerCase());
}

export function sortAccounts<T extends AccountListItem>(
  accounts: T[],
  selectedIdentity?: string | null,
): T[] {
  return [...accounts].sort((a, b) => {
    if (selectedIdentity) {
      const aSelected = accountIdentity(a) === selectedIdentity;
      const bSelected = accountIdentity(b) === selectedIdentity;
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
    }

    const rank = providerRank(a.type) - providerRank(b.type);
    if (rank !== 0) return rank;

    return a.nickname.localeCompare(b.nickname);
  });
}

export function filterAccounts<T extends AccountListItem>(
  accounts: T[],
  query: string,
): T[] {
  const value = query.trim().toLowerCase();
  if (value === "") return accounts;

  return accounts.filter(
    (account) =>
      account.nickname.toLowerCase().includes(value) ||
      account.type.toLowerCase().includes(value),
  );
}

export type RemovalRisk = "running" | "last" | "selected" | null;

export function runningAccountIdentities(
  consoles: { status: string; account?: string }[],
): Set<string> {
  const running = new Set<string>();

  for (const entry of consoles) {
    if (entry.status !== "running") continue;
    if (entry.account) running.add(entry.account);
  }

  return running;
}

export function removalRisk(
  accounts: AccountListItem[],
  target: AccountLike,
  options: { isRunning?: boolean; selectedIdentity?: string | null } = {},
): RemovalRisk {
  const identity = accountIdentity(target);

  if (options.isRunning) return "running";

  if (accounts.length <= 1) return "last";
  if (options.selectedIdentity === identity) return "selected";

  return null;
}

export function nextSelectionAfterRemoval<T extends AccountListItem>(
  accounts: T[],
  removedIdentity: string,
  selectedIdentity: string | null | undefined,
): T | null {
  const rest = accounts.filter(
    (account) => accountIdentity(account) !== removedIdentity,
  );
  if (rest.length === 0) return null;

  if (selectedIdentity && selectedIdentity !== removedIdentity) {
    const kept = rest.find(
      (account) => accountIdentity(account) === selectedIdentity,
    );
    if (kept) return kept;
  }

  const healthy = rest.find(
    (account) => readAccountSession(account).state !== "expired",
  );

  return healthy ?? rest[0];
}
