export type MilestoneBeamPhase = "on" | "fading" | "off";

export type MilestoneBeamEvent = "elapsed" | "faded" | "blur" | "focus";

export interface MilestoneBeamState {
  phase: MilestoneBeamPhase;
  completed: boolean;
}

export function startMilestoneBeam(reducedMotion: boolean): MilestoneBeamState {
  return reducedMotion
    ? { phase: "off", completed: true }
    : { phase: "on", completed: false };
}

export function nextMilestoneBeam(
  state: MilestoneBeamState,
  event: MilestoneBeamEvent,
): MilestoneBeamState {
  switch (event) {
    case "elapsed":
      return state.phase === "on"
        ? { phase: "fading", completed: true }
        : state;
    case "faded":
      return state.phase === "fading" ? { ...state, phase: "off" } : state;
    case "blur":
      return state.phase === "off" ? state : { ...state, phase: "fading" };
    case "focus":
      return state.completed || state.phase === "on"
        ? state
        : { phase: "on", completed: false };
  }
}

export function isMilestoneBeamAnimating(state: MilestoneBeamState): boolean {
  return state.phase !== "off";
}
