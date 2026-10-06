import { useEffect, useRef, useState } from "react";

const WAVE_WINDOW_MS = 500;

export function useEntranceWave(isLoading: boolean, enabled = true): boolean {
  const [isActive, setActive] = useState(false);
  const wasLoading = useRef(isLoading);

  useEffect(() => {
    const finished = wasLoading.current && !isLoading;
    wasLoading.current = isLoading;
    if (!finished || !enabled) return;

    setActive(true);
    const timer = window.setTimeout(() => setActive(false), WAVE_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading, enabled]);

  return isActive;
}
