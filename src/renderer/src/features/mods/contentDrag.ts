import type { DragEvent } from "react";

export const CONTENT_DRAG_TYPE = "application/x-grubie-content";

export function isContentDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(CONTENT_DRAG_TYPE);
}

export function isFileDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes("Files");
}

export function startContentDrag(
  event: DragEvent,
  keys: string[],
  label: string,
) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(CONTENT_DRAG_TYPE, JSON.stringify(keys));

  const ghost = document.createElement("div");
  ghost.textContent = label;
  ghost.className =
    "fixed -top-96 left-0 max-w-64 truncate rounded-md border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-medium text-foreground";
  document.body.appendChild(ghost);
  event.dataTransfer.setDragImage(ghost, 14, 14);
  requestAnimationFrame(() => ghost.remove());
}
