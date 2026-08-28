import type { VoiceMicIssue } from "@/types/Voice";

const CONNECTION_REASON_KEYS: Record<number, string> = {
  0: "voice.errorRejected",
  1: "voice.errorUnreachable",
  2: "voice.errorServer",
  3: "voice.errorCancelled",
  4: "voice.errorCancelled",
  5: "voice.errorTimeout",
  6: "voice.errorUnreachable",
  7: "voice.errorServer",
};

const CONNECTION_NAME_KEYS: Record<string, string> = {
  notallowed: "voice.errorRejected",
  serverunreachable: "voice.errorUnreachable",
  internalerror: "voice.errorServer",
  cancelled: "voice.errorCancelled",
  leaverequest: "voice.errorCancelled",
  timeout: "voice.errorTimeout",
  websocket: "voice.errorUnreachable",
  servicenotfound: "voice.errorServer",
};

function readString(source: unknown, key: string): string {
  if (!source || typeof source !== "object") return "";
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

export function voiceJoinErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (message === "no_token") return "voice.errorNoToken";

  const reasonName = readString(error, "reasonName").toLowerCase();
  if (reasonName && CONNECTION_NAME_KEYS[reasonName]) {
    return CONNECTION_NAME_KEYS[reasonName];
  }

  if (readString(error, "name") === "ConnectionError") {
    const reason = readNumber(error, "reason");
    if (reason !== null && CONNECTION_REASON_KEYS[reason]) {
      return CONNECTION_REASON_KEYS[reason];
    }
  }

  const lowered = message.toLowerCase();
  if (lowered.includes("timeout")) return "voice.errorTimeout";
  if (lowered.includes("permission") || lowered.includes("401")) {
    return "voice.errorRejected";
  }
  if (
    lowered.includes("unreachable") ||
    lowered.includes("websocket") ||
    lowered.includes("network") ||
    lowered.includes("failed to fetch")
  ) {
    return "voice.errorUnreachable";
  }

  return "voice.errorGeneric";
}

export function micIssueFromError(error: unknown): VoiceMicIssue {
  const name = error instanceof Error ? error.name : readString(error, "name");
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "missing";
    case "NotReadableError":
    case "TrackStartError":
      return "busy";
    default:
      break;
  }

  if (message.includes("permission") || message.includes("denied")) {
    return "denied";
  }
  if (message.includes("not found") || message.includes("no device")) {
    return "missing";
  }
  if (message.includes("in use") || message.includes("could not start")) {
    return "busy";
  }

  return "failed";
}

export function micIssueTitleKey(issue: VoiceMicIssue): string {
  switch (issue) {
    case "denied":
      return "voice.micDenied";
    case "missing":
      return "voice.micMissing";
    case "busy":
      return "voice.micBusy";
    case "failed":
      return "voice.micFailed";
    default:
      return "";
  }
}

export function micIssueHintKey(issue: VoiceMicIssue): string {
  switch (issue) {
    case "denied":
      return "voice.micDeniedHint";
    case "missing":
      return "voice.micMissingHint";
    case "busy":
      return "voice.micBusyHint";
    case "failed":
      return "voice.micFailedHint";
    default:
      return "";
  }
}
