import { describe, expect, it } from "vitest";
import { keepPendingIds } from "./pendingIds";

describe("keepPendingIds", () => {
  it("returns the very same array when nothing was answered", () => {
    const ids = ["req-1", "req-2"];
    expect(keepPendingIds(ids, ["req-1", "req-2", "req-3"])).toBe(ids);
  });

  it("keeps identity when the known list grows", () => {
    const ids = ["req-1"];
    const grown = keepPendingIds(ids, ["req-1", "stranger"]);
    expect(grown).toBe(ids);
  });

  it("drops ids the server answered", () => {
    const ids = ["req-1", "req-2"];
    const next = keepPendingIds(ids, ["req-2"]);

    expect(next).not.toBe(ids);
    expect(next).toEqual(["req-2"]);
  });

  it("empties out when everything was answered", () => {
    expect(keepPendingIds(["req-1"], [])).toEqual([]);
  });

  it("leaves an empty list alone", () => {
    const ids: string[] = [];
    expect(keepPendingIds(ids, ["req-1"])).toBe(ids);
  });
});
