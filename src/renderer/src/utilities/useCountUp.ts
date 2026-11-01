import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const MIN_FRAME_MS = 15;

export function useCountUp(target: number, durationMs = 700): number {
  const reducedMotion = useReducedMotion() === true;
  const [value, setValue] = useState(() => (reducedMotion ? target : 0));
  const valueRef = useRef(value);

  useEffect(() => {
    const from = valueRef.current;

    if (reducedMotion || document.hidden || !Number.isFinite(target)) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    if (from === target) return;

    const startedAt = performance.now();
    const whole = Number.isInteger(target) && Number.isInteger(from);
    let committedAt = 0;
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const exact = progress === 1 ? target : from + (target - from) * eased;
      const next = whole ? Math.round(exact) : exact;

      if (
        progress === 1 ||
        (next !== valueRef.current && now - committedAt >= MIN_FRAME_MS)
      ) {
        committedAt = now;
        valueRef.current = next;
        setValue(next);
      }
      if (progress < 1) frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reducedMotion]);

  return value;
}
