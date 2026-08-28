import type { ILocalAccount } from "@/types/Account";
import { decodeAccountToken } from "./identity";

export type SessionState =
  | "offline"
  | "active"
  | "renewable"
  | "expiring"
  | "expired";

export const SESSION_RENEW_MARGIN_MS = 120_000;

export interface AccountSessionInfo {
  state: SessionState;
  expiresAt: number | null;
  launcherExpiresAt: number | null;
  providerExpiresAt: number | null;
  msLeft: number | null;
  canRenew: boolean;
  needsSignIn: boolean;
}

type SessionAccount = Pick<
  ILocalAccount,
  "type" | "nickname" | "accessToken" | "refreshToken"
>;

function readExpiries(token: string): {
  launcher: number | null;
  provider: number | null;
  effective: number | null;
} {
  const decoded = decodeAccountToken(token);
  const empty = { launcher: null, provider: null, effective: null };
  if (!decoded) return empty;

  const launcher = typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  const provider =
    typeof decoded.auth?.expiresAt === "number" ? decoded.auth.expiresAt : null;

  const values = [launcher, provider].filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );

  return {
    launcher,
    provider,
    effective: values.length === 0 ? null : Math.min(...values),
  };
}

export function readAccountSession(
  account: SessionAccount,
  now = Date.now(),
): AccountSessionInfo {
  if (account.type === "plain") {
    return {
      state: "offline",
      expiresAt: null,
      launcherExpiresAt: null,
      providerExpiresAt: null,
      msLeft: null,
      canRenew: false,
      needsSignIn: false,
    };
  }

  const canRenew = Boolean(account.refreshToken);
  const expiries = account.accessToken
    ? readExpiries(account.accessToken)
    : { launcher: null, provider: null, effective: null };

  const base = {
    expiresAt: expiries.effective,
    launcherExpiresAt: expiries.launcher,
    providerExpiresAt: expiries.provider,
    canRenew,
  };

  if (expiries.effective === null) {
    return {
      ...base,
      state: canRenew ? "renewable" : "expired",
      msLeft: null,
      needsSignIn: !canRenew,
    };
  }

  const msLeft = expiries.effective - now;

  if (msLeft <= 0) {
    return {
      ...base,
      state: canRenew ? "renewable" : "expired",
      msLeft,
      needsSignIn: !canRenew,
    };
  }

  if (msLeft <= SESSION_RENEW_MARGIN_MS) {
    return {
      ...base,
      state: canRenew ? "renewable" : "expiring",
      msLeft,
      needsSignIn: false,
    };
  }

  return {
    ...base,
    state: "active",
    msLeft,
    needsSignIn: false,
  };
}

export function isSessionBroken(info: AccountSessionInfo): boolean {
  return info.state === "expired";
}

export function countBrokenSessions(accounts: SessionAccount[], now = Date.now()): number {
  return accounts.filter((account) =>
    isSessionBroken(readAccountSession(account, now)),
  ).length;
}

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
