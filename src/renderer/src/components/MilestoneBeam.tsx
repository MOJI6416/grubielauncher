import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
  nextMilestoneBeam,
  startMilestoneBeam,
  type MilestoneBeamState,
} from "./milestoneBeamState";

const RUN_MS = 6000;
const FADE_MS = 300;

export function MilestoneBeam({
  className,
  runMs = RUN_MS,
}: {
  className?: string;
  runMs?: number;
}) {
  const reducedMotion = useReducedMotion() === true;
  const [state, setState] = useState<MilestoneBeamState>(() =>
    startMilestoneBeam(reducedMotion),
  );

  useEffect(() => {
    if (reducedMotion) setState(startMilestoneBeam(true));
  }, [reducedMotion]);

  useEffect(() => {
    if (state.phase === "off") return;

    const timer = window.setTimeout(
      () =>
        setState((current) =>
          nextMilestoneBeam(
            current,
            current.phase === "on" ? "elapsed" : "faded",
          ),
        ),
      state.phase === "on" ? runMs : FADE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [state.phase, runMs]);

  useEffect(() => {
    const onBlur = () =>
      setState((current) => nextMilestoneBeam(current, "blur"));
    const onFocus = () =>
      setState((current) => nextMilestoneBeam(current, "focus"));
    const onVisibility = () => (document.hidden ? onBlur() : onFocus());

    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <span
      aria-hidden
      data-milestone-beam={state.phase}
      data-state={state.phase}
      className={cn("milestone-marker", className)}
    />
  );
}
