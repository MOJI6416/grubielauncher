import { describe, expect, it } from "vitest";
import {
  TOGGLE_GESTURE,
  applySelectionGesture,
  hasSelectionModifier,
  nextSelectionAnchor,
  readSelectionGesture,
  selectionRange,
} from "./rangeSelection";

const order = ["a", "b", "c", "d", "e"];
const replaceRange = { range: true, keepOthers: false };
const extendRange = { range: true, keepOthers: true };

const apply = (
  selected: string[],
  anchor: string | null,
  target: string,
  gesture: typeof replaceRange,
) =>
  [
    ...applySelectionGesture(new Set(selected), order, anchor, target, gesture),
  ].sort();

describe("range selection", () => {
  it("reads gestures like a file explorer", () => {
    const none = { shiftKey: false, ctrlKey: false, metaKey: false };

    expect(hasSelectionModifier(none)).toBe(false);
    expect(hasSelectionModifier({ ...none, metaKey: true })).toBe(true);
    expect(readSelectionGesture({ ...none, ctrlKey: true })).toEqual(
      TOGGLE_GESTURE,
    );
    expect(readSelectionGesture(none, true)).toEqual(TOGGLE_GESTURE);
    expect(readSelectionGesture({ ...none, shiftKey: true })).toEqual(
      replaceRange,
    );
    expect(
      readSelectionGesture({ ...none, shiftKey: true, ctrlKey: true }),
    ).toEqual(extendRange);
    expect(readSelectionGesture({ ...none, shiftKey: true }, true)).toEqual(
      extendRange,
    );
  });

  it("builds the span between anchor and target in either direction", () => {
    expect(selectionRange(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(selectionRange(order, "d", "b")).toEqual(["b", "c", "d"]);
    expect(selectionRange(order, "c", "c")).toEqual(["c"]);
  });

  it("falls back to the target alone without a visible anchor", () => {
    expect(selectionRange(order, null, "c")).toEqual(["c"]);
    expect(selectionRange(order, "z", "c")).toEqual(["c"]);
    expect(selectionRange(order, "a", "z")).toEqual([]);
  });

  it("toggles a single item and keeps the rest", () => {
    expect(apply(["a"], null, "c", TOGGLE_GESTURE)).toEqual(["a", "c"]);
    expect(apply(["a", "c"], "a", "c", TOGGLE_GESTURE)).toEqual(["a"]);
  });

  it("replaces the selection with a range on shift", () => {
    expect(apply(["e"], "a", "c", replaceRange)).toEqual(["a", "b", "c"]);
    expect(apply(["e"], null, "c", replaceRange)).toEqual(["c"]);
  });

  it("extends the selection with a range on ctrl+shift", () => {
    expect(apply(["e"], "d", "b", extendRange)).toEqual(["b", "c", "d", "e"]);
  });

  it("clears a range when the clicked item was already selected", () => {
    expect(apply(["a", "b", "c", "d", "e"], "b", "d", extendRange)).toEqual([
      "a",
      "e",
    ]);
  });

  it("keeps the anchor for ranges and moves it for toggles", () => {
    expect(nextSelectionAnchor(order, "a", "c", replaceRange)).toBe("a");
    expect(nextSelectionAnchor(order, "a", "c", TOGGLE_GESTURE)).toBe("c");
    expect(nextSelectionAnchor(order, null, "c", replaceRange)).toBe("c");
    expect(nextSelectionAnchor(order, "z", "c", extendRange)).toBe("c");
  });
});
