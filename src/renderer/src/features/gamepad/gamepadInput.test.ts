import { describe, expect, it } from "vitest";
import {
  GamepadReader,
  REPEAT_DELAY_MS,
  REPEAT_INTERVAL_MS,
  heldDirection,
  scrollAmount,
  type PadSnapshot,
} from "./gamepadInput";

function pad(
  pressed: number[] = [],
  axes: number[] = [0, 0, 0, 0],
): PadSnapshot {
  const buttons = Array.from({ length: 17 }, (_, index) =>
    pressed.includes(index) ? 1 : 0,
  );
  return { buttons, axes };
}

describe("gamepad reader", () => {
  it("fires a button once per press", () => {
    const reader = new GamepadReader();
    expect(reader.read([pad([0])], 0).actions).toEqual([
      { type: "press", button: "a" },
    ]);
    expect(reader.read([pad([0])], 500).actions).toEqual([]);
    expect(reader.read([pad()], 520).actions).toEqual([]);
    expect(reader.read([pad([0])], 540).actions).toEqual([
      { type: "press", button: "a" },
    ]);
  });

  it("repeats a held direction after a pause", () => {
    const reader = new GamepadReader();
    expect(reader.read([pad([13])], 0).actions).toEqual([
      { type: "move", direction: "down" },
    ]);
    expect(reader.read([pad([13])], REPEAT_DELAY_MS - 1).actions).toEqual([]);
    expect(reader.read([pad([13])], REPEAT_DELAY_MS).actions).toEqual([
      { type: "move", direction: "down" },
    ]);
    expect(
      reader.read([pad([13])], REPEAT_DELAY_MS + REPEAT_INTERVAL_MS - 1)
        .actions,
    ).toEqual([]);
    expect(
      reader.read([pad([13])], REPEAT_DELAY_MS + REPEAT_INTERVAL_MS).actions,
    ).toEqual([{ type: "move", direction: "down" }]);
  });

  it("moves at once when the direction changes", () => {
    const reader = new GamepadReader();
    reader.read([pad([15])], 0);
    expect(reader.read([pad([14])], 30).actions).toEqual([
      { type: "move", direction: "left" },
    ]);
  });

  it("merges every connected pad", () => {
    const reader = new GamepadReader();
    expect(reader.read([pad(), pad([1])], 0).actions).toEqual([
      { type: "press", button: "b" },
    ]);
  });

  it("drops everything held after a reset", () => {
    const reader = new GamepadReader();
    reader.read([pad([0, 12])], 0);
    reader.reset();
    expect(reader.read([pad([0, 12])], 10).actions).toEqual([
      { type: "move", direction: "up" },
      { type: "press", button: "a" },
    ]);
  });
});

describe("sticks", () => {
  it("reads the left stick past its dead zone along the stronger axis", () => {
    expect(heldDirection([pad([], [0.3, 0.2, 0, 0])])).toBeNull();
    expect(heldDirection([pad([], [0.9, -0.6, 0, 0])])).toBe("right");
    expect(heldDirection([pad([], [0.2, -0.8, 0, 0])])).toBe("up");
  });

  it("lets the D-pad win over the stick", () => {
    expect(heldDirection([pad([14], [0.9, 0, 0, 0])])).toBe("left");
  });

  it("scrolls with the right stick, gently near the centre", () => {
    expect(scrollAmount([pad([], [0, 0, 0, 0.1])])).toBe(0);
    expect(scrollAmount([pad([], [0, 0, 0, 1])])).toBe(1);
    expect(scrollAmount([pad([], [0, 0, 0, -1])])).toBe(-1);
    const half = scrollAmount([pad([], [0, 0, 0, 0.6])]);
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
  });
});
