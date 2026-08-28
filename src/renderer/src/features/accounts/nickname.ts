import type { AccountType } from "@/types/Account";

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;

const ALLOWED = /^[A-Za-z0-9_]+$/;

export type NicknameIssue =
  | "empty"
  | "tooShort"
  | "tooLong"
  | "chars"
  | "duplicate";

type NicknameOwner = { nickname: string; type: AccountType };

export function validateOfflineNickname(
  raw: string,
  existing: NicknameOwner[] = [],
): NicknameIssue | null {
  const value = raw.trim();

  if (value === "") return "empty";
  if (value.length < NICKNAME_MIN) return "tooShort";
  if (value.length > NICKNAME_MAX) return "tooLong";
  if (!ALLOWED.test(value)) return "chars";

  const taken = existing.some(
    (account) =>
      account.type === "plain" &&
      account.nickname.toLowerCase() === value.toLowerCase(),
  );

  return taken ? "duplicate" : null;
}

export function isNicknameGameSafe(nickname: string): boolean {
  const value = nickname.trim();
  return value.length > 0 && value.length <= NICKNAME_MAX && ALLOWED.test(value);
}

export function nicknameInitials(nickname: string): string {
  const value = nickname.trim();
  if (value === "") return "?";

  return value.slice(0, 2).toUpperCase();
}
