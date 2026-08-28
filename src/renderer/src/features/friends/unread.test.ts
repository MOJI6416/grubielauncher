import { describe, expect, it } from "vitest";
import {
  bumpUnread,
  clearUnread,
  dropUnknownFriends,
  keepLocalUnread,
  totalUnread,
} from "./unread";

describe("bumpUnread", () => {
  it("starts a counter", () => {
    expect(bumpUnread({}, "a")).toEqual({ a: 1 });
  });

  it("increments an existing counter", () => {
    expect(bumpUnread({ a: 2 }, "a")).toEqual({ a: 3 });
  });

  it("ignores an empty id", () => {
    const counts = { a: 1 };
    expect(bumpUnread(counts, "")).toBe(counts);
  });
});

describe("clearUnread", () => {
  it("removes the counter", () => {
    expect(clearUnread({ a: 2, b: 1 }, "a")).toEqual({ b: 1 });
  });

  it("returns the same object when there is nothing to clear", () => {
    const counts = { a: 2 };
    expect(clearUnread(counts, "b")).toBe(counts);
  });
});

describe("dropUnknownFriends", () => {
  it("keeps only counters for known friends", () => {
    expect(dropUnknownFriends({ a: 1, b: 2 }, ["a"])).toEqual({ a: 1 });
  });

  it("returns the same object when nothing changes", () => {
    const counts = { a: 1 };
    expect(dropUnknownFriends(counts, ["a", "b"])).toBe(counts);
  });
});

describe("totalUnread", () => {
  it("sums the counters", () => {
    expect(totalUnread({ a: 2, b: 3 })).toBe(5);
  });

  it("is zero for an empty map", () => {
    expect(totalUnread({})).toBe(0);
  });
});

describe("keepLocalUnread", () => {
  it("does not resurrect a chat read while the summary was on its way", () => {
    expect(keepLocalUnread({ a: 3, b: 1 }, { b: 1 }, ["a"])).toEqual({ b: 1 });
  });

  it("keeps what arrived after that chat was read", () => {
    expect(keepLocalUnread({ a: 3 }, { a: 1 }, ["a"])).toEqual({ a: 1 });
  });

  it("leaves chats nobody touched alone", () => {
    const counts = { a: 3 };
    expect(keepLocalUnread(counts, {}, [])).toBe(counts);
  });
});
