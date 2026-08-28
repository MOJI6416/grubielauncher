import { describe, expect, it } from "vitest";
import type { ShareState, ShareStatePhase } from "@/types/Share";
import {
  canGuestsJoin,
  elapsedSince,
  formatShareUptime,
  getShareHealth,
  getShareHint,
  getSharePrimaryKind,
  getShareSteps,
  getShareTone,
  isShareLive,
  isSharePhaseBusy,
  resolveShareStage,
  resolveVisibilityView,
  shouldShowStreamDiagnostic,
} from "./shareModel";

function makeState(patch: Partial<ShareState> = {}): ShareState {
  return {
    phase: "idle",
    candidate: null,
    target: null,
    isTunnelConnected: false,
    isAuthenticated: false,
    isHeartbeatActive: false,
    isDegraded: false,
    reconnectAttempt: 0,
    updatedAt: new Date(0).toISOString(),
    ...patch,
  };
}

const online = { isAccountEligible: true, isOnline: true };

describe("resolveShareStage", () => {
  it("reports the blocking account problem before game state", () => {
    expect(
      resolveShareStage(makeState({ phase: "lan_ready" }), {
        isAccountEligible: false,
        isOnline: true,
      }),
    ).toBe("accountUnsupported");
  });

  it("reports offline before ready", () => {
    expect(
      resolveShareStage(makeState({ phase: "lan_ready" }), {
        isAccountEligible: true,
        isOnline: false,
      }),
    ).toBe("offline");
  });

  it("keeps live phases regardless of connectivity flags", () => {
    expect(
      resolveShareStage(makeState({ phase: "online" }), {
        isAccountEligible: false,
        isOnline: false,
      }),
    ).toBe("open");
  });

  it("maps every phase", () => {
    const cases: [ShareStatePhase, string][] = [
      ["idle", "noGame"],
      ["lan_not_found", "needsWorld"],
      ["lan_ready", "ready"],
      ["stopped", "ready"],
      ["share_starting", "starting"],
      ["tunnel_connecting", "starting"],
      ["pending", "starting"],
      ["online", "open"],
      ["reconnecting", "recovering"],
      ["conflict", "conflict"],
      ["error", "failed"],
    ];

    for (const [phase, stage] of cases) {
      expect(resolveShareStage(makeState({ phase }), online)).toBe(stage);
    }
  });
});

describe("canGuestsJoin", () => {
  it("is true only when access is actually open", () => {
    expect(
      canGuestsJoin(makeState({ phase: "online", sessionId: "s1" })),
    ).toBe(true);
  });

  it("is false while access is still opening", () => {
    for (const phase of [
      "share_starting",
      "tunnel_connecting",
      "pending",
      "reconnecting",
    ] as ShareStatePhase[]) {
      expect(canGuestsJoin(makeState({ phase, sessionId: "s1" }))).toBe(false);
    }
  });

  it("is false when the phase is online but there is no session", () => {
    expect(canGuestsJoin(makeState({ phase: "online" }))).toBe(false);
  });
});

describe("isSharePhaseBusy / isShareLive", () => {
  it("treats opening and reconnecting as busy", () => {
    expect(isSharePhaseBusy("share_starting")).toBe(true);
    expect(isSharePhaseBusy("reconnecting")).toBe(true);
    expect(isSharePhaseBusy("online")).toBe(false);
  });

  it("treats an existing session as live", () => {
    expect(isShareLive(makeState({ phase: "online", sessionId: "s1" }))).toBe(
      true,
    );
    expect(isShareLive(makeState({ phase: "lan_ready" }))).toBe(false);
  });
});

const candidate = {
  key: "pack:0",
  versionName: "pack",
  instance: 0,
  localPort: 25565,
  detectedAt: "2026-01-01T00:00:00.000Z",
  isReachable: true,
};

describe("getSharePrimaryKind", () => {
  it("offers start only when a world was found", () => {
    expect(
      getSharePrimaryKind(makeState({ phase: "lan_ready", candidate }), online),
    ).toBe("start");
    expect(getSharePrimaryKind(makeState({ phase: "lan_ready" }), online)).toBe(
      "blocked",
    );
    expect(getSharePrimaryKind(makeState({ phase: "idle" }), online)).toBe(
      "blocked",
    );
  });

  it("lets the user retry after a conflict or a failure", () => {
    expect(
      getSharePrimaryKind(makeState({ phase: "conflict", candidate }), online),
    ).toBe("start");
    expect(
      getSharePrimaryKind(makeState({ phase: "error", candidate }), online),
    ).toBe("start");
    expect(
      getSharePrimaryKind(makeState({ phase: "stopped", candidate }), online),
    ).toBe("start");
  });

  it("blocks starting without an eligible account or connection", () => {
    expect(
      getSharePrimaryKind(makeState({ phase: "lan_ready", candidate }), {
        isAccountEligible: false,
        isOnline: true,
      }),
    ).toBe("blocked");
    expect(
      getSharePrimaryKind(makeState({ phase: "lan_ready", candidate }), {
        isAccountEligible: true,
        isOnline: false,
      }),
    ).toBe("blocked");
  });

  it("offers stop once a session exists", () => {
    expect(
      getSharePrimaryKind(
        makeState({ phase: "tunnel_connecting", sessionId: "s1" }),
        online,
      ),
    ).toBe("stop");
  });

  it("is busy while the session is still being created", () => {
    expect(
      getSharePrimaryKind(makeState({ phase: "share_starting" }), online),
    ).toBe("busy");
  });
});

describe("getShareSteps", () => {
  const statuses = (state: ShareState) =>
    getShareSteps(state).map((step) => step.status);

  it("walks forward through the happy path", () => {
    expect(statuses(makeState({ phase: "idle" }))).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(statuses(makeState({ phase: "lan_ready" }))).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
    ]);
    expect(statuses(makeState({ phase: "share_starting" }))).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ]);
    expect(statuses(makeState({ phase: "tunnel_connecting" }))).toEqual([
      "done",
      "done",
      "active",
      "pending",
    ]);
    expect(statuses(makeState({ phase: "pending" }))).toEqual([
      "done",
      "done",
      "done",
      "active",
    ]);
    expect(statuses(makeState({ phase: "online" }))).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("marks the channel as failed when a live session breaks", () => {
    expect(
      statuses(
        makeState({
          phase: "error",
          sessionId: "s1",
          lastError: { code: "tunnel_disconnected", message: "" },
        }),
      ),
    ).toEqual(["done", "done", "failed", "pending"]);
  });

  it("marks the world step as failed when the local port died", () => {
    expect(
      statuses(
        makeState({
          phase: "error",
          lastError: { code: "local_port_unreachable", message: "" },
        }),
      ),
    ).toEqual(["failed", "pending", "pending", "pending"]);
  });

  it("marks the session step as failed on conflict", () => {
    expect(statuses(makeState({ phase: "conflict" }))).toEqual([
      "done",
      "failed",
      "pending",
      "pending",
    ]);
  });
});

describe("getShareHint", () => {
  it("prefers an actionable hint derived from the error code", () => {
    expect(getShareHint("failed", "tunnel_version_unsupported")).toBe(
      "updateLauncher",
    );
    expect(getShareHint("failed", "local_port_unreachable")).toBe("openToLan");
  });

  it("falls back to the stage", () => {
    expect(getShareHint("noGame")).toBe("startGame");
    expect(getShareHint("needsWorld")).toBe("openToLan");
    expect(getShareHint("offline")).toBe("checkInternet");
    expect(getShareHint("open")).toBe("none");
  });

  it("asks to close a broken live session before reopening", () => {
    expect(getShareHint("failed", "tunnel_disconnected", true)).toBe(
      "closeAndReopen",
    );
    expect(getShareHint("failed", "tunnel_disconnected", false)).toBe("retry");
  });
});

describe("shouldShowStreamDiagnostic", () => {
  const diagnostic = {
    streamId: 3,
    reason: "gateway_unavailable",
    source: "gateway" as const,
    at: new Date().toISOString(),
  };

  it("hides normal disconnects", () => {
    expect(
      shouldShowStreamDiagnostic({ ...diagnostic, reason: "peer_eof" }, "open"),
    ).toBe(false);
  });

  it("shows abnormal disconnects only on live stages", () => {
    expect(shouldShowStreamDiagnostic(diagnostic, "open")).toBe(true);
    expect(shouldShowStreamDiagnostic(diagnostic, "ready")).toBe(false);
  });
});

describe("getShareHealth", () => {
  it("stays quiet until the first heartbeat has been seen", () => {
    expect(
      getShareHealth(makeState({ phase: "online", isHeartbeatActive: false })),
    ).toEqual({ isDegraded: false, isHeartbeatLost: false });
  });


  it("only reports health problems while online", () => {
    expect(
      getShareHealth(
        makeState({
          phase: "online",
          isDegraded: true,
          lastHeartbeatAt: new Date(0).toISOString(),
        }),
      ),
    ).toEqual({ isDegraded: true, isHeartbeatLost: true });
    expect(
      getShareHealth(
        makeState({
          phase: "lan_ready",
          isDegraded: true,
          lastHeartbeatAt: new Date(0).toISOString(),
        }),
      ),
    ).toEqual({ isDegraded: false, isHeartbeatLost: false });
  });
});

describe("getShareTone", () => {
  it("never paints a neutral stage as a problem", () => {
    expect(getShareTone("noGame")).toBe("muted");
    expect(getShareTone("open")).toBe("success");
    expect(getShareTone("starting")).toBe("warning");
    expect(getShareTone("failed")).toBe("danger");
  });
});

describe("formatShareUptime", () => {
  it("formats minutes and seconds", () => {
    expect(formatShareUptime(0)).toBe("0:00");
    expect(formatShareUptime(65_000)).toBe("1:05");
    expect(formatShareUptime(3_725_000)).toBe("1:02:05");
  });

  it("never goes negative", () => {
    expect(formatShareUptime(-5000)).toBe("0:00");
  });
});

describe("elapsedSince", () => {
  it("returns zero for missing or invalid input", () => {
    expect(elapsedSince(undefined, 1000)).toBe(0);
    expect(elapsedSince("not a date", 1000)).toBe(0);
  });

  it("measures the gap", () => {
    const now = Date.parse("2026-01-01T00:01:00.000Z");
    expect(elapsedSince("2026-01-01T00:00:00.000Z", now)).toBe(60_000);
  });
});

// The access buttons say who may enter the world. Painting the panel from the
// button the host just pressed made a request in flight look like a door that
// had already moved: a host closing a public world down to friends was told
// strangers were locked out while every one of them could still walk in, for as
// long as the API took to answer - and the address stayed hidden even when the
// request failed outright and the world was still public.
describe("resolveVisibilityView", () => {
  it("treats the draft as the truth before a share is live", () => {
    expect(resolveVisibilityView(makeState({ phase: "lan_ready" }), "public"))
      .toEqual({ effective: "public", isApplying: false });
  });

  it("keeps showing the access the world actually has while a change is in flight", () => {
    const live = makeState({
      phase: "online",
      sessionId: "session-1",
      visibility: "public",
    });

    expect(resolveVisibilityView(live, "friends")).toEqual({
      effective: "public",
      isApplying: true,
    });
  });

  it("stops flagging a change once the API confirms it", () => {
    const live = makeState({
      phase: "online",
      sessionId: "session-1",
      visibility: "friends",
    });

    expect(resolveVisibilityView(live, "friends")).toEqual({
      effective: "friends",
      isApplying: false,
    });
  });
});
