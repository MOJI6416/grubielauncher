import type {
  NicknameChangeError,
  NicknameChangeResult,
} from "@/types/Nickname";

const KNOWN_ERRORS = new Set<NicknameChangeError>([
  "current",
  "invalid",
  "reserved",
  "taken",
  "held",
  "cooldown",
  "not_customizable",
  "not_custom",
  "launcher_only",
  "rate_limited",
]);

export function toNicknameFailure(
  error: unknown,
): Extract<NicknameChangeResult, { ok: false }> {
  const data = (error as { response?: { data?: unknown } } | null)?.response
    ?.data as { code?: unknown; nextChangeAt?: unknown } | undefined;

  const code = data?.code;
  const nextChangeAt =
    typeof data?.nextChangeAt === "string" ? data.nextChangeAt : null;

  return {
    ok: false,
    error: KNOWN_ERRORS.has(code as NicknameChangeError)
      ? (code as NicknameChangeError)
      : "failed",
    nextChangeAt,
  };
}
