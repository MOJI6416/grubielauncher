export interface SelectionGesture {
  range: boolean;
  keepOthers: boolean;
}

interface ModifierState {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export const TOGGLE_GESTURE: SelectionGesture = {
  range: false,
  keepOthers: true,
};

export function hasSelectionModifier(event: ModifierState) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

export function readSelectionGesture(
  event: ModifierState,
  keepOthers = false,
): SelectionGesture {
  return {
    range: event.shiftKey,
    keepOthers: keepOthers || event.ctrlKey || event.metaKey,
  };
}

export function preventShiftTextSelection(event: {
  shiftKey: boolean;
  preventDefault: () => void;
}) {
  if (event.shiftKey) event.preventDefault();
}

export function selectionRange<K>(
  order: readonly K[],
  anchor: K | null,
  target: K,
): K[] {
  const to = order.indexOf(target);
  if (to === -1) return [];

  const from = anchor === null ? -1 : order.indexOf(anchor);
  if (from === -1) return [target];

  return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}

export function nextSelectionAnchor<K>(
  order: readonly K[],
  anchor: K | null,
  target: K,
  gesture: SelectionGesture,
): K {
  if (gesture.range && anchor !== null && order.includes(anchor)) return anchor;
  return target;
}

export function applySelectionGesture<K>(
  selection: ReadonlySet<K>,
  order: readonly K[],
  anchor: K | null,
  target: K,
  gesture: SelectionGesture,
): Set<K> {
  const span = gesture.range ? selectionRange(order, anchor, target) : [target];

  if (!gesture.keepOthers) return new Set(span);

  const select = !selection.has(target);
  const next = new Set(selection);
  for (const key of span) {
    if (select) next.add(key);
    else next.delete(key);
  }
  return next;
}
