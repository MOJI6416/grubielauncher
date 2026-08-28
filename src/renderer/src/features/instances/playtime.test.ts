import { describe, expect, it } from "vitest";
import { formatPlaytime, formatSessionClock } from "./playtime";

const labels = { h: "ч.", m: "м." };

describe("formatPlaytime", () => {
  it("returns the empty label for nothing played", () => {
    expect(formatPlaytime(0, labels)).toBe("—");
    expect(formatPlaytime(undefined, labels)).toBe("—");
    expect(formatPlaytime(-5, labels)).toBe("—");
    expect(formatPlaytime(0, labels, "нет")).toBe("нет");
  });

  it("keeps very short sessions readable", () => {
    expect(formatPlaytime(20, labels)).toBe("< 1 м.");
    expect(formatPlaytime(59, labels)).toBe("< 1 м.");
  });

  it("drops seconds and hours when they add nothing", () => {
    expect(formatPlaytime(45 * 60 + 12, labels)).toBe("45 м.");
    expect(formatPlaytime(2 * 3600, labels)).toBe("2 ч.");
    expect(formatPlaytime(2 * 3600 + 30 * 60, labels)).toBe("2 ч. 30 м.");
  });

  it("drops minutes past a hundred hours", () => {
    expect(formatPlaytime(120 * 3600 + 30 * 60, labels)).toBe("120 ч.");
  });
});

describe("formatSessionClock", () => {
  it("shows minutes and seconds under an hour", () => {
    expect(formatSessionClock(0)).toBe("00:00");
    expect(formatSessionClock(65_000)).toBe("01:05");
  });

  it("adds hours when the session is long", () => {
    expect(formatSessionClock(3_725_000)).toBe("1:02:05");
  });

  it("never goes negative", () => {
    expect(formatSessionClock(-1000)).toBe("00:00");
  });
});
