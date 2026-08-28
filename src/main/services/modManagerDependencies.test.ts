import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DependencyType,
  IVersionDependency,
  Provider,
} from "@/types/ModManager";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.TEMP || "/tmp", getVersion: () => "0.0.0" },
}));

vi.mock("./CurseForge", () => ({
  CurseForge: { getMods: vi.fn() },
}));

vi.mock("./Modrinth", () => ({
  Modrinth: { getDependencies: vi.fn() },
}));

import { CurseForge } from "./CurseForge";
import { Modrinth } from "./Modrinth";
import { ModManager } from "./ModManager";

const mockedCurseForge = vi.mocked(CurseForge);
const mockedModrinth = vi.mocked(Modrinth);

const deps: IVersionDependency[] = [
  {
    projectId: "100",
    versionId: "200",
    relationType: DependencyType.REQUIRED,
    project: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModManager.getDependencies", () => {
  it("reports a CurseForge outage instead of an empty dependency list", async () => {
    mockedCurseForge.getMods.mockResolvedValue(null);

    expect(
      await ModManager.getDependencies(Provider.CURSEFORGE, "1", deps),
    ).toBeNull();
  });

  it("reports a Modrinth outage instead of an empty dependency list", async () => {
    mockedModrinth.getDependencies.mockResolvedValue(null);

    expect(
      await ModManager.getDependencies(Provider.MODRINTH, "1", deps),
    ).toBeNull();
  });

  it("still returns an empty list when the provider knows nothing about the ids", async () => {
    mockedCurseForge.getMods.mockResolvedValue([]);

    expect(
      await ModManager.getDependencies(Provider.CURSEFORGE, "1", deps),
    ).toEqual([]);
  });
});
