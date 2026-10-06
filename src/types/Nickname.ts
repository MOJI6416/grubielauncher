export interface INicknameStatus {
  nickname: string;
  providerNickname: string;
  custom: boolean;
  customizable: boolean;
  changedAt: string | null;
  nextChangeAt: string | null;
}

export type NicknameAvailability =
  | "available"
  | "current"
  | "invalid"
  | "reserved"
  | "taken"
  | "held";

export type NicknameChangeError =
  | Exclude<NicknameAvailability, "available">
  | "cooldown"
  | "not_customizable"
  | "not_custom"
  | "launcher_only"
  | "rate_limited"
  | "failed";

export type NicknameChangeResult =
  | { ok: true; status: INicknameStatus; accessToken: string }
  | { ok: false; error: NicknameChangeError; nextChangeAt: string | null };
