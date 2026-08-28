import { useEffect, useRef } from "react";

const OVERLAY_LAYERS =
  "[data-slot='dialog-content'],[data-slot='alert-dialog-content'],[data-radix-popper-content-wrapper],[cmdk-dialog]";

let lastOutsideFocus: HTMLElement | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target === document.body) return;
      if (typeof target.closest !== "function") return;
      if (target.closest(OVERLAY_LAYERS)) return;

      lastOutsideFocus = target;
    },
    true,
  );
}

export function useFocusReturn(active: boolean = true) {
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    openerRef.current = lastOutsideFocus;

    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (!opener || !opener.isConnected) return;

      requestAnimationFrame(() => {
        if (!opener.isConnected) return;
        if (
          document.activeElement &&
          document.activeElement !== document.body
        ) {
          return;
        }

        opener.focus({ preventScroll: true });
      });
    };
  }, [active]);
}
