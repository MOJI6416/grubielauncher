import type {
  ShareErrorCode,
  ShareState,
  ShareStatePhase,
  ShareStreamDiagnostic,
  ShareVisibility,
} from "@/types/Share";

export type ShareStage =
  | "accountUnsupported"
  | "offline"
  | "noGame"
  | "needsWorld"
  | "ready"
  | "starting"
  | "open"
  | "recovering"
  | "conflict"
  | "failed";

export type ShareStepId = "world" | "session" | "channel" | "open";

export type ShareStepStatus = "pending" | "active" | "done" | "failed";

export type ShareTone = "muted" | "success" | "warning" | "danger";

export type SharePrimaryKind = "start" | "stop" | "busy" | "blocked";

export type ShareHint =
  | "openToLan"
  | "startGame"
  | "signIn"
  | "checkInternet"
  | "stopOtherSession"
  | "updateLauncher"
  | "closeAndReopen"
  | "retry"
  | "none";

export interface ShareContext {
  isAccountEligible: boolean;
  isOnline: boolean;
}

export interface ShareStep {
  id: ShareStepId;
  status: ShareStepStatus;
}

export const SHARE_STEPS: ShareStepId[] = [
  "world",
  "session",
  "channel",
  "open",
];

const BUSY_PHASES: ShareStatePhase[] = [
  "share_starting",
  "tunnel_connecting",
  "pending",
];

const NORMAL_STREAM_CLOSE_REASONS = new Set([
  "local_socket_closed",
  "share_stopped",
  "peer_eof",
]);

export function isSharePhaseBusy(phase: ShareStatePhase): boolean {
  return BUSY_PHASES.includes(phase) || phase === "reconnecting";
}

export function isShareLive(state: ShareState): boolean {
  return !!state.sessionId || isSharePhaseBusy(state.phase);
}

export function canGuestsJoin(state: ShareState): boolean {
  return state.phase === "online" && !!state.sessionId;
}

export function resolveShareStage(
  state: ShareState,
  context: ShareContext,
): ShareStage {
  switch (state.phase) {
    case "online":
      return "open";
    case "reconnecting":
      return "recovering";
    case "share_starting":
    case "tunnel_connecting":
    case "pending":
      return "starting";
    case "conflict":
      return "conflict";
    case "error":
      return "failed";
    default:
      break;
  }

  if (!context.isAccountEligible) return "accountUnsupported";
  if (!context.isOnline) return "offline";

  if (state.phase === "lan_ready" || state.phase === "stopped") return "ready";
  if (state.phase === "lan_not_found") return "needsWorld";
  return "noGame";
}

export interface ShareVisibilityView {
  effective: ShareVisibility;
  isApplying: boolean;
}

// Who can walk into the world right now, as opposed to who the host has just
// asked may walk in.
//
// The two are the same until a share is live. After that the button the host
// pressed is a request travelling to the API, and the door it describes does not
// move until the answer comes back - up to the thirty-second request timeout,
// and not at all if the request fails. Painting the panel from the pressed
// button therefore told a host who had just shut a public world down to friends
// that strangers were locked out while every one of them could still get in.
export function resolveVisibilityView(
  state: ShareState,
  draft: ShareVisibility,
): ShareVisibilityView {
  if (!isShareLive(state) || !state.visibility) {
    return { effective: draft, isApplying: false };
  }

  return {
    effective: state.visibility,
    isApplying: state.visibility !== draft,
  };
}

export function getShareTone(stage: ShareStage): ShareTone {
  switch (stage) {
    case "open":
      return "success";
    case "ready":
      return "success";
    case "starting":
    case "recovering":
      return "warning";
    case "conflict":
    case "failed":
      return "danger";
    default:
      return "muted";
  }
}

const RETRYABLE_PHASES: ShareStatePhase[] = [
  "lan_ready",
  "stopped",
  "conflict",
  "error",
];

export function getSharePrimaryKind(
  state: ShareState,
  context: ShareContext,
): SharePrimaryKind {
  if (isShareLive(state)) {
    if (isSharePhaseBusy(state.phase) && !state.sessionId) return "busy";
    return "stop";
  }

  if (!context.isAccountEligible || !context.isOnline) return "blocked";
  if (!state.candidate) return "blocked";
  return RETRYABLE_PHASES.includes(state.phase) ? "start" : "blocked";
}

export function getShareSteps(state: ShareState): ShareStep[] {
  const failedIndex = getFailedStepIndex(state);
  const doneCount = getDoneStepCount(state);
  const activeIndex = getActiveStepIndex(state);

  return SHARE_STEPS.map((id, index) => {
    let status: ShareStepStatus = "pending";
    if (index < doneCount) status = "done";
    if (failedIndex !== null && index === failedIndex) status = "failed";
    else if (activeIndex !== null && index === activeIndex) status = "active";
    return { id, status };
  });
}

function getDoneStepCount(state: ShareState): number {
  switch (state.phase) {
    case "online":
      return 4;
    case "pending":
      return 3;
    case "tunnel_connecting":
    case "reconnecting":
      return 2;
    case "lan_ready":
    case "stopped":
    case "share_starting":
      return 1;
    case "conflict":
      return 1;
    case "error":
      return state.sessionId ? 2 : state.target ? 1 : 0;
    default:
      return 0;
  }
}

function getActiveStepIndex(state: ShareState): number | null {
  switch (state.phase) {
    case "share_starting":
      return 1;
    case "tunnel_connecting":
    case "reconnecting":
      return 2;
    case "pending":
      return 3;
    default:
      return null;
  }
}

function getFailedStepIndex(state: ShareState): number | null {
  if (state.phase === "conflict") return 1;
  if (state.phase !== "error") return null;
  if (state.sessionId) return 2;
  if (state.lastError?.code === "lan_not_found") return 0;
  if (state.lastError?.code === "local_port_unreachable") return 0;
  return 1;
}

export function getShareHint(
  stage: ShareStage,
  code?: ShareErrorCode | null,
  isLive = false,
): ShareHint {
  if (stage === "failed" && isLive) return "closeAndReopen";

  switch (code) {
    case "lan_not_found":
    case "local_port_unreachable":
      return "openToLan";
    case "not_authenticated":
      return "signIn";
    case "active_share_exists":
    case "share_already_running":
    case "tunnel_already_active":
      return "stopOtherSession";
    case "tunnel_version_unsupported":
      return "updateLauncher";
    default:
      break;
  }

  switch (stage) {
    case "accountUnsupported":
      return "signIn";
    case "offline":
      return "checkInternet";
    case "noGame":
      return "startGame";
    case "needsWorld":
      return "openToLan";
    case "conflict":
      return "stopOtherSession";
    case "failed":
      return "retry";
    default:
      return "none";
  }
}

export function shouldShowStreamDiagnostic(
  diagnostic: ShareStreamDiagnostic | undefined,
  stage: ShareStage,
): boolean {
  if (!diagnostic?.reason) return false;
  if (NORMAL_STREAM_CLOSE_REASONS.has(diagnostic.reason)) return false;
  return stage === "open" || stage === "recovering" || stage === "failed";
}

export function getShareHealth(state: ShareState): {
  isDegraded: boolean;
  isHeartbeatLost: boolean;
} {
  const live = state.phase === "online";
  return {
    isDegraded: live && !!state.isDegraded,
    isHeartbeatLost:
      live && state.isHeartbeatActive === false && !!state.lastHeartbeatAt,
  };
}

export function formatShareUptime(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

export function elapsedSince(iso: string | undefined, nowMs: number): number {
  if (!iso) return 0;
  const started = Date.parse(iso);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, nowMs - started);
}
