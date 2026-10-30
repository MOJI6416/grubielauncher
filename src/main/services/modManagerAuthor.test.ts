import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectType, Provider } from "@/types/ModManager";

vi.mock("electron", () => ({
  app: { getPath: () => process.env.TEMP || "/tmp", getVersion: () => "0.0.0" },
}));

vi.mock("./CurseForge", () => ({
  CurseForge: { search: vi.fn() },
}));

vi.mock("./Modrinth", () => ({
  Modrinth: { search: vi.fn(), get: vi.fn(), getAuthor: vi.fn() },
}));

import { CurseForge } from "./CurseForge";
import { Modrinth } from "./Modrinth";
import { ModManager } from "./ModManager";

const mockedCurseForge = vi.mocked(CurseForge);
const mockedModrinth = vi.mocked(Modrinth);

const options = (author?: string) => ({
  version: "1.21.1",
  loader: "fabric" as const,
  projectType: ProjectType.MOD,
  sort: "",
  filter: [],
  author,
});

const page = { offset: 0, limit: 20 };

beforeEach(() => {
  vi.clearAllMocks();
  mockedCurseForge.search.mockResolvedValue({
    data: [],
    pagination: { index: 0, pageSize: 20, resultCount: 0, totalCount: 0 },
  } as never);
  mockedModrinth.search.mockResolvedValue({
    hits: [],
    offset: 0,
    limit: 20,
    total_hits: 0,
  });
});

describe("ModManager.search author filter", () => {
  it("hands the Modrinth username to the search facets", async () => {
    await ModManager.search("", Provider.MODRINTH, options(" jellysquid3 "), page);

    expect(mockedModrinth.search.mock.calls[0][1].author).toBe("jellysquid3");
  });

  it("hands CurseForge only a numeric author id", async () => {
    await ModManager.search("", Provider.CURSEFORGE, options("17072"), page);
    await ModManager.search("", Provider.CURSEFORGE, options("mezz"), page);

    expect(mockedCurseForge.search.mock.calls[0][1].authorId).toBe("17072");
    expect(mockedCurseForge.search.mock.calls[1][1].authorId).toBeUndefined();
  });

  it("searches without an author when none is given", async () => {
    await ModManager.search("", Provider.MODRINTH, options(), page);

    expect(mockedModrinth.search.mock.calls[0][1].author).toBeUndefined();
  });
});

describe("ModManager.getProject author", () => {
  const project = {
    id: "AANobbMI",
    slug: "sodium",
    project_type: "mod",
    title: "Sodium",
  };

  it("adds the Modrinth author the search index knows", async () => {
    mockedModrinth.get.mockResolvedValue(project as never);
    mockedModrinth.getAuthor.mockResolvedValue("jellysquid3");

    const result = await ModManager.getProject(Provider.MODRINTH, "AANobbMI");

    expect(result?.author).toEqual({ id: "jellysquid3", name: "jellysquid3" });
  });

  it("still returns the project when the author lookup fails", async () => {
    mockedModrinth.get.mockResolvedValue(project as never);
    mockedModrinth.getAuthor.mockResolvedValue(null);

    const result = await ModManager.getProject(Provider.MODRINTH, "AANobbMI");

    expect(result?.title).toBe("Sodium");
    expect(result && "author" in result).toBe(false);
  });
});
