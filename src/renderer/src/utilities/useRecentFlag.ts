import { useEffect, useState } from "react";

export const SAVED_FLASH_MS = 1800;

export function useRecentFlag(at: number, durationMs: number): boolean {
  const [expiredAt, setExpiredAt] = useState(0);

  useEffect(() => {
    if (!at) return;
    const timer = window.setTimeout(() => setExpiredAt(at), durationMs);
    return () => window.clearTimeout(timer);
  }, [at, durationMs]);

  return at !== 0 && expiredAt !== at;
}
