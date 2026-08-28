import { describe, expect, it } from "vitest";
import { INITIAL_VOICE_SESSION, IVoiceParticipantState } from "@/types/Voice";
import {
  isVoiceDockVisible,
  shouldShowVoiceMiniPanel,
  speakingCount,
  voiceMiniTone,
} from "./miniPanel";

function participant(
  overrides: Partial<IVoiceParticipantState>,
): IVoiceParticipantState {
  return {
    identity: "a",
    name: "A",
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    volume: 1,
    isLocallyMuted: false,
    quality: "good",
    ...overrides,
  };
}

describe("voice mini panel", () => {
  it("stays hidden while disconnected", () => {
    expect(shouldShowVoiceMiniPanel({ state: "disconnected" }, "home")).toBe(
      false,
    );
  });

  it("shows on every screen except the one with the full dock", () => {
    expect(shouldShowVoiceMiniPanel({ state: "connected" }, "home")).toBe(true);
    expect(shouldShowVoiceMiniPanel({ state: "connected" }, "instance")).toBe(
      true,
    );
    expect(shouldShowVoiceMiniPanel({ state: "connected" }, "people")).toBe(
      false,
    );
  });

  it("shows while still connecting so the user can leave", () => {
    expect(shouldShowVoiceMiniPanel({ state: "connecting" }, "news")).toBe(true);
    expect(shouldShowVoiceMiniPanel({ state: "reconnecting" }, "news")).toBe(
      true,
    );
  });

  it("knows where the full dock lives", () => {
    expect(isVoiceDockVisible("people")).toBe(true);
    expect(isVoiceDockVisible("home")).toBe(false);
  });

  it("counts only unmuted speakers", () => {
    expect(
      speakingCount([
        participant({ identity: "a", isSpeaking: true }),
        participant({ identity: "b", isSpeaking: true, isMuted: true }),
        participant({ identity: "c" }),
      ]),
    ).toBe(1);
  });

  it("warns while connecting or when the microphone broke", () => {
    expect(
      voiceMiniTone({ ...INITIAL_VOICE_SESSION, state: "connected" }),
    ).toBe("live");
    expect(
      voiceMiniTone({ ...INITIAL_VOICE_SESSION, state: "reconnecting" }),
    ).toBe("warning");
    expect(
      voiceMiniTone({
        ...INITIAL_VOICE_SESSION,
        state: "connected",
        micIssue: "denied",
      }),
    ).toBe("warning");
  });
});
