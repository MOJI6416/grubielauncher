import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.TEMP || "/tmp", getVersion: () => "0.0.0" },
}));

vi.mock("./CurseForge", () => ({
  CurseForge: { getMods: vi.fn() },
}));

vi.mock("./Modrinth", () => ({
  Modrinth: { getProjects: vi.fn() },
}));

import { CurseForge } from "./CurseForge";
import { Modrinth } from "./Modrinth";
import { ModManager } from "./ModManager";

const mockedCurseForge = vi.mocked(CurseForge);
const mockedModrinth = vi.mocked(Modrinth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModManager.projectCategories", () => {
  it("answers for every asked project, by id or slug", async () => {
    mockedModrinth.getProjects.mockResolvedValue([
      { id: "AANobbMI", slug: "sodium", categories: ["optimization"] },
      { id: "P7dR8mSH", slug: "fabric-api", categories: ["library"] },
    ] as never);
    mockedCurseForge.getMods.mockResolvedValue([
      {
        id: 238222,
        categories: [
          { id: 423, parentCategoryId: 6 },
          { id: 421, parentCategoryId: 6 },
        ],
      },
    ] as never);

    const result = await ModManager.projectCategories(
      ["AANobbMI", "fabric-api", "gone"],
      ["238222", "999", "not-a-number"],
    );

    expect(result).toEqual({
      "modrinth:AANobbMI": ["optimization"],
      "modrinth:fabric-api": ["library"],
      "modrinth:gone": [],
      "curseforge:238222": ["utility", "library"],
      "curseforge:999": [],
    });
    expect(mockedCurseForge.getMods).toHaveBeenCalledWith([238222, 999]);
  });

  it("leaves a failed provider out so it is asked again later", async () => {
    mockedModrinth.getProjects.mockResolvedValue(null);
    mockedCurseForge.getMods.mockResolvedValue(null);

    expect(await ModManager.projectCategories(["AANobbMI"], ["238222"])).toEqual(
      {},
    );
  });
});
