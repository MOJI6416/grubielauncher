import { describe, expect, it } from "vitest";
import type { IVoiceSessionState } from "@/types/Voice";
import {
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
