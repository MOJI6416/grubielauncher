import { describe, expect, it } from "vitest";
import { pickNewShares } from "./shareSessions";

const shares = [{ sessionId: "a" }, { sessionId: "b" }];

describe("pickNewShares", () => {
  it("stays silent on the very first poll", () => {
    expect(pickNewShares(null, shares)).toEqual([]);
  });

  it("announces only sessions that were not seen before", () => {
    expect(pickNewShares(new Set(["a"]), shares)).toEqual([{ sessionId: "b" }]);
  });

  it("announces nothing when nothing changed", () => {
    expect(pickNewShares(new Set(["a", "b"]), shares)).toEqual([]);
  });

  it("announces every session after a reconnect with an empty baseline", () => {
    expect(pickNewShares(new Set(), shares)).toEqual(shares);
  });
});
