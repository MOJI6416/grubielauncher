import { ShareStateError, ShareStatePhase } from "@/types/Share";

type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

type ShareStatusColor =
  | "default"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "danger";

const sharePhaseMeta: Record<
  ShareStatePhase,
  {
    color: ShareStatusColor;
    textKey: string;
    descriptionKey: string;
  }
> = {
  idle: {
    color: "default",
    textKey: "share.states.idle",
    descriptionKey: "share.descriptions.idle",
  },
  lan_not_found: {
    color: "danger",
    textKey: "share.states.lanNotFound",
    descriptionKey: "share.descriptions.lanNotFound",
  },
  lan_ready: {
    color: "success",
    textKey: "share.states.lanReady",
    descriptionKey: "share.descriptions.lanReady",
  },
  share_starting: {
    color: "warning",
    textKey: "share.states.shareStarting",
    descriptionKey: "share.descriptions.shareStarting",
  },
  tunnel_connecting: {
    color: "warning",
    textKey: "share.states.tunnelConnecting",
    descriptionKey: "share.descriptions.tunnelConnecting",
  },
  pending: {
    color: "warning",
    textKey: "share.states.pending",
    descriptionKey: "share.descriptions.pending",
  },
  online: {
    color: "success",
    textKey: "share.states.online",
    descriptionKey: "share.descriptions.online",
  },
  reconnecting: {
    color: "warning",
    textKey: "share.states.reconnecting",
    descriptionKey: "share.descriptions.reconnecting",
  },
  stopped: {
    color: "default",
    textKey: "share.states.stopped",
    descriptionKey: "share.descriptions.stopped",
  },
  conflict: {
    color: "danger",
    textKey: "share.states.conflict",
    descriptionKey: "share.descriptions.conflict",
  },
  error: {
    color: "danger",
    textKey: "share.states.error",
    descriptionKey: "share.descriptions.error",
  },
};

export function getSharePhaseText(t: TranslateFn, phase: ShareStatePhase) {
  return t(sharePhaseMeta[phase]?.textKey ?? "share.states.idle");
}

export function getSharePhaseDescription(
  t: TranslateFn,
  phase: ShareStatePhase,
) {
  return t(sharePhaseMeta[phase]?.descriptionKey ?? "share.descriptions.idle");
}

export function getSharePhaseColor(phase: ShareStatePhase): ShareStatusColor {
  return sharePhaseMeta[phase]?.color ?? "default";
}

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
    case "tunnel_disconnected":
      return t("share.errors.tunnelDisconnected");
    case "tunnel_protocol_error":
      return t("share.errors.tunnelProtocolError");
    case "join_share_not_found":
      return t("share.errors.joinShareNotFound");
    case "invalid_response":
      return t("share.errors.invalidResponse");
    default:
      return error.message || t("share.errors.unknown");
  }
}
