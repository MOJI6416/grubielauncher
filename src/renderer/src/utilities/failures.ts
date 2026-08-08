import i18n from "@renderer/i18n";
import { classifyError, FailureContext, FailureInfo } from "@/shared/errors";
import { showErrorToast } from "./errorToast";

const BUFFER_LIMIT = 20;
const DEFAULT_MAX_AGE_MS = 15000;

interface BufferedFailure {
  info: FailureInfo;
  consumed: boolean;
}

const buffer: BufferedFailure[] = [];

export function pushIpcFailure(info: FailureInfo) {
  if (info.cause === "cancelled") return;

  buffer.unshift({ info, consumed: false });
  if (buffer.length > BUFFER_LIMIT) buffer.length = BUFFER_LIMIT;
}

export function consumeRecentFailure(options?: {
  channels?: string[];
  maxAgeMs?: number;
}): FailureInfo | null {
  const maxAge = options?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();
  const channels = options?.channels;

  const entry = buffer.find((item) => {
    if (item.consumed) return false;
    if (now - item.info.time > maxAge) return false;
    if (!channels || channels.length === 0) return true;
    return channels.some(
      (channel) =>
        item.info.channel === channel ||
        (channel.endsWith(":") && item.info.channel?.startsWith(channel)),
    );
  });

  if (!entry) return null;

  entry.consumed = true;
  return entry.info;
}

function targetLabel(info: FailureInfo) {
  if (info.side === "external" || info.side === "unknown") {
    return info.host || i18n.t("errors.service.unknown");
  }

  const service = i18n.t(`errors.service.${info.side}`);
  return info.host ? `${service} (${info.host})` : service;
}

export function describeFailure(info: FailureInfo) {
  const reason = i18n.t(`errors.cause.${info.cause}`, {
    target: targetLabel(info),
    status: info.status ?? "",
  });
  const hint = i18n.t(`errors.hint.${info.cause}`, { defaultValue: "" });

  const technical = [
    info.message,
    info.channel ? `channel: ${info.channel}` : "",
    info.url ? `url: ${info.url}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const text = [reason, hint, `${i18n.t("errors.code")}: ${info.code}`]
    .filter(Boolean)
    .join("\n");

  return { text, technical, reason, hint };
}

export function reportIpcFailure(
  title: string,
  channels?: string[],
  options?: { toastId?: string | number; includeNotFound?: boolean },
): boolean {
  const info = consumeRecentFailure({ channels });
  if (!info) return false;
  if (info.cause === "cancelled") return false;
  if (info.cause === "notFound" && !options?.includeNotFound) return false;

  const described = describeFailure(info);
  showErrorToast(
    title,
    described.text,
    i18n.t("common.copy"),
    options?.toastId,
    described.technical,
  );
  return true;
}

function isRealError(error: unknown) {
  return error !== undefined && error !== null && error !== false;
}

export function showFailureToast(
  title: string,
  error?: unknown,
  options?: {
    channels?: string[];
    toastId?: string | number;
    context?: FailureContext;
    fallbackDescription?:
      | string
      | ((info: FailureInfo | null) => string | undefined);
  },
): FailureInfo | null {
  const resolveFallback = (info: FailureInfo | null) =>
    typeof options?.fallbackDescription === "function"
      ? options.fallbackDescription(info)
      : options?.fallbackDescription;

  let info = isRealError(error)
    ? classifyError(error, options?.context ?? {})
    : consumeRecentFailure({ channels: options?.channels });

  if (info?.cause === "unknown" && options?.channels) {
    const buffered = consumeRecentFailure({ channels: options.channels });
    if (buffered) info = buffered;
  }

  if (info?.cause === "cancelled") return info;

  if (!info) {
    showErrorToast(
      title,
      resolveFallback(null),
      i18n.t("common.copy"),
      options?.toastId,
    );
    return null;
  }

  const described = describeFailure(info);
  const fallback = info.cause === "unknown" ? resolveFallback(info) : undefined;
  const text = fallback || described.text;

  showErrorToast(
    title,
    text,
    i18n.t("common.copy"),
    options?.toastId,
    described.technical,
  );

  return info;
}
