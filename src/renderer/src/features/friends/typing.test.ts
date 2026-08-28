import { describe, expect, it } from "vitest";
import {
  clearTyping,
  isTyping,
  markTyping,
  pruneTyping,
  shouldPingTyping,
  TYPING_TTL_MS,
} from "./typing";

const NOW = 1_760_000_000_000;

describe("markTyping", () => {
  it("remembers when the indicator arrived", () => {
    expect(markTyping({}, "a", NOW)).toEqual({ a: NOW });
  });

  it("refreshes an existing indicator", () => {
    expect(markTyping({ a: NOW - 5000 }, "a", NOW)).toEqual({ a: NOW });
  });

  it("ignores an empty id", () => {
    const map = { a: NOW };
    expect(markTyping(map, "", NOW)).toBe(map);
  });
});

describe("clearTyping", () => {
  it("removes the indicator", () => {
    expect(clearTyping({ a: NOW, b: NOW }, "a")).toEqual({ b: NOW });
  });

  it("returns the same object when there is nothing to clear", () => {
    const map = { a: NOW };
    expect(clearTyping(map, "b")).toBe(map);
  });
});

describe("pruneTyping", () => {
  it("drops indicators the peer never withdrew", () => {
    const map = { stale: NOW - TYPING_TTL_MS - 1, fresh: NOW - 1000 };
    expect(pruneTyping(map, NOW)).toEqual({ fresh: NOW - 1000 });
  });

  it("returns the same object while everything is fresh", () => {
    const map = { a: NOW };
    expect(pruneTyping(map, NOW)).toBe(map);
  });
});

describe("isTyping", () => {
  it("is true inside the window", () => {
    expect(isTyping({ a: NOW - 1000 }, "a", NOW)).toBe(true);
  });

  it("expires without a stopTyping event", () => {
    expect(isTyping({ a: NOW - TYPING_TTL_MS }, "a", NOW)).toBe(false);
  });

  it("is false for an unknown or missing id", () => {
    expect(isTyping({ a: NOW }, "b", NOW)).toBe(false);
    expect(isTyping({ a: NOW }, undefined, NOW)).toBe(false);
  });
});

describe("shouldPingTyping", () => {
  it("sends the first keystroke", () => {
    expect(shouldPingTyping(null, NOW)).toBe(true);
  });

  it("stays quiet inside the interval", () => {
    expect(shouldPingTyping(NOW - 500, NOW)).toBe(false);
  });

  it("pings again once the interval passed", () => {
    expect(shouldPingTyping(NOW - 3000, NOW)).toBe(true);
  });
});
