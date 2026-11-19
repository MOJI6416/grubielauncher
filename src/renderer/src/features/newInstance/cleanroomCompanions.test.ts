import { afterEach, describe, expect, it, vi } from "vitest";
import type { Loader } from "@/types/Loader";
import {
  type ILocalProject,
  type IProject,
  type IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";

function project(provider: Provider, id: string, title: string): IProject {
  return {
    id,
    title,
    description: `${title} description`,
    projectType: ProjectType.MOD,
    iconUrl: `https://icons/${id}.png`,
    versions: [],
    provider,
    url: `https://example/${id}`,
    gallery: [],
    body: "",
  };
}

function version(
  id: string,
  filename: string,
  overrides: Partial<ModVersion> = {},
  url = `https://cdn.example/${encodeURIComponent(filename)}`,
): ModVersion {
  return {
    id,
    name: filename,
    dependencies: [],
    downloads: 0,
    releaseType: "release",
    files: [{ filename, size: 10, sha1: `sha-${id}`, url, isServer: true }],
    ...overrides,
  };
}

const FUGUE = project(Provider.MODRINTH, "vylTACsh", "Fugue");
const SCALAR_LEGACY = project(Provider.CURSEFORGE, "1235372", "Scalar Legacy");

const FUGUE_VERSIONS = [
  version("fugue-beta", "+Fugue-0.26.0-beta.jar", { releaseType: "beta" }),
  version("fugue-0.25.5", "+Fugue-0.25.5.jar"),
  version("fugue-0.25.4", "+Fugue-0.25.4.jar"),
];

const SCALAR_VERSIONS = [
  version(
    "6842491",
    "Scalar Legacy-1.0.1.jar",
    {},
    "https://edge.forgecdn.net/files/6842/491/Scalar%20Legacy-1.0.1.jar",
  ),
  version("6384100", "scalar-1.0.0.jar"),
];

function installed(
  provider: Provider,
  id: string,
  title: string,
): ILocalProject {
  return {
    title,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider,
    id,
    version: {
      id: `${id}-v`,
      files: [
        {
          filename: `${id}.jar`,
          size: 1,
          sha1: `own-${id}`,
          url: "",
          isServer: true,
        },
      ],
      dependencies: [],
    },
  };
}

function stubApi(
  overrides: {
    getVersions?: (provider: Provider, id: string) => Promise<ModVersion[]>;
  } = {},
) {
  const api = {
    modManager: {
      getProject: vi.fn(async (provider: Provider, id: string) =>
        provider === Provider.MODRINTH && id === FUGUE.id
          ? FUGUE
          : provider === Provider.CURSEFORGE && id === SCALAR_LEGACY.id
            ? SCALAR_LEGACY
            : null,
      ),
      getVersions: vi.fn(
        overrides.getVersions ??
          (async (provider: Provider, id: string) =>
            provider === Provider.MODRINTH && id === FUGUE.id
              ? FUGUE_VERSIONS
              : provider === Provider.CURSEFORGE && id === SCALAR_LEGACY.id
                ? SCALAR_VERSIONS
                : []),
      ),
    },
  };
  vi.stubGlobal("window", { api });
  return api;
}

async function load() {
  vi.resetModules();
  return await import("./cleanroomCompanions");
}

function request(
  loader: Loader,
  mods: ILocalProject[] = [],
  pack: unknown = null,
) {
  return { loader, pack, mods, minecraftVersion: { id: "1.12.2" } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("pickCompanionVersion", () => {
  it("takes the newest release with a single downloadable jar", async () => {
    stubApi();
    const { pickCompanionVersion } = await load();

    expect(pickCompanionVersion(FUGUE_VERSIONS)?.files[0].filename).toBe(
      "+Fugue-0.25.5.jar",
    );
    expect(pickCompanionVersion(SCALAR_VERSIONS)?.files[0].filename).toBe(
      "Scalar Legacy-1.0.1.jar",
    );
  });

  it("skips blocked, multi-file and non-jar versions", async () => {
    stubApi();
    const { pickCompanionVersion } = await load();

    const multi = version("multi", "+Fugue-1.jar");
    multi.files.push({ ...multi.files[0], filename: "+Fugue-1-sources.jar" });

    expect(
      pickCompanionVersion([
        version("blocked", "a.jar", {}, "blocked::https://example/download/1"),
        multi,
        version("zip", "a.zip"),
        version("ok", "b.jar"),
      ])?.id,
    ).toBe("ok");
    expect(
      pickCompanionVersion([version("empty", "a.jar", { files: [] })]),
    ).toBe(null);
  });
});

describe("withCleanroomCompanions", () => {
  it("adds Fugue and Scalar Legacy to a new Cleanroom instance", async () => {
    const api = stubApi();
    const { withCleanroomCompanions } = await load();
    const own = installed(Provider.MODRINTH, "jei", "JEI");

    const mods = await withCleanroomCompanions(request("cleanroom", [own]));

    expect(mods[0]).toBe(own);
    expect(
      mods.slice(1).map((mod) => ({
        provider: mod.provider,
        id: mod.id,
        title: mod.title,
        files: mod.version?.files.map((file) => file.filename),
      })),
    ).toEqual([
      {
        provider: Provider.MODRINTH,
        id: "vylTACsh",
        title: "Fugue",
        files: ["+Fugue-0.25.5.jar"],
      },
      {
        provider: Provider.CURSEFORGE,
        id: "1235372",
        title: "Scalar Legacy",
        files: ["Scalar Legacy-1.0.1.jar"],
      },
    ]);
    expect(mods[2].version?.files[0].url).toBe(
      "https://edge.forgecdn.net/files/6842/491/Scalar%20Legacy-1.0.1.jar",
    );
    expect(api.modManager.getVersions).toHaveBeenCalledWith(
      Provider.MODRINTH,
      "vylTACsh",
      expect.objectContaining({
        loader: "cleanroom",
        version: "1.12.2",
        projectType: ProjectType.MOD,
      }),
    );
    expect(api.modManager.getVersions).toHaveBeenCalledWith(
      Provider.CURSEFORGE,
      "1235372",
      expect.objectContaining({ loader: "cleanroom", version: "1.12.2" }),
    );
  });

  it("leaves other loaders and modpacks alone", async () => {
    const api = stubApi();
    const { withCleanroomCompanions } = await load();
    const mods = [installed(Provider.MODRINTH, "jei", "JEI")];

    for (const loader of ["forge", "fabric", "vanilla"] as const) {
      expect(await withCleanroomCompanions(request(loader, mods))).toBe(mods);
    }
    expect(
      await withCleanroomCompanions(
        request("cleanroom", mods, { kind: "modpack" }),
      ),
    ).toBe(mods);
    expect(api.modManager.getProject).not.toHaveBeenCalled();
    expect(api.modManager.getVersions).not.toHaveBeenCalled();
  });

  it("does not add a second Fugue or Scalar the player already picked", async () => {
    const api = stubApi();
    const { withCleanroomCompanions } = await load();
    const scala3 = installed(Provider.CURSEFORGE, "1012168", "Scalar");
    const fugue = installed(Provider.CURSEFORGE, "1005815", "Fugue");

    const mods = await withCleanroomCompanions(
      request("cleanroom", [scala3, fugue]),
    );

    expect(mods).toEqual([scala3, fugue]);
    expect(api.modManager.getVersions).not.toHaveBeenCalled();
  });

  it("creates the instance without a companion that cannot be resolved", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubApi({
      getVersions: async (provider) => {
        if (provider === Provider.CURSEFORGE) throw new Error("offline");
        return FUGUE_VERSIONS;
      },
    });
    const { withCleanroomCompanions } = await load();

    const mods = await withCleanroomCompanions(request("cleanroom"));

    expect(mods.map((mod) => mod.id)).toEqual(["vylTACsh"]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("curseforge:1235372"),
      expect.any(Error),
    );
  });
});
