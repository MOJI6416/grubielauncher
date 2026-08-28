import { describe, expect, it } from "vitest";
import { ProjectType } from "@/types/ModManager";
import {
  countContent,
  countMods,
  instanceLastLaunch,
  resolveLastLaunch,
} from "./contentCounts";

const library = [
  { projectType: ProjectType.MOD },
  { projectType: ProjectType.MOD },
  { projectType: ProjectType.RESOURCEPACK },
  { projectType: ProjectType.SHADER },
];

describe("content counts", () => {
  it("counts every installed project as content", () => {
    expect(countContent(library)).toBe(4);
    expect(countContent([])).toBe(0);
    expect(countContent(undefined)).toBe(0);
  });

  it("counts only mods when the label says mods", () => {
    expect(countMods(library)).toBe(2);
    expect(countMods(undefined)).toBe(0);
  });

  it("treats an entry without a type as a mod", () => {
    expect(countMods([{}, { projectType: ProjectType.RESOURCEPACK }])).toBe(1);
  });
});

describe("resolveLastLaunch", () => {
  it("prefers the statistics timestamp", () => {
    const resolved = resolveLastLaunch(
      "2026-08-19T10:00:00.000Z",
      "2026-08-01T10:00:00.000Z",
    );

    expect(resolved?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });

  it("falls back to the instance timestamp when statistics are missing", () => {
    const resolved = resolveLastLaunch(undefined, "2026-08-01T10:00:00.000Z");

    expect(resolved?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("keeps the newer instance timestamp when statistics lag behind", () => {
    const resolved = resolveLastLaunch(
      "2026-08-01T10:00:00.000Z",
      "2026-08-19T10:00:00.000Z",
      4,
    );

    expect(resolved?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });

  it("reports nothing when both are missing or broken", () => {
    expect(resolveLastLaunch(undefined, undefined)).toBeNull();
    expect(resolveLastLaunch("", "not a date")).toBeNull();
  });

  it("reports nothing when statistics say the instance was never launched", () => {
    expect(
      resolveLastLaunch(undefined, "2026-08-01T10:00:00.000Z", 0),
    ).toBeNull();
    expect(
      resolveLastLaunch(undefined, "2026-08-01T10:00:00.000Z", 1)?.toISOString(),
    ).toBe("2026-08-01T10:00:00.000Z");
    expect(
      resolveLastLaunch(
        undefined,
        "2026-08-01T10:00:00.000Z",
        undefined,
      )?.toISOString(),
    ).toBe("2026-08-01T10:00:00.000Z");
  });
});

describe("instanceLastLaunch", () => {
  it("uses the statistics timestamp when the instance has statistics", () => {
    const resolved = instanceLastLaunch("2026-08-01T10:00:00.000Z", {
      lastLaunched: "2026-08-19T10:00:00.000Z",
      launches: 4,
    });

    expect(resolved?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });

  it("keeps the instance timestamp when no statistics file exists", () => {
    const resolved = instanceLastLaunch("2026-08-01T10:00:00.000Z", undefined);

    expect(resolved?.toISOString()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("says nothing when neither source knows about a launch", () => {
    expect(instanceLastLaunch(undefined, null)).toBeNull();
  });

  it("trusts the instance when it was played by an account that writes no statistics", () => {
    const resolved = instanceLastLaunch("2026-08-19T10:00:00.000Z", {
      lastLaunched: "2026-01-05T10:00:00.000Z",
      launches: 12,
    });

    expect(resolved?.toISOString()).toBe("2026-08-19T10:00:00.000Z");
  });
});
