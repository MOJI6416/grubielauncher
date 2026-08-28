import { describe, expect, it } from "vitest";
import type { IVoiceParticipantState } from "@/types/Voice";
import {
  clampParticipantVolume,
  isAloneInRoom,
  levelBucket,
  participantInitials,
  pingableMembers,
  sortVoiceParticipants,
  splitOverflow,
  volumePercent,
} from "./participants";

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

describe("participantInitials", () => {
  it("takes two characters", () => {
    expect(participantInitials("moji6416")).toBe("MO");
    expect(participantInitials("  ")).toBe("?");
    expect(participantInitials("Я")).toBe("Я");
  });
});

describe("sortVoiceParticipants", () => {
  it("puts the local participant first, then sorts by name", () => {
    const sorted = sortVoiceParticipants([
      participant({ identity: "3", name: "zhekon" }),
      participant({ identity: "1", name: "Kituk" }),
      participant({ identity: "2", name: "me", isLocal: true }),
    ]);

    expect(sorted.map((item) => item.identity)).toEqual(["2", "1", "3"]);
  });

  it("breaks ties by identity and does not mutate the input", () => {
    const input = [
      participant({ identity: "b", name: "same" }),
      participant({ identity: "a", name: "same" }),
    ];
    const sorted = sortVoiceParticipants(input);

    expect(sorted.map((item) => item.identity)).toEqual(["a", "b"]);
    expect(input.map((item) => item.identity)).toEqual(["b", "a"]);
  });
});

describe("isAloneInRoom", () => {
  it("is true when only the local participant is present", () => {
    expect(isAloneInRoom([participant({ identity: "a", isLocal: true })])).toBe(
      true,
    );
    expect(
      isAloneInRoom([
        participant({ identity: "a", isLocal: true }),
        participant({ identity: "b" }),
      ]),
    ).toBe(false);
    expect(isAloneInRoom([])).toBe(true);
  });
});

describe("splitOverflow", () => {
  it("splits long lists", () => {
    expect(splitOverflow([1, 2, 3], 5)).toEqual({ visible: [1, 2, 3], hidden: 0 });
    expect(splitOverflow([1, 2, 3, 4], 2)).toEqual({
      visible: [1, 2],
      hidden: 2,
    });
    expect(splitOverflow([1, 2], 0)).toEqual({ visible: [], hidden: 2 });
  });
});

describe("volume helpers", () => {
  it("clamps to the 0..200% range", () => {
    expect(clampParticipantVolume(-1)).toBe(0);
    expect(clampParticipantVolume(3)).toBe(2);
    expect(clampParticipantVolume(Number.NaN)).toBe(1);
    expect(volumePercent(1.5)).toBe(150);
  });
});

describe("levelBucket", () => {
  it("quantises the audio level into five steps", () => {
    expect(levelBucket(0)).toBe(0);
    expect(levelBucket(-1)).toBe(0);
    expect(levelBucket(0.1)).toBe(1);
    expect(levelBucket(0.5)).toBe(2);
    expect(levelBucket(1)).toBe(4);
    expect(levelBucket(4)).toBe(4);
  });
});

describe("pingableMembers", () => {
  it("drops members already in the room and yourself", () => {
    const members = [{ _id: "a" }, { _id: "b" }, { _id: "me" }];
    expect(pingableMembers(members, ["a"], "me")).toEqual([{ _id: "b" }]);
  });
});
