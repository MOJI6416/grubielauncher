import { describe, expect, it } from "vitest";
import type { IVoiceParticipantState } from "@/types/Voice";
import { buildOverlayState, sameOverlayState } from "./overlay";

function participant(
  patch: Partial<IVoiceParticipantState> & { identity: string },
): IVoiceParticipantState {
  return {
    name: patch.identity,
    isLocal: false,
    isSpeaking: false,
    isMuted: false,
    volume: 1,
    isLocallyMuted: false,
    quality: "good",
    ...patch,
  };
}

const participants = [
  participant({ identity: "zed", isSpeaking: true }),
  participant({ identity: "me", isLocal: true, isSpeaking: true }),
  participant({ identity: "amy", isSpeaking: false }),
  participant({ identity: "bob", isSpeaking: true, isLocallyMuted: true }),
  participant({ identity: "cat", isSpeaking: true, isMuted: true }),
];

describe("buildOverlayState", () => {
  it("lists only audible speakers, yourself first", () => {
    const state = buildOverlayState(
      { state: "connected", participants },
      true,
      true,
    );
    expect(state.visible).toBe(true);
    expect(state.speakers.map((speaker) => speaker.id)).toEqual(["me", "zed"]);
    expect(state.speakers[1]).toMatchObject({
      initials: "ZE",
      headUrl: null,
      isLocal: false,
    });
  });

  it("carries the head picture for each speaker", () => {
    const state = buildOverlayState(
      { state: "connected", participants },
      true,
      true,
      (participant) => `https://api/heads/${participant.identity}.png`,
    );
    expect(state.speakers.map((speaker) => speaker.headUrl)).toEqual([
      "https://api/heads/me.png",
      "https://api/heads/zed.png",
    ]);
  });

  it("stays hidden without a game, a call or the setting", () => {
    expect(
      buildOverlayState({ state: "connected", participants }, false, true)
        .visible,
    ).toBe(false);
    expect(
      buildOverlayState({ state: "disconnected", participants }, true, true)
        .visible,
    ).toBe(false);
    expect(
      buildOverlayState({ state: "connected", participants }, true, false)
        .visible,
    ).toBe(false);
  });

  it("stays visible with nobody talking so the window does not blink", () => {
    const quiet = buildOverlayState(
      { state: "reconnecting", participants: [participant({ identity: "a" })] },
      true,
      true,
    );
    expect(quiet).toEqual({ visible: true, speakers: [] });
  });
});

describe("sameOverlayState", () => {
  it("compares visibility and the speaker list", () => {
    const a = buildOverlayState(
      { state: "connected", participants },
      true,
      true,
    );
    const b = buildOverlayState(
      { state: "connected", participants },
      true,
      true,
    );
    expect(sameOverlayState(a, b)).toBe(true);
    expect(sameOverlayState(a, { ...a, speakers: a.speakers.slice(1) })).toBe(
      false,
    );
    expect(sameOverlayState(a, { ...a, visible: false })).toBe(false);
  });
});
