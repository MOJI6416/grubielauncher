import { describe, expect, it } from "vitest";
import {
  micIssueFromError,
  micIssueHintKey,
  micIssueTitleKey,
  voiceJoinErrorKey,
} from "./errors";

function named(name: string, message = ""): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("voiceJoinErrorKey", () => {
  it("recognises a missing grant", () => {
    expect(voiceJoinErrorKey(new Error("no_token"))).toBe("voice.errorNoToken");
  });

  it("uses the livekit reason name when present", () => {
    expect(voiceJoinErrorKey({ reasonName: "ServerUnreachable" })).toBe(
      "voice.errorUnreachable",
    );
    expect(voiceJoinErrorKey({ reasonName: "NotAllowed" })).toBe(
      "voice.errorRejected",
    );
  });

  it("falls back to the numeric reason of a ConnectionError", () => {
    expect(voiceJoinErrorKey({ name: "ConnectionError", reason: 5 })).toBe(
      "voice.errorTimeout",
    );
    expect(voiceJoinErrorKey({ name: "ConnectionError", reason: 1 })).toBe(
      "voice.errorUnreachable",
    );
  });

  it("reads the message as a last resort", () => {
    expect(voiceJoinErrorKey(new Error("connection timeout"))).toBe(
      "voice.errorTimeout",
    );
    expect(voiceJoinErrorKey(new Error("Failed to fetch"))).toBe(
      "voice.errorUnreachable",
    );
    expect(voiceJoinErrorKey(new Error("something odd"))).toBe(
      "voice.errorGeneric",
    );
    expect(voiceJoinErrorKey(null)).toBe("voice.errorGeneric");
  });
});

describe("micIssueFromError", () => {
  it("maps the standard getUserMedia failures", () => {
    expect(micIssueFromError(named("NotAllowedError"))).toBe("denied");
    expect(micIssueFromError(named("NotFoundError"))).toBe("missing");
    expect(micIssueFromError(named("OverconstrainedError"))).toBe("missing");
    expect(micIssueFromError(named("NotReadableError"))).toBe("busy");
    expect(micIssueFromError(named("WeirdError"))).toBe("failed");
  });

  it("reads the message when the name is unhelpful", () => {
    expect(micIssueFromError(new Error("Permission denied"))).toBe("denied");
    expect(micIssueFromError(new Error("device not found"))).toBe("missing");
    expect(micIssueFromError(new Error("Could not start audio source"))).toBe(
      "busy",
    );
  });
});

describe("mic issue copy", () => {
  it("has a title and a hint for every failure", () => {
    for (const issue of ["denied", "missing", "busy", "failed"] as const) {
      expect(micIssueTitleKey(issue)).not.toBe("");
      expect(micIssueHintKey(issue)).not.toBe("");
    }

    expect(micIssueTitleKey("none")).toBe("");
    expect(micIssueHintKey("none")).toBe("");
  });
});
