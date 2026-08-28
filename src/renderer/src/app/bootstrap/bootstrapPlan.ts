import { LANGUAGES } from "@/types/Settings";
import {
  AccountLike,
  findAccountByIdentity,
} from "@renderer/features/accounts/identity";

export function resolveBootstrapLanguage(
  systemLocale: string,
  fallback: string,
): string {
  const match = LANGUAGES.find((language) =>
    String(systemLocale || "").includes(language.code),
  );

  return match?.code || fallback;
}

export interface AccountBootstrap<T> {
  account: T | null;
  persist: boolean;
}

export function resolveAccountBootstrap<T extends AccountLike>(
  accounts: T[],
  lastPlayed: string | null | undefined,
): AccountBootstrap<T> {
  const remembered = findAccountByIdentity(accounts, lastPlayed);
  if (remembered) return { account: remembered, persist: false };

  const fallback = accounts[0] ?? null;
  return { account: fallback, persist: !!fallback };
}

export function pickLastPlayedInstance<
  T extends { version: { lastLaunch?: Date | string | null } },
>(instances: T[]): T | null {
  return (
    [...instances].sort(
      (a, b) =>
        new Date(b.version.lastLaunch || 0).getTime() -
        new Date(a.version.lastLaunch || 0).getTime(),
    )[0] ?? null
  );
}
