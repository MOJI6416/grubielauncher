import { describe, expect, it } from "vitest";
import {
  isMilestoneBeamAnimating,
  nextMilestoneBeam,
  startMilestoneBeam,
  type MilestoneBeamEvent,
  type MilestoneBeamState,
} from "./milestoneBeamState";

function play(
  state: MilestoneBeamState,
  ...events: MilestoneBeamEvent[]
): MilestoneBeamState {
  return events.reduce(nextMilestoneBeam, state);
}

describe("milestone beam lifecycle", () => {
  it("runs once and then stops for good", () => {
    const state = play(startMilestoneBeam(false), "elapsed", "faded");
    expect(state).toEqual({ phase: "off", completed: true });
    expect(isMilestoneBeamAnimating(state)).toBe(false);
  });

  it("stops on blur without waiting for the timer", () => {
    const state = play(startMilestoneBeam(false), "blur", "faded");
    expect(state.phase).toBe("off");
    expect(isMilestoneBeamAnimating(state)).toBe(false);
  });

  it("resumes on focus only while the run is unfinished", () => {
    const interrupted = play(startMilestoneBeam(false), "blur", "faded", "focus");
    expect(interrupted).toEqual({ phase: "on", completed: false });

    const finished = play(
      startMilestoneBeam(false),
      "elapsed",
      "faded",
      "focus",
      "focus",
    );
    expect(finished).toEqual({ phase: "off", completed: true });
  });

  it("never restarts after the beam finished, however many focus flips happen", () => {
    let state = play(startMilestoneBeam(false), "elapsed", "faded");
    for (let i = 0; i < 50; i += 1) state = play(state, "blur", "focus");
    expect(state).toEqual({ phase: "off", completed: true });
  });

  it("starts already stopped under prefers-reduced-motion", () => {
    const state = startMilestoneBeam(true);
    expect(isMilestoneBeamAnimating(state)).toBe(false);
    expect(play(state, "focus", "blur", "focus")).toEqual({
      phase: "off",
      completed: true,
    });
  });

  it("ignores events that do not belong to the current phase", () => {
    const running = startMilestoneBeam(false);
    expect(play(running, "faded")).toEqual(running);
    expect(play(running, "focus")).toEqual(running);

    const fading = play(running, "elapsed");
    expect(play(fading, "elapsed")).toEqual(fading);
  });
});
