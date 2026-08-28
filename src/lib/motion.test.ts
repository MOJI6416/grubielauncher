import { describe, expect, it } from "vitest";

import {
  MOTION_DURATION,
  MOTION_DURATION_FAST,
  MOTION_DURATION_SLOW,
  MOTION_EASE,
  motionTransition,
} from "./motion";

describe("motionTransition", () => {
  it("uses the shared duration and easing by default", () => {
    expect(motionTransition(false)).toEqual({
      duration: MOTION_DURATION,
      ease: MOTION_EASE,
    });
  });

  it("removes movement when reduced motion is requested", () => {
    expect(motionTransition(true)).toEqual({ duration: 0 });
  });

  it("keeps the shared easing for an explicit duration", () => {
    expect(motionTransition(null, MOTION_DURATION_SLOW)).toEqual({
      duration: MOTION_DURATION_SLOW,
      ease: MOTION_EASE,
    });
  });

  it("mirrors the css duration tokens", () => {
    expect([
      MOTION_DURATION_FAST,
      MOTION_DURATION,
      MOTION_DURATION_SLOW,
    ]).toEqual([0.12, 0.18, 0.26]);
  });
});
