import { describe, expect, it } from "vitest";
import { checkServerCompatibility, extractVersions } from "./compat";

describe("extractVersions", () => {
  it("pulls every version-like token out of a server brand", () => {
    expect(extractVersions("Paper 1.21.1")).toEqual(["1.21.1"]);
    expect(extractVersions("NeoForge 1.21.1")).toEqual(["1.21.1"]);
    expect(extractVersions("Requires MC 1.20.4-1.21")).toEqual(["1.20.4", "1.21"]);
    expect(extractVersions(undefined)).toEqual([]);
  });
});

describe("checkServerCompatibility", () => {
  it("matches an exact version", () => {
    expect(checkServerCompatibility("Paper 1.21.1", "1.21.1")).toBe("match");
  });

  it("matches the family when the server only names it", () => {
    expect(checkServerCompatibility("Fabric 1.21", "1.21.1")).toBe("match");
    expect(checkServerCompatibility("Paper 1.21.4", "1.21")).toBe("match");
  });

  it("reports a real mismatch", () => {
    expect(checkServerCompatibility("Paper 1.20.1", "1.21.1")).toBe("mismatch");
  });

  it("stays quiet when there is nothing to compare", () => {
    expect(checkServerCompatibility(undefined, "1.21.1")).toBe("unknown");
    expect(checkServerCompatibility("Paper 1.21.1", undefined)).toBe("unknown");
    expect(checkServerCompatibility("Waterfall", "1.21.1")).toBe("unknown");
  });
});
