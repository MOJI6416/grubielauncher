const LAYER_SELECTOR = [
  "dialog-content",
  "alert-dialog-content",
  "select-content",
  "dropdown-menu-content",
  "context-menu-content",
  "popover-content",
]
  .map((slot) => `[data-slot="${slot}"]`)
  .join(",");

export function hasOpenOverlay(): boolean {
  return document.querySelector(LAYER_SELECTOR) !== null;
}
