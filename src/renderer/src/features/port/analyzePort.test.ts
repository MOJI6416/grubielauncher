import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DependencyType,
  ILocalProject,
  IProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import type { IUpdateCheckRequest, IUpdateVerdict } from "@/types/Updates";

const checkUpdates = vi.fn();
const getDependencies = vi.fn();
const projectCategories = vi.fn();
const resolveInstallPlan = vi.fn();

vi.stubGlobal("window", {
  api: {
    backend: { checkUpdates },
    modManager: { getDependencies, projectCategories },
    path: { join: (...parts: string[]) => parts.join("/") },
    fs: { pathExists: async () => false },
  },
});

vi.mock("@renderer/features/mods/modFiles", () => ({
  listModFiles: async () => new Set<string>(),
  folderNameForType: async () => "mods",
}));

vi.mock("@renderer/utilities/installPlan", () => ({
  resolveInstallPlan: (...args: unknown[]) => resolveInstallPlan(...args),
}));

const { analyzePort, PORT_CHECK_FAILED } = await import("./analyzePort");

function mod(id: string, provider = Provider.MODRINTH): ILocalProject {
  return {
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: `${id}-old`,
      files: [{ filename: `${id}.jar`, size: 1, sha1: "", url: "https://cdn/x", isServer: false }],
      dependencies: [],
    },
  };
}

function verdict(
  id: string,
  status: IUpdateVerdict["status"],
  dependencies: string[] = [],
  provider: IUpdateVerdict["provider"] = Provider.MODRINTH,
): IUpdateVerdict {
  return {
    provider,
    id,
    status,
    ...(status === "update"
      ? {
          latest: {
            id: `${id}-new`,
            name: id,
            downloads: 0,
            files: [{ filename: `${id}-new.jar`, size: 1, sha1: "", url: "https://cdn/y", isServer: false }],
            dependencies: dependencies.map((projectId) => ({
              projectId,
              versionId: null,
              relationType: DependencyType.REQUIRED,
            })),
          },
        }
      : {}),
  };
}

const project = (id: string): IProject => ({
  id,
  title: id,
  description: "",
  projectType: ProjectType.MOD,
  iconUrl: null,
  versions: [],
  provider: Provider.CURSEFORGE,
  url: "",
  gallery: [],
  body: "",
});

beforeEach(() => {
  vi.clearAllMocks();
  projectCategories.mockResolvedValue({});
});

describe("analyzePort", () => {
  it("falls back to Fabric for Quilt, for mods and for their new dependencies", async () => {
    checkUpdates.mockImplementation(async (request: IUpdateCheckRequest) => ({
      generatedAt: "",
      items:
        request.loader === "quilt"
          ? [verdict("238222", "unavailable", [], Provider.CURSEFORGE)]
          : [verdict("238222", "update", ["1689768"], Provider.CURSEFORGE)],
    }));
    getDependencies.mockResolvedValue([
      {
        projectId: "1689768",
        versionId: null,
        relationType: DependencyType.REQUIRED,
        project: project("1689768"),
      },
    ]);
    resolveInstallPlan.mockImplementation(async ({ resolveLoader }) =>
      resolveLoader(ProjectType.MOD) === "quilt"
        ? { added: [], rootMissingVersion: true, dependenciesUnavailable: false }
        : {
            added: [{ ...mod("1689768", Provider.CURSEFORGE), title: "MezzConfig" }],
            rootMissingVersion: false,
            dependenciesUnavailable: false,
          },
    );

    const items = await analyzePort(
      "C:/old",
      [mod("238222", Provider.CURSEFORGE)],
      { minecraftVersion: "1.21.1", loader: "quilt" },
      { includeWorlds: false },
    );

    expect(items.map((item) => [item.title, item.status, item.viaLoader])).toEqual([
      ["238222", "updated", "fabric"],
      ["MezzConfig", "added", "fabric"],
    ]);
    expect(items[1].project?.loader).toBe("fabric");
  });

  it("asks again about what the first answer left unchecked", async () => {
    checkUpdates
      .mockResolvedValueOnce({ generatedAt: "", items: [verdict("sodium", "unknown")] })
      .mockResolvedValueOnce({ generatedAt: "", items: [verdict("sodium", "update")] });

    const items = await analyzePort(
      "C:/old",
      [mod("sodium")],
      { minecraftVersion: "1.21.1", loader: "fabric" },
      { includeWorlds: false },
    );

    expect(checkUpdates).toHaveBeenCalledTimes(2);
    expect(items[0].status).toBe("updated");
  });

  it("refuses to plan when nothing could be checked", async () => {
    checkUpdates.mockResolvedValue(null);

    await expect(
      analyzePort(
        "C:/old",
        [mod("sodium")],
        { minecraftVersion: "1.21.1", loader: "fabric" },
        { includeWorlds: false },
      ),
    ).rejects.toThrow(PORT_CHECK_FAILED);
  });
});
