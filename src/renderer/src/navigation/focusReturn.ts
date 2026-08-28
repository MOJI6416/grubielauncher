const MAX_FRAMES = 30;

let pendingKey: string | null = null;

export function rememberFocusOrigin(): void {
  const active = document.activeElement;
  pendingKey =
    active instanceof HTMLElement
      ? (active.closest<HTMLElement>("[data-focus-key]")?.dataset.focusKey ??
        null)
      : null;
}

export function restoreFocusOrigin(): void {
  const key = pendingKey;
  pendingKey = null;
  if (!key) return;

  let frames = 0;

  const tick = () => {
    const active = document.activeElement;
    if (active && active !== document.body) return;

    const target = document.querySelector<HTMLElement>(
      `[data-focus-key="${CSS.escape(key)}"]`,
    );
    if (target) {
      target.focus();
      return;
    }

    frames += 1;
    if (frames > MAX_FRAMES) return;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
