import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import { hasLocalContent, summarizePackContent } from "./packSummary";

function project(
  id: string,
  projectType: ProjectType,
  provider: Provider,
  size = 0,
): ILocalProject {
  return {
    id,
    title: id,
    description: "",
    projectType,
    iconUrl: null,
    url: "",
    provider,
    version: {
      id: `${id}-1`,
      dependencies: [],
      files: size
        ? [
            {
              filename: `${id}.jar`,
              size,
              sha1: "",
              url: "",
              isServer: true,
            },
          ]
        : [],
    },
  };
}

describe("summarizePackContent", () => {
  it("returns an empty summary for an empty pack", () => {
    expect(summarizePackContent([])).toEqual({
      total: 0,
      groups: [],
      bytes: 0,
      localCount: 0,
      providers: { curseforge: 0, modrinth: 0, other: 0 },
    });
  });

  it("groups content by type in a stable order", () => {
    const summary = summarizePackContent([
      project("shader", ProjectType.SHADER, Provider.MODRINTH),
      project("mod-a", ProjectType.MOD, Provider.CURSEFORGE),
      project("pack", ProjectType.RESOURCEPACK, Provider.MODRINTH),
      project("mod-b", ProjectType.MOD, Provider.MODRINTH),
    ]);

    expect(summary.groups).toEqual([
      { type: ProjectType.MOD, count: 2 },
      { type: ProjectType.RESOURCEPACK, count: 1 },
      { type: ProjectType.SHADER, count: 1 },
    ]);
    expect(summary.total).toBe(4);
  });

  it("sums file sizes and counts providers", () => {
    const summary = summarizePackContent([
      project("mod-a", ProjectType.MOD, Provider.CURSEFORGE, 1024),
      project("mod-b", ProjectType.MOD, Provider.MODRINTH, 2048),
      project("mod-c", ProjectType.MOD, Provider.LOCAL, 512),
    ]);

    expect(summary.bytes).toBe(3584);
    expect(summary.providers).toEqual({
      curseforge: 1,
      modrinth: 1,
      other: 1,
    });
    expect(summary.localCount).toBe(1);
  });

  it("ignores mods that carry no files", () => {
    const summary = summarizePackContent([
      project("mod-a", ProjectType.MOD, Provider.CURSEFORGE),
    ]);

    expect(summary.bytes).toBe(0);
    expect(summary.total).toBe(1);
  });
});

describe("hasLocalContent", () => {
  it("detects hand-added files inside a shared pack", () => {
    expect(
      hasLocalContent([project("mod-a", ProjectType.MOD, Provider.CURSEFORGE)]),
    ).toBe(false);
    expect(
      hasLocalContent([project("mod-b", ProjectType.MOD, Provider.LOCAL)]),
    ).toBe(true);
  });
});
