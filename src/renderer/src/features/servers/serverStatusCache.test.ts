import { describe, expect, it } from "vitest";
import { isStatusFresh, pickStaleAddresses } from "./serverStatusCache";
import { ServerPingState } from "./types";

const online = (checkedAt: number): ServerPingState => ({
  state: "online",
  checkedAt,
});

describe("isStatusFresh", () => {
  it("keeps a recent answer", () => {
    expect(isStatusFresh(online(1000), 1500, 5000)).toBe(true);
  });

  it("expires an old answer", () => {
    expect(isStatusFresh(online(1000), 9000, 5000)).toBe(false);
  });

  it("never trusts a pending or missing answer", () => {
    expect(isStatusFresh(undefined, 1000, 5000)).toBe(false);
    expect(isStatusFresh({ state: "pending" }, 1000, 5000)).toBe(false);
  });
});

describe("pickStaleAddresses", () => {
  it("asks only for what is missing", () => {
    const stale = pickStaleAddresses(
      ["a", "b"],
      { a: online(900) },
      new Set(),
      1000,
      5000,
    );

    expect(stale).toEqual(["b"]);
  });

  it("skips duplicates, blanks and requests already in flight", () => {
    const stale = pickStaleAddresses(
      ["a", "a", "", "b"],
      {},
      new Set(["b"]),
      1000,
      5000,
    );

    expect(stale).toEqual(["a"]);
  });

  it("asks again once the answer went stale", () => {
    const stale = pickStaleAddresses(
      ["a"],
      { a: online(100) },
      new Set(),
      9000,
      5000,
    );

    expect(stale).toEqual(["a"]);
  });
});
