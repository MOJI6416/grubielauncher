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

export const AUTH_REFUSED = "auth_refused";

const REFUSAL_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const REFUSAL_MARKER = new RegExp(`${AUTH_REFUSED}:([a-z][a-z0-9_]{0,63})\\b`);

export function authRefusalError(error: unknown): Error | null {
  const response = (
    error as { response?: { status?: unknown; data?: unknown } } | null
  )?.response;
  const status = response?.status;
  if (typeof status !== "number" || status < 400 || status >= 500) return null;

  const code = (response?.data as { code?: unknown } | null | undefined)?.code;
  if (typeof code !== "string" || !REFUSAL_CODE.test(code)) return null;

  return new Error(
    `${AUTH_REFUSED}:${code}: Request failed with status code ${status}`,
  );
}

export function authRefusalCode(error: unknown): string | null {
  const message =
    typeof error === "string"
      ? error
      : (error as { message?: unknown } | null)?.message;
  if (typeof message !== "string") return null;

  return REFUSAL_MARKER.exec(message)?.[1] ?? null;
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
