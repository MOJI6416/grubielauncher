import { describe, expect, it } from "vitest";
import { isMirrorNoteworthy, resolveMirrorMode } from "./mirrorMode";

describe("resolveMirrorMode", () => {
  it("always reports the official source when the user pinned it", () => {
    expect(
      resolveMirrorMode({
        source: "official",
        mirrorDisabled: true,
        mojangReachable: false,
      }),
    ).toBe("official");
  });

  it("reports the mirror when the user pinned it", () => {
    expect(
      resolveMirrorMode({
        source: "mirror",
        mirrorDisabled: false,
        mojangReachable: true,
      }),
    ).toBe("mirror");
  });

  it("flags the cooldown when a pinned mirror keeps failing", () => {
    expect(
      resolveMirrorMode({
        source: "mirror",
        mirrorDisabled: true,
        mojangReachable: true,
      }),
    ).toBe("mirror-cooldown");
  });

  it("switches to the mirror automatically when mojang is unreachable", () => {
    expect(
      resolveMirrorMode({
        source: "auto",
        mirrorDisabled: false,
        mojangReachable: false,
      }),
    ).toBe("mirror");
  });

  it("reports the cooldown when the automatic fallback is also unavailable", () => {
    expect(
      resolveMirrorMode({
        source: "auto",
        mirrorDisabled: true,
        mojangReachable: false,
      }),
    ).toBe("mirror-cooldown");
  });

  it("stays quiet while the official source works", () => {
    for (const mojangReachable of [true, null]) {
      expect(
        resolveMirrorMode({ source: "auto", mirrorDisabled: false, mojangReachable }),
      ).toBe("official-first");
    }
  });
});

describe("isMirrorNoteworthy", () => {
  it("hides the badge only in the ordinary case", () => {
    expect(isMirrorNoteworthy("official-first")).toBe(false);
    expect(isMirrorNoteworthy("official")).toBe(true);
    expect(isMirrorNoteworthy("mirror")).toBe(true);
    expect(isMirrorNoteworthy("mirror-cooldown")).toBe(true);
  });
});
