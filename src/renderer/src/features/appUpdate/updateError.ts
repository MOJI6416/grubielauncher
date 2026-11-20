import { classifyError, type FailureCause } from "@/shared/errors";

type Translate = (key: string, options?: Record<string, unknown>) => string;

const CHROMIUM_CAUSES: Array<[RegExp, FailureCause]> = [
  [/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE/, "offline"],
  [/ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/, "dns"],
  [/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/, "timeout"],
  [/ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/, "reset"],
  [/ERR_CONNECTION_REFUSED/, "refused"],
  [/ERR_CERT_|ERR_SSL_/, "tls"],
];

function causeOf(message: string): { cause: FailureCause; status?: number } {
  const chromium = CHROMIUM_CAUSES.find(([pattern]) => pattern.test(message));
  if (chromium) return { cause: chromium[1] };
  const info = classifyError(new Error(message));
  return { cause: info.cause, status: info.status };
}

export function describeUpdateError(
  message: string | undefined,
  t: Translate,
  { short = false }: { short?: boolean } = {},
): string {
  const info = message ? causeOf(message) : null;
  if (!info || info.cause === "unknown" || info.cause === "cancelled") {
    return t(short ? "appUpdate.errors.startAnyway" : "appUpdate.errors.unknown");
  }

  const cause = t(`errors.cause.${info.cause}`, {
    target: t("appUpdate.errors.target"),
    status: info.status ?? "",
  });
  return short ? cause : `${cause} ${t("appUpdate.errors.later")}`;
}
