import { useEffect, useState } from "react";
import { useLatestRef } from "./useLatestRef";

const LOAD_THRESHOLD_PX = 240;

export function useLoadOnScroll(
  enabled: boolean,
  onLoad: () => void,
  contentKey?: unknown,
) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const onLoadRef = useLatestRef(onLoad);

  useEffect(() => {
    if (!element || !enabled) return;

    const check = () => {
      const rest =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      if (rest <= LOAD_THRESHOLD_PX) onLoadRef.current();
    };

    const frame = requestAnimationFrame(check);
    element.addEventListener("scroll", check, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", check);
    };
  }, [element, enabled, contentKey, onLoadRef]);

  return setElement;
}
