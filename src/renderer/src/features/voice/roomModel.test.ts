import { describe, expect, it } from "vitest";
import type { IVoiceSessionState } from "@/types/Voice";
import {
  formatVoiceDuration,
  isVoiceLive,
  micButtonState,
  qualityRank,
  voiceRoomKind,
  voiceStatusKey,
} from "./roomModel";

const BASE: IVoiceSessionState = {
  state: "connected",
  roomId: "g1",
  roomName: "Group",
  isRoomOwner: false,
  participants: [],
  isMicMuted: false,
  isDeafened: false,
  connectedAt: 0,
  quality: "good",
  micIssue: "none",
  isTransmitting: true,
  pttEnabled: false,
  pttPressed: false,
  pttBindLabel: "",
  isNoiseSuppressionActive: false,
};

function session(patch: Partial<IVoiceSessionState> = {}): IVoiceSessionState {
  return { ...BASE, ...patch };
}

describe("voiceRoomKind", () => {
  it("recognises direct rooms by prefix", () => {
    expect(voiceRoomKind("dm_a_b")).toBe("direct");
    expect(voiceRoomKind("64f0c1")).toBe("group");
    expect(voiceRoomKind("")).toBe("group");
  });
});

describe("isVoiceLive", () => {
  it("treats reconnecting as live", () => {
    expect(isVoiceLive("connected")).toBe(true);
    expect(isVoiceLive("reconnecting")).toBe(true);
    expect(isVoiceLive("connecting")).toBe(false);
    expect(isVoiceLive("disconnected")).toBe(false);
  });
});

describe("voiceStatusKey", () => {
  it("maps every state", () => {
    expect(voiceStatusKey("connected")).toBe("voice.connected");
    expect(voiceStatusKey("connecting")).toBe("voice.connecting");
    expect(voiceStatusKey("reconnecting")).toBe("voice.reconnecting");
    expect(voiceStatusKey("disconnected")).toBe("voice.disconnected");
  });
});

describe("formatVoiceDuration", () => {
  it("formats under an hour without hours", () => {
    expect(formatVoiceDuration(0)).toBe("0:00");
    expect(formatVoiceDuration(9_000)).toBe("0:09");
    expect(formatVoiceDuration(65_000)).toBe("1:05");
    expect(formatVoiceDuration(3_599_000)).toBe("59:59");
  });

  it("adds hours past the hour mark", () => {
    expect(formatVoiceDuration(3_600_000)).toBe("1:00:00");
    expect(formatVoiceDuration(3_723_000)).toBe("1:02:03");
  });

  it("clamps negative input", () => {
    expect(formatVoiceDuration(-5_000)).toBe("0:00");
  });
});

describe("quality helpers", () => {
  it("ranks quality from worst to best", () => {
    expect(qualityRank("excellent")).toBeGreaterThan(qualityRank("good"));
    expect(qualityRank("good")).toBeGreaterThan(qualityRank("poor"));
    expect(qualityRank("poor")).toBeGreaterThan(qualityRank("lost"));
    expect(qualityRank("unknown")).toBe(0);
  });
});

describe("micButtonState", () => {
  it("prefers the most severe state", () => {
    expect(micButtonState(session({ micIssue: "busy", isDeafened: true }))).toBe(
      "broken",
    );
    expect(micButtonState(session({ isDeafened: true }))).toBe("deafened");
    expect(micButtonState(session({ isMicMuted: true }))).toBe("muted");
    expect(micButtonState(session({ pttEnabled: true }))).toBe("ptt-idle");
    expect(
      micButtonState(session({ pttEnabled: true, pttPressed: true })),
    ).toBe("ptt-active");
    expect(micButtonState(session())).toBe("live");
  });
});
