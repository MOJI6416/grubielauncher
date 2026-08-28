import { describe, expect, it } from "vitest";

import { CatalogRequest, requestSignature } from "./catalog";
import { formatCompactNumber, formatDate, relativeDays } from "./format";
import { ProjectType, Provider } from "@/types/ModManager";

function request(overrides: Partial<CatalogRequest> = {}): CatalogRequest {
  return {
    provider: Provider.MODRINTH,
    projectType: ProjectType.MOD,
    query: "sodium",
    sort: "relevance",
    filters: ["a", "b"],
    gameVersion: "1.21.4",
    loader: "fabric",
    ...overrides,
  };
}

describe("requestSignature", () => {
  it("ignores filter order and surrounding whitespace", () => {
    expect(requestSignature(request({ filters: ["b", "a"] }))).toBe(
      requestSignature(request({ filters: ["a", "b"] })),
    );
    expect(requestSignature(request({ query: "  sodium  " }))).toBe(
      requestSignature(request({ query: "sodium" })),
    );
  });

  it("changes when any meaningful field changes", () => {
    const base = requestSignature(request());

    expect(requestSignature(request({ provider: Provider.CURSEFORGE }))).not.toBe(base);
    expect(requestSignature(request({ projectType: ProjectType.SHADER }))).not.toBe(base);
    expect(requestSignature(request({ sort: "downloads" }))).not.toBe(base);
    expect(requestSignature(request({ gameVersion: "1.21.5" }))).not.toBe(base);
    expect(requestSignature(request({ loader: "forge" }))).not.toBe(base);
    expect(requestSignature(request({ filters: ["a"] }))).not.toBe(base);
  });

  it("treats a missing version and loader as empty", () => {
    expect(
      requestSignature(request({ gameVersion: undefined, loader: undefined })),
    ).toBe("modrinth|mod|sodium|relevance|a+b||");
  });
});

describe("formatCompactNumber", () => {
  it("formats large numbers compactly", () => {
    expect(formatCompactNumber(1500, "en")).toBe("1.5K");
    expect(formatCompactNumber(0, "en")).toBe("0");
  });

  it("rejects missing and negative values", () => {
    expect(formatCompactNumber(undefined, "en")).toBeNull();
    expect(formatCompactNumber(null, "en")).toBeNull();
    expect(formatCompactNumber(-1, "en")).toBeNull();
    expect(formatCompactNumber(Number.NaN, "en")).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats an ISO date", () => {
    expect(formatDate("2024-03-05T00:00:00.000Z", "en")).toContain("2024");
  });

  it("rejects empty and broken values", () => {
    expect(formatDate(undefined, "en")).toBeNull();
    expect(formatDate("", "en")).toBeNull();
    expect(formatDate("not-a-date", "en")).toBeNull();
  });
});

describe("relativeDays", () => {
  it("counts whole days back", () => {
    const now = Date.parse("2024-03-05T00:00:00.000Z");
    expect(relativeDays("2024-03-01T00:00:00.000Z", now)).toBe(4);
    expect(relativeDays(undefined, now)).toBeNull();
    expect(relativeDays("nope", now)).toBeNull();
  });
});
