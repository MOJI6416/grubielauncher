import { classifyError, type FailureSide } from "@/shared/errors";
import type { AccountType } from "@/types/Account";

export type AuthFailureReason =
  | "cancelled"
  | "timeout"
  | "portBusy"
  | "rejected"
  | "network"
  | "provider"
  | "unknown";

export interface AuthFailure {
  reason: AuthFailureReason;
  code: string;
  silent: boolean;
}

const AUTH_SIDES: Record<AccountType, FailureSide> = {
  microsoft: "microsoft",
  elyby: "elyby",
  discord: "discord",
  plain: "launcher",
};

export function authFailureSide(provider: AccountType): FailureSide {
  return AUTH_SIDES[provider] ?? "unknown";
}

function rawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }

  return "";
}

export function describeAuthFailure(
  error: unknown,
  provider: AccountType,
): AuthFailure {
  const message = rawMessage(error).toLowerCase();
  const info = classifyError(error, { side: authFailureSide(provider) });

  if (
    message.includes("oauth server was stopped") ||
    message.includes("oauth server was restarted") ||
    info.cause === "cancelled"
  ) {
    return { reason: "cancelled", code: info.code, silent: true };
  }

  if (message.includes("oauth callback timed out")) {
    return { reason: "timeout", code: info.code, silent: false };
  }

  if (message.includes("eaddrinuse") || message.includes("address already in use")) {
    return { reason: "portBusy", code: info.code, silent: false };
  }

  if (info.cause === "unauthorized" || info.cause === "forbidden") {
    return { reason: "rejected", code: info.code, silent: false };
  }

  if (
    info.cause === "offline" ||
    info.cause === "dns" ||
    info.cause === "refused" ||
    info.cause === "reset" ||
    info.cause === "timeout" ||
    info.cause === "tls"
  ) {
    return { reason: "network", code: info.code, silent: false };
  }

  if (info.cause === "serverError" || info.cause === "rateLimited") {
    return { reason: "provider", code: info.code, silent: false };
  }

  return { reason: "unknown", code: info.code, silent: false };
}
