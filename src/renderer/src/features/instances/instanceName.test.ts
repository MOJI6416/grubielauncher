import { describe, expect, it } from "vitest";
import { uniqueInstanceName } from "./instanceName";

describe("uniqueInstanceName", () => {
  it("keeps a free name", () => {
    expect(uniqueInstanceName("Fabric 26.2", ["Vanilla 26.2"])).toBe(
      "Fabric 26.2",
    );
  });

  it("appends a counter when the name is taken", () => {
    expect(uniqueInstanceName("Vanilla 26.2", ["Vanilla 26.2"])).toBe(
      "Vanilla 26.2 (2)",
    );
    expect(
      uniqueInstanceName("Vanilla 26.2", ["Vanilla 26.2", "vanilla 26.2 (2)"]),
    ).toBe("Vanilla 26.2 (3)");
  });

  it("ignores case and surrounding spaces", () => {
    expect(uniqueInstanceName("  Vanilla 26.2 ", ["VANILLA 26.2"])).toBe(
      "Vanilla 26.2 (2)",
    );
  });

  it("never exceeds the 32 character limit", () => {
    const long = "a".repeat(40);
    expect(uniqueInstanceName(long, []).length).toBe(32);

    const taken = "a".repeat(32);
    const next = uniqueInstanceName(long, [taken]);
    expect(next.length).toBeLessThanOrEqual(32);
    expect(next.endsWith(" (2)")).toBe(true);
  });

  it("returns an empty string for an empty base", () => {
    expect(uniqueInstanceName("   ", ["x"])).toBe("");
  });
});
