import { ShareStateError } from "@/types/Share";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function getShareErrorText(
  t: TranslateFn,
  error?: ShareStateError | null,
) {
  if (!error) return "";

  switch (error.code) {
    case "use_public_address":
      return t("share.errors.usePublicAddress");
    case "session_not_online":
      return t("share.errors.sessionNotOnline");
    case "active_share_exists":
      return t("share.errors.activeShareExists");
    case "not_friend":
      return t("share.errors.notFriend");
    case "lan_not_found":
      return t("share.errors.lanNotFound");
    case "local_port_unreachable":
      return t("share.errors.localPortUnreachable");
    case "share_not_started":
      return t("share.errors.shareNotStarted");
    case "not_authenticated":
      return t("share.errors.notAuthenticated");
    case "share_already_running":
      return t("share.errors.shareAlreadyRunning");
    case "share_busy":
      return t("share.errors.shareBusy");
    case "tunnel_auth_failed":
      return t("share.errors.tunnelAuthFailed");
    case "tunnel_already_active":
      return t("share.errors.tunnelAlreadyActive");
    case "tunnel_disconnected":
      return t("share.errors.tunnelDisconnected");
    case "tunnel_handshake_timeout":
      return t("share.errors.tunnelHandshakeTimeout");
    case "tunnel_protocol_error":
      return t("share.errors.tunnelProtocolError");
    case "tunnel_version_unsupported":
      return t("share.errors.tunnelVersionUnsupported", {
        defaultValue: t("share.errors.tunnelProtocolError"),
      });
    case "join_share_not_found":
      return t("share.errors.joinShareNotFound");
    case "invalid_response":
      return t("share.errors.invalidResponse");
    default:
      return error.message || t("share.errors.unknown");
  }
}

export function getShareErrorDetails(
  t: TranslateFn,
  error?: ShareStateError | null,
) {
  if (!error) return undefined;

  const parts = [
    error.code ? t("errors.serverCode", { code: error.code }) : "",
    error.message && error.message !== getShareErrorText(t, error)
      ? error.message
      : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : undefined;
}
