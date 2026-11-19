import { classifyError } from "./errors";

export const AUTH_PROVIDER_UNAVAILABLE = "auth_provider_unavailable";

const PROVIDER_UNAVAILABLE_MESSAGE = "Authentication provider is unavailable";

export type RefreshFailureKind =
  | "expired"
  | "providerDown"
  | "serviceDown"
  | "unknown";

export function providerOutageError(error: unknown): Error | null {
  const response = (
    error as { response?: { status?: unknown; data?: unknown } } | null
  )?.response;
  if (response?.status !== 503) return null;

  const data = response.data as { message?: unknown } | string | undefined;
  const message = typeof data === "string" ? data : data?.message;
  if (typeof message !== "string" || !message.includes(PROVIDER_UNAVAILABLE_MESSAGE)) {
    return null;
  }

  return new Error(
    `${AUTH_PROVIDER_UNAVAILABLE}: Request failed with status code 503`,
  );
}

const EXPIRED_CAUSES = new Set(["badRequest", "unauthorized", "forbidden"]);

const SERVICE_DOWN_CAUSES = new Set([
  "serverError",
  "rateLimited",
  "timeout",
  "offline",
  "dns",
  "refused",
  "reset",
  "tls",
]);

export function classifyRefreshFailure(error: unknown): RefreshFailureKind {
  const failure = classifyError(error);
  if (failure.message.includes(AUTH_PROVIDER_UNAVAILABLE)) return "providerDown";
  if (EXPIRED_CAUSES.has(failure.cause)) return "expired";
  if (SERVICE_DOWN_CAUSES.has(failure.cause)) return "serviceDown";
  return "unknown";
}
