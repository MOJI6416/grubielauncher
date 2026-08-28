import { describe, expect, it } from "vitest";
import { getConnectivityPlan } from "./connectivityTest";

describe("connectivity plan", () => {
  it("checks the fallback backend host too, not only the primary", () => {
    const ids = getConnectivityPlan().map((entry) => entry.id);

    expect(ids).toContain("grubie_api");
    expect(ids).toContain("grubie_api_direct");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
