import { jwtDecode } from "jwt-decode";
import type { IAuth, ILocalAccount } from "@/types/Account";

export type AccountLike = Pick<ILocalAccount, "type" | "nickname"> & {
  id?: string;
  accessToken?: string;
  uuid?: string | null;
};

export function isLauncherSessionToken(payload: unknown): payload is IAuth {
  if (!payload || typeof payload !== "object") return false;

  const claims = payload as Partial<IAuth>;
  if (typeof claims.sub !== "string" || claims.sub.trim() === "") return false;
  if (typeof claims.uuid !== "string" || claims.uuid.trim() === "") return false;
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return false;

  const auth = claims.auth;
  if (!auth || typeof auth !== "object") return false;
  if (typeof auth.accessToken !== "string" || auth.accessToken === "") return false;

  return typeof auth.expiresAt === "number" && Number.isFinite(auth.expiresAt);
}

export function decodeAccountToken(token?: string): IAuth | null {
  if (!token) return null;

  let payload: unknown;
  try {
    payload = jwtDecode(token);
  } catch {
    return null;
  }

  return isLauncherSessionToken(payload) ? payload : null;
}

export function accountSubject(account: AccountLike): string | null {
  const sub = decodeAccountToken(account.accessToken)?.sub;
  return typeof sub === "string" && sub.trim() !== "" ? sub : null;
}

export function accountKey(account: AccountLike): string {
  return `${account.type}_${account.nickname}`;
}

export function accountIdentity(account: AccountLike): string {
  const id = typeof account.id === "string" ? account.id.trim() : "";
  return id || accountSubject(account) || accountKey(account);
}

export function accountUuid(account: AccountLike): string | null {
  const uuid = decodeAccountToken(account.accessToken)?.uuid;
  return typeof uuid === "string" && uuid.trim() !== "" ? uuid : null;
}

export function findAccountByIdentity<T extends AccountLike>(
  accounts: T[],
  identity: string | null | undefined,
): T | null {
  if (!identity) return null;

  return (
    accounts.find((account) => accountIdentity(account) === identity) ??
    accounts.find((account) => accountKey(account) === identity) ??
    null
  );
}

export function isSameAccount(a: AccountLike, b: AccountLike): boolean {
  if (a.type !== b.type) return false;

  const left = accountSubject(a);
  const right = accountSubject(b);
  if (left && right) return left === right;

  return a.nickname === b.nickname;
}

export function headImageId(account: AccountLike): string | null {
  if (account.type === "plain") return null;
  if (account.type === "elyby") return account.nickname || null;

  const explicit = typeof account.uuid === "string" ? account.uuid.trim() : "";
  return explicit || accountUuid(account);
}

export function headImageUrl(
  account: AccountLike,
  apiBase: string,
  version?: string | number,
): string | null {
  const id = headImageId(account);
  if (!id) return null;

  const base = `${apiBase}/skins/head/${account.type}/${encodeURIComponent(id)}`;
  return version === undefined
    ? base
    : `${base}?v=${encodeURIComponent(String(version))}`;
}

export function userHeadUrl(
  apiBase: string,
  userId: string | null | undefined,
): string | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (!id) return null;

  return `${apiBase}/skins/head/user/${encodeURIComponent(id)}.png`;
}
