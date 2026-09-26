import { RefObject, useCallback, useEffect, useState } from "react";

export const DETAIL_WIDTH_DEFAULT = 344;
export const DETAIL_WIDTH_MIN = 300;
export const DETAIL_WIDTH_MAX = 640;
export const DETAIL_LIST_MIN = 520;

const STORAGE_KEY = "grubie:modDetailWidth";

export function maxDetailWidth(containerWidth: number | null): number {
  if (!containerWidth || containerWidth <= 0) return DETAIL_WIDTH_MAX;
  return Math.max(
    DETAIL_WIDTH_MIN,
    Math.min(DETAIL_WIDTH_MAX, containerWidth - DETAIL_LIST_MIN),
  );
}

export function clampDetailWidth(
  width: number,
  containerWidth: number | null,
): number {
  const value = Number.isFinite(width) ? width : DETAIL_WIDTH_DEFAULT;
  return Math.round(
    Math.min(Math.max(value, DETAIL_WIDTH_MIN), maxDetailWidth(containerWidth)),
  );
}

export function readDetailWidth(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DETAIL_WIDTH_DEFAULT;
  } catch {
    return DETAIL_WIDTH_DEFAULT;
  }
}

function writeDetailWidth(width: number | null) {
  try {
    if (width === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {}
}

export function useDetailPanelWidth(containerRef: RefObject<HTMLElement | null>) {
  const [preferred, setPreferred] = useState(readDetailWidth);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    setContainerWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [containerRef]);

  const clamp = useCallback(
    (width: number) => clampDetailWidth(width, containerWidth),
    [containerWidth],
  );

  const commit = useCallback(
    (width: number) => {
      const next = clamp(width);
      setPreferred(next);
      writeDetailWidth(next);
    },
    [clamp],
  );

  const reset = useCallback(() => {
    setPreferred(DETAIL_WIDTH_DEFAULT);
    writeDetailWidth(null);
  }, []);

  return {
    width: clamp(preferred),
    isDefault: preferred === DETAIL_WIDTH_DEFAULT,
    clamp,
    commit,
    reset,
  };
}
