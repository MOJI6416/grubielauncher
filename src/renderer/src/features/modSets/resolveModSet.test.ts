import { beforeEach, describe, expect, it, vi } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";

const analyzePort = vi.fn();

vi.stubGlobal("window", { api: {} });

vi.mock("@renderer/features/port/analyzePort", () => ({
  analyzePort: (...args: unknown[]) => analyzePort(...args),
}));

const { resolveModSet } = await import("./resolveModSet");

const installed: ILocalProject = {
  title: "Sodium",
  description: "",
  projectType: ProjectType.MOD,
  iconUrl: null,
  url: "",
  provider: Provider.CURSEFORGE,
  id: "394468",
  version: null,
};

const set = {
  id: "s",
  name: "Performance",
  createdAt: "",
  updatedAt: "",
  items: [
    {
      provider: Provider.MODRINTH,
      id: "AANobbMI",
      projectType: ProjectType.MOD,
      title: "Sodium",
      iconUrl: null,
      url: "",
    },
    {
      provider: Provider.MODRINTH,
      id: "gvQqBUqZ",
      projectType: ProjectType.MOD,
      title: "Lithium",
      iconUrl: null,
      url: "",
    },
  ] as const,
};

beforeEach(() => {
  analyzePort.mockReset();
});

describe("resolveModSet", () => {
  it("checks only what the instance does not have yet", async () => {
    analyzePort.mockResolvedValue([
      { key: "modrinth:gvQqBUqZ", title: "Lithium", projectType: ProjectType.MOD, status: "updated" },
    ]);

    const items = await resolveModSet(
      { ...set, items: [...set.items] },
      { minecraftVersion: "1.21.1", loader: "fabric" },
      [installed],
    );

    expect(analyzePort).toHaveBeenCalledTimes(1);
    const [path, wanted, target, options] = analyzePort.mock.calls[0];
    expect(path).toBe("");
    expect(wanted.map((project: ILocalProject) => project.id)).toEqual(["gvQqBUqZ"]);
    expect(target).toEqual({ minecraftVersion: "1.21.1", loader: "fabric" });
    expect(options).toEqual({ includeWorlds: false, installed: [installed] });
    expect(items.map((item) => [item.title, item.status])).toEqual([
      ["Lithium", "updated"],
      ["Sodium", "installed"],
    ]);
  });

  it("does not ask the catalog when everything is already installed", async () => {
    const items = await resolveModSet(
      { ...set, items: [set.items[0]] },
      { minecraftVersion: "1.21.1", loader: "fabric" },
      [installed],
    );

    expect(analyzePort).not.toHaveBeenCalled();
    expect(items.map((item) => item.status)).toEqual(["installed"]);
  });
});
