import { describe, expect, it } from "vitest";

import {
  applyDisabledState,
  buildLibraryEntries,
  canToggleType,
  entryKey,
  fromCatalogProject,
  getModSide,
  hasMorePages,
  isMarkedDisabled,
  mergeCatalogPages,
  totalSize,
  withInstalled,
} from "./entries";
import { ILocalFile, ILocalProject, IProject, ProjectType, Provider } from "@/types/ModManager";

function file(overrides: Partial<ILocalFile> = {}): ILocalFile {
  return {
    filename: "mod.jar",
    size: 100,
    sha1: "sha",
    url: "https://example.test/mod.jar",
    isServer: true,
    isClient: true,
    ...overrides,
  };
}

function localMod(overrides: Partial<ILocalProject> = {}): ILocalProject {
  return {
    id: "id",
    provider: Provider.MODRINTH,
    title: "Title",
    description: "desc",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: { id: "v1", dependencies: [], files: [file()] },
    ...overrides,
  };
}

function project(overrides: Partial<IProject> = {}): IProject {
  return {
    id: "p1",
    provider: Provider.CURSEFORGE,
    title: "Project",
    description: "desc",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    versions: [],
    gallery: [],
    body: "",
    ...overrides,
  };
}

describe("getModSide", () => {
  it("treats missing files as both", () => {
    expect(getModSide(undefined)).toBe("both");
    expect(getModSide([])).toBe("both");
  });

  it("detects client-only", () => {
    expect(getModSide([file({ isClient: true, isServer: false })])).toBe("client");
  });

  it("detects server-only", () => {
    expect(getModSide([file({ isClient: false, isServer: true })])).toBe("server");
  });

  it("treats undefined isClient as client", () => {
    expect(getModSide([file({ isClient: undefined, isServer: false })])).toBe(
      "client",
    );
  });

  it("detects both", () => {
    expect(getModSide([file({ isClient: true, isServer: true })])).toBe("both");
  });
});

describe("totalSize", () => {
  it("sums file sizes and tolerates garbage", () => {
    expect(totalSize([file({ size: 10 }), file({ size: 5 })])).toBe(15);
    expect(totalSize([file({ size: Number.NaN })])).toBe(0);
    expect(totalSize(undefined)).toBe(0);
  });
});

describe("applyDisabledState", () => {
  it("returns the same array when not disabling", () => {
    const files = [file()];
    expect(applyDisabledState(files, false)).toBe(files);
  });

  it("marks every file disabled", () => {
    const result = applyDisabledState([file(), file()], true);
    expect(result.every((item) => item.disabled === true)).toBe(true);
  });
});

describe("isMarkedDisabled", () => {
  it("detects a disabled file", () => {
    expect(isMarkedDisabled(localMod())).toBe(false);
    expect(
      isMarkedDisabled(
        localMod({ version: { id: "v", dependencies: [], files: [file({ disabled: true })] } }),
      ),
    ).toBe(true);
  });
});

describe("canToggleType", () => {
  it("blocks worlds and datapacks", () => {
    expect(canToggleType(ProjectType.MOD)).toBe(true);
    expect(canToggleType(ProjectType.WORLD)).toBe(false);
    expect(canToggleType(ProjectType.DATAPACK)).toBe(false);
  });
});

describe("buildLibraryEntries", () => {
  it("keeps only the requested project type", () => {
    const entries = buildLibraryEntries(
      [
        localMod({ id: "a" }),
        localMod({ id: "b", projectType: ProjectType.SHADER }),
      ],
      [],
      ProjectType.MOD,
    );

    expect(entries.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("appends pending removed projects and marks them", () => {
    const entries = buildLibraryEntries(
      [localMod({ id: "a" })],
      [localMod({ id: "z" })],
      ProjectType.MOD,
    );

    expect(entries.map((entry) => entry.id)).toEqual(["a", "z"]);
    expect(entries[1].pendingRemoved).toBe(true);
  });

  it("does not duplicate a pending project that is installed again", () => {
    const entries = buildLibraryEntries(
      [localMod({ id: "a" })],
      [localMod({ id: "a" })],
      ProjectType.MOD,
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].pendingRemoved).toBe(false);
  });

  it("drops duplicates inside the installed list", () => {
    const entries = buildLibraryEntries(
      [localMod({ id: "a" }), localMod({ id: "a" })],
      [],
      ProjectType.MOD,
    );

    expect(entries).toHaveLength(1);
  });
});

describe("fromCatalogProject", () => {
  it("carries installed state and stats", () => {
    const entry = fromCatalogProject(
      project({ stats: { downloads: 5 } }),
      localMod({ id: "p1", provider: Provider.CURSEFORGE }),
    );

    expect(entry.key).toBe(entryKey(Provider.CURSEFORGE, "p1"));
    expect(entry.installed).not.toBeNull();
    expect(entry.stats?.downloads).toBe(5);
    expect(entry.fileName).toBe("mod.jar");
  });

  it("works without an installed match", () => {
    const entry = fromCatalogProject(project(), null);
    expect(entry.installed).toBeNull();
    expect(entry.side).toBe("both");
    expect(entry.size).toBe(0);
  });
});

describe("withInstalled", () => {
  it("keeps the same object when nothing changed", () => {
    const entry = fromCatalogProject(project(), null);
    expect(withInstalled(entry, null, false)).toBe(entry);
  });

  it("adopts a freshly installed project", () => {
    const entry = fromCatalogProject(project(), null);
    const installed = localMod({
      id: "p1",
      provider: Provider.CURSEFORGE,
      version: {
        id: "v9",
        dependencies: [],
        files: [file({ filename: "new.jar", size: 42, isServer: false })],
      },
    });

    const next = withInstalled(entry, installed);

    expect(next).not.toBe(entry);
    expect(next.installed).toBe(installed);
    expect(next.fileName).toBe("new.jar");
    expect(next.size).toBe(42);
    expect(next.side).toBe("client");
    expect(next.markedDisabled).toBe(false);
  });

  it("drops installed data when the project is gone", () => {
    const entry = fromCatalogProject(
      project(),
      localMod({ id: "p1", provider: Provider.CURSEFORGE }),
    );

    const next = withInstalled(entry, null);

    expect(next.installed).toBeNull();
    expect(next.size).toBe(0);
    expect(next.markedDisabled).toBe(false);
  });

  it("carries the pending removal flag", () => {
    const installed = localMod({ id: "p1", provider: Provider.CURSEFORGE });
    const entry = fromCatalogProject(project(), installed);

    expect(withInstalled(entry, installed, true).pendingRemoved).toBe(true);
  });
});

describe("mergeCatalogPages", () => {
  it("appends new items and drops repeats", () => {
    const merged = mergeCatalogPages(
      [project({ id: "1" }), project({ id: "2" })],
      [project({ id: "2" }), project({ id: "3" })],
    );

    expect(merged.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("keeps items with the same id from another provider", () => {
    const merged = mergeCatalogPages(
      [project({ id: "1", provider: Provider.CURSEFORGE })],
      [project({ id: "1", provider: Provider.MODRINTH })],
    );

    expect(merged).toHaveLength(2);
  });
});

describe("hasMorePages", () => {
  it("reports remaining pages", () => {
    expect(hasMorePages(20, 100)).toBe(true);
    expect(hasMorePages(100, 100)).toBe(false);
    expect(hasMorePages(0, 100)).toBe(false);
    expect(hasMorePages(20, 0)).toBe(false);
    expect(hasMorePages(20, undefined)).toBe(false);
  });
});
