export const FOCUS_RING_REACH = 3;

const CLIPPING_OVERFLOW = new Set(["hidden", "auto", "scroll", "clip"]);

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function ringOverflows(
  element: Box,
  clip: Box,
  reach: number,
  axes: { x: boolean; y: boolean },
): boolean {
  if (
    axes.x &&
    (element.left - reach < clip.left || element.right + reach > clip.right)
  ) {
    return true;
  }

  return (
    axes.y &&
    (element.top - reach < clip.top || element.bottom + reach > clip.bottom)
  );
}

function clipBoxOf(node: Element, style: CSSStyleDeclaration): Box {
  const rect = node.getBoundingClientRect();
  return {
    left: rect.left + parseFloat(style.borderLeftWidth || "0"),
    right: rect.right - parseFloat(style.borderRightWidth || "0"),
    top: rect.top + parseFloat(style.borderTopWidth || "0"),
    bottom: rect.bottom - parseFloat(style.borderBottomWidth || "0"),
  };
}

export function needsInsetRing(
  element: Element,
  reach = FOCUS_RING_REACH,
): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  const view = element.ownerDocument.defaultView;
  if (!view) return false;

  for (
    let node = element.parentElement;
    node && node !== element.ownerDocument.body;
    node = node.parentElement
  ) {
    const style = view.getComputedStyle(node);
    const axes = {
      x: CLIPPING_OVERFLOW.has(style.overflowX),
      y: CLIPPING_OVERFLOW.has(style.overflowY),
    };
    if (!axes.x && !axes.y) continue;

    if (ringOverflows(rect, clipBoxOf(node, style), reach, axes)) return true;
  }

  return false;
}

export const INSET_RING_ATTRIBUTE = "data-ring-inset";

export function installFocusRingGuard(doc: Document = document): () => void {
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (needsInsetRing(target)) target.setAttribute(INSET_RING_ATTRIBUTE, "");
    else target.removeAttribute(INSET_RING_ATTRIBUTE);
  };

  const onFocusOut = (event: FocusEvent) => {
    const target = event.target;
    if (target instanceof Element) target.removeAttribute(INSET_RING_ATTRIBUTE);
  };

  doc.addEventListener("focusin", onFocusIn, true);
  doc.addEventListener("focusout", onFocusOut, true);

  return () => {
    doc.removeEventListener("focusin", onFocusIn, true);
    doc.removeEventListener("focusout", onFocusOut, true);
  };
}
