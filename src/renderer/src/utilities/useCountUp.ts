import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

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
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress === 1 ? target : from + (target - from) * eased;

      valueRef.current = next;
      setValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reducedMotion]);

  return value;
}
