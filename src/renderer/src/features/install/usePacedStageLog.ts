import { useEffect, useState } from "react";
import {
  PacedStage,
  STAGE_MIN_VISIBLE_MS,
  StageEvent,
  paceStageLog,
} from "./progressModel";

const RUNNING_TICK_MS = 1000;

export function usePacedStageLog(
  log: StageEvent[],
  minMs = STAGE_MIN_VISIBLE_MS,
): PacedStage[] {
  const [now, setNow] = useState(() => Date.now());
  const { visible, nextAt } = paceStageLog(log, now, minMs);
  const isRunning = visible[visible.length - 1]?.running === true;

  useEffect(() => {
    setNow(Date.now());
  }, [log]);

  useEffect(() => {
    if (nextAt === null && !isRunning) return;

    const delay = Math.min(
      nextAt === null ? RUNNING_TICK_MS : Math.max(16, nextAt - Date.now()),
      RUNNING_TICK_MS,
    );

    const timer = window.setTimeout(() => setNow(Date.now()), delay);

    return () => window.clearTimeout(timer);
  }, [nextAt, isRunning, now]);

  return visible;
}
