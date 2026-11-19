import { describe, expect, it, vi } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => process.env.TEMP || "C:\\Temp") },
}));

import { curseForgeEntries, overrideContentEntries } from "./modpackContents";

describe("curseForgeEntries", () => {
  it("names every manifest project and marks the optional ones", () => {
    const entries = curseForgeEntries(
      {
        files: [
          { projectID: 10, fileID: 1, required: true },
          { projectID: 11, fileID: 2, required: false },
          { projectID: 10, fileID: 3, required: true },
          { projectID: 12, fileID: 4, required: true },
        ],
      },
      [
        { id: 10, name: "JEI", classId: 6, logo: { url: "https://cdn/jei.png" } },
        { id: 11, name: "Shaders", classId: 6552, logo: null },
      ],
    );

    expect(entries).toEqual([
      {
        key: "curseforge:10",
        title: "JEI",
        iconUrl: "https://cdn/jei.png",
        provider: Provider.CURSEFORGE,
        projectType: ProjectType.MOD,
      },
      {
        key: "curseforge:11",
        title: "Shaders",
        iconUrl: null,
        provider: Provider.CURSEFORGE,
        projectType: ProjectType.SHADER,
        optional: true,
      },
      {
        key: "curseforge:12",
        title: "#12",
        iconUrl: null,
        provider: Provider.CURSEFORGE,
        projectType: ProjectType.MOD,
      },
    ]);
  });
});

describe("overrideContentEntries", () => {
  it("lists jars and packs the archive ships in its overrides", () => {
    const entries = overrideContentEntries([
      { name: "overrides/mods/server-utils.jar" },
      { name: "overrides/mods/readme.txt" },
      { name: "overrides/mods/" },
      { name: "client-overrides/resourcepacks/Faithful.zip" },
      { name: "overrides/config/server-utils.toml" },
      { name: "overrides/mods/nested/inner.jar" },
      { name: "manifest.json" },
    ]);

    expect(entries.map((entry) => [entry.title, entry.projectType])).toEqual([
      ["server-utils.jar", ProjectType.MOD],
      ["Faithful.zip", ProjectType.RESOURCEPACK],
    ]);
    expect(entries.every((entry) => entry.provider === Provider.LOCAL)).toBe(true);
  });
});
