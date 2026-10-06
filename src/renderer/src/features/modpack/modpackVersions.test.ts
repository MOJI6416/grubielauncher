import { describe, expect, it } from "vitest";
import type { IVersion } from "@/types/ModManager";
import {
  classifyModpackVersions,
  findModpackUpdate,
  modpackVersionLabel,
} from "./modpackVersions";

function version(
  id: string,
  date: string,
  options: Partial<IVersion> = {},
): IVersion {
  return {
    id,
    name: `Pack ${id}`,
    dependencies: [],
    downloads: 0,
    files: [],
    datePublished: date,
    gameVersions: ["1.21.1"],
    releaseType: "release",
    ...options,
  };
}

const list = [
  version("v4", "2026-04-01", { releaseType: "beta" }),
  version("v3", "2026-03-01", { gameVersions: ["1.21.4"] }),
  version("v2", "2026-02-01"),
  version("v1", "2026-01-01"),
];

describe("classifyModpackVersions", () => {
  it("marks the current, newer and older versions", () => {
    const rows = classifyModpackVersions(list, { id: "v2" }, "1.21.1");

    expect(rows.map((row) => row.relation)).toEqual([
      "newer",
      "newer",
      "current",
      "older",
    ]);
    expect(rows.map((row) => row.sameGame)).toEqual([true, false, true, true]);
  });

  it("calls every version newer when the current one is not listed", () => {
    const rows = classifyModpackVersions(list, { id: "gone" }, "1.21.1");
    expect(rows.every((row) => row.relation === "newer")).toBe(true);
  });
});

describe("findModpackUpdate", () => {
  it("offers only releases to a release and skips other game versions", () => {
    expect(findModpackUpdate(list, { id: "v1" }, "1.21.1")?.id).toBe("v2");
  });

  it("offers betas to someone already on a beta", () => {
    const betas = [
      version("b2", "2026-05-01", { releaseType: "beta" }),
      version("b1", "2026-04-01", { releaseType: "beta" }),
    ];
    expect(findModpackUpdate(betas, { id: "b1" }, "1.21.1")?.id).toBe("b2");
  });

  it("has nothing to offer when the current version is unknown or newest", () => {
    expect(findModpackUpdate(list, { id: "gone" }, "1.21.1")).toBeNull();
    expect(findModpackUpdate(list, { id: "v2" }, "1.21.1")).toBeNull();
  });
});

describe("installed version missing from the list", () => {
  const installed = {
    id: "v0",
    publishedAt: "2025-12-01",
    releaseType: "release" as const,
  };

  it("orders the list by the remembered publish date", () => {
    const rows = classifyModpackVersions(list, installed, "1.21.1");
    expect(rows.every((row) => row.relation === "newer")).toBe(true);

    const later = classifyModpackVersions(
      list,
      { ...installed, publishedAt: "2026-02-15" },
      "1.21.1",
    );
    expect(later.map((row) => row.relation)).toEqual([
      "newer",
      "newer",
      "older",
      "older",
    ]);
  });

  it("still finds the update for a version CurseForge no longer lists", () => {
    expect(findModpackUpdate(list, installed, "1.21.1")?.id).toBe("v2");
  });
});

describe("modpackVersionLabel", () => {
  it("prefers the version number over the display name", () => {
    expect(modpackVersionLabel(version("x", "", { versionNumber: "2.0" }))).toBe(
      "2.0",
    );
    expect(modpackVersionLabel(version("x", ""))).toBe("Pack x");
  });
});
