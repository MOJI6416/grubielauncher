import { jwtDecode } from "jwt-decode";

export function sessionNickname(token: string | undefined): string | null {
  if (!token) return null;

  try {
    const nickname = jwtDecode<{ nickname?: unknown }>(token).nickname;
    return typeof nickname === "string" && nickname.trim() !== ""
      ? nickname
      : null;
  } catch {
    return null;
  }
}

export function withSessionNickname<
  T extends { nickname: string; accessToken?: string },
>(account: T): T {
  const nickname = sessionNickname(account.accessToken);
  return nickname && nickname !== account.nickname
    ? { ...account, nickname }
    : account;
}
