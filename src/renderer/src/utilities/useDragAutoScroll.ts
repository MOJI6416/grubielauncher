import { useEffect } from "react";
import { useLatestRef } from "./useLatestRef";

export const DRAG_SCROLL_EDGE = 48;
export const DRAG_SCROLL_MAX_SPEED = 1;

export function edgeScrollSpeed(
  position: number,
  top: number,
  bottom: number,
): number {
  if (position < top || position > bottom || bottom <= top) return 0;

  const zone = Math.min(DRAG_SCROLL_EDGE, (bottom - top) / 3);
  const ramp = (distance: number) =>
    DRAG_SCROLL_MAX_SPEED * (1 - distance / zone) ** 2;
  if (position < top + zone) return -ramp(position - top);
  if (position > bottom - zone) return ramp(bottom - position);
  return 0;
}

export function useDragAutoScroll(
  active: boolean,
  getScroller: () => HTMLElement | null | undefined,
  getBottomCover?: () => HTMLElement | null | undefined,
) {
  const scrollerRef = useLatestRef(getScroller);
  const coverRef = useLatestRef(getBottomCover);

  useEffect(() => {
    if (!active) return;

    let speed = 0;
    let carry = 0;
    let last = 0;
    let frame = 0;

    const tick = (now: number) => {
      const scroller = scrollerRef.current();
      if (!scroller || speed === 0) {
        frame = 0;
        return;
      }
      carry += speed * Math.max(0, Math.min(now - last, 50));
      last = now;
      const step = Math.trunc(carry);
      if (step !== 0) {
        scroller.scrollTop += step;
        carry -= step;
      }
      frame = requestAnimationFrame(tick);
    };

    const onDragOver = (event: DragEvent) => {
      const scroller = scrollerRef.current();
      if (!scroller) return;

      const rect = scroller.getBoundingClientRect();
      const cover = coverRef.current?.()?.getBoundingClientRect();
      const bottom = cover ? Math.min(rect.bottom, cover.top) : rect.bottom;
      const inside =
        event.clientX >= rect.left && event.clientX <= rect.right;

      speed = inside ? edgeScrollSpeed(event.clientY, rect.top, bottom) : 0;
      if (speed !== 0 && frame === 0) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) speed = 0;
    };

    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragleave", onDragLeave);
      cancelAnimationFrame(frame);
    };
  }, [active, coverRef, scrollerRef]);
}
