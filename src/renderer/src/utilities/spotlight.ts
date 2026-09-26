import type { PointerEvent } from "react";

export function trackSpotlight(event: PointerEvent<HTMLElement>): void {
  const target = event.currentTarget;
  const box = target.getBoundingClientRect();

  target.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
  target.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
}
