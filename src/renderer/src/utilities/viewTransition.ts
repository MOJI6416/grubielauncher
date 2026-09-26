import { flushSync } from "react-dom";

const MORPH_NAME = "morph-art";
const POLL_MS = 16;

async function waitForElement(
  selector: string,
  timeoutMs: number,
): Promise<HTMLElement | null> {
  const deadline = performance.now() + timeoutMs;

  for (;;) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element || performance.now() >= deadline) return element;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export function morphTransition({
  source,
  target,
  update,
  timeoutMs = 300,
}: {
  source: string;
  target: string;
  update: () => void;
  timeoutMs?: number;
}): void {
  const from = document.querySelector<HTMLElement>(source);
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!from || reducedMotion || typeof document.startViewTransition !== "function") {
    update();
    return;
  }

  let to: HTMLElement | null = null;
  from.style.viewTransitionName = MORPH_NAME;

  const transition = document.startViewTransition(async () => {
    from.style.viewTransitionName = "";
    flushSync(update);
    to = await waitForElement(target, timeoutMs);
    if (to) to.style.viewTransitionName = MORPH_NAME;
  });

  void transition.ready.catch(() => {});
  void transition.finished
    .catch(() => {})
    .finally(() => {
      from.style.viewTransitionName = "";
      if (to) to.style.viewTransitionName = "";
    });
}
