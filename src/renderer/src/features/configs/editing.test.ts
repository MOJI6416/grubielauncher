import { describe, expect, it } from "vitest";
import {
  EditPatch,
  applyPatch,
  autoPairPatch,
  newlinePatch,
  pairBackspacePatch,
} from "./editing";

function run(text: string, patch: EditPatch | null) {
  if (!patch) return null;
  return { text: applyPatch(text, patch), caret: patch.caret };
}

describe("config editing helpers", () => {
  it("closes a bracket and keeps the caret inside", () => {
    expect(run("", autoPairPatch("", 0, 0, "{"))).toEqual({
      text: "{}",
      caret: 1,
    });
  });

  it("wraps the selection instead of replacing it", () => {
    const patch = autoPairPatch("value", 0, 5, '"');
    expect(run("value", patch)).toEqual({ text: '"value"', caret: 1 });
    expect(patch?.selectTo).toBe(6);
  });

  it("skips over a closing character instead of doubling it", () => {
    const patch = autoPairPatch("{}", 1, 1, "}");
    expect(patch).toEqual({ from: 1, to: 1, insert: "", caret: 2 });
    expect(run("{}", patch)).toEqual({ text: "{}", caret: 2 });
  });

  it("does not pair a quote right after a word", () => {
    expect(autoPairPatch("don", 3, 3, "'")).toBeNull();
  });

  it("does not pair a quote that already closes one", () => {
    const patch = autoPairPatch('"a"', 3, 3, '"');
    expect(patch).toBeNull();
  });

  it("removes both halves of an empty pair on backspace", () => {
    expect(run("{}", pairBackspacePatch("{}", 1, 1))).toEqual({
      text: "",
      caret: 0,
    });
    expect(pairBackspacePatch("{a}", 2, 2)).toBeNull();
    expect(pairBackspacePatch("", 0, 0)).toBeNull();
  });

  it("keeps the indent of the current line", () => {
    const patch = newlinePatch("  port: 25565", 13, 13);
    expect(applyPatch("  port: 25565", patch)).toBe("  port: 25565\n  ");
    expect(patch.caret).toBe(16);
  });

  it("opens a block between braces", () => {
    const patch = newlinePatch("{}", 1, 1);
    expect(applyPatch("{}", patch)).toBe("{\n  \n}");
    expect(patch.caret).toBe(4);
  });

  it("indents after a dangling opener", () => {
    const patch = newlinePatch('  "pack": {', 11, 11);
    expect(applyPatch('  "pack": {', patch)).toBe('  "pack": {\n    ');
    expect(patch.caret).toBe(16);
  });

  it("replaces the selection when Enter is pressed over it", () => {
    const patch = newlinePatch("abcdef", 1, 4);
    expect(applyPatch("abcdef", patch)).toBe("a\nef");
  });
});
