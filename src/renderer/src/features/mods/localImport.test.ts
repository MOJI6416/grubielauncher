import { describe, expect, it } from "vitest";
import {
  ILocalFileInfo,
  ILocalProject,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import {
  buildImportEntry,
  buildInvalidEntry,
  findForeignFiles,
  isImportableFileName,
  mapWithConcurrency,
  splitDisabledName,
  withEnabledFiles,
} from "./localImport";

function info(overrides: Partial<ILocalFileInfo> = {}): ILocalFileInfo {
  return {
    kind: ProjectType.MOD,
    name: "Sodium",
    version: "0.6.0",
    description: "Fast",
    url: "",
    filename: "sodium.jar",
    size: 10,
    path: "C:/mods/sodium.jar",
    id: "sodium",
    sha1: "a".repeat(40),
    icon: null,
    ...overrides,
  };
}

function installed(overrides: Partial<ILocalProject> = {}): ILocalProject {
  return {
    title: "Other",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: Provider.LOCAL,
    id: "other",
    version: {
      id: "1",
      dependencies: [],
      files: [
        {
          filename: "other.jar",
          size: 1,
          sha1: "b".repeat(40),
          url: "",
          isServer: true,
        },
      ],
    },
    ...overrides,
  };
}

const base = {
  projectType: ProjectType.MOD,
  collected: [],
  deletedAt: null,
  fileUrl: "file:///C:/mods/sodium.jar",
};

describe("isImportableFileName", () => {
  it("accepts archives and their disabled copies", () => {
    expect(isImportableFileName("a.jar")).toBe(true);
    expect(isImportableFileName("pack.zip")).toBe(true);
    expect(isImportableFileName("a.jar.disabled")).toBe(true);
    expect(isImportableFileName("A.JAR.DISABLED")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isImportableFileName("notes.txt")).toBe(false);
    expect(isImportableFileName("config.disabled")).toBe(false);
  });
});

describe("splitDisabledName", () => {
  it("strips the suffix and remembers it", () => {
    expect(splitDisabledName("a.jar.disabled")).toEqual({
      fileName: "a.jar",
      disabled: true,
    });
    expect(splitDisabledName("a.jar")).toEqual({
      fileName: "a.jar",
      disabled: false,
    });
  });
});

describe("buildImportEntry", () => {
  it("imports a disabled file under its jar name and keeps it disabled", () => {
    const entry = buildImportEntry({
      ...base,
      info: info({ filename: "sodium.jar.disabled" }),
      displayName: "sodium.jar.disabled",
      installed: [],
    });

    expect(entry.status).toBe("valid");
    expect(entry.fileName).toBe("sodium.jar");
    expect(entry.disabled).toBe(true);
    expect(entry.project.versions[0].files[0]).toMatchObject({
      filename: "sodium.jar",
      disabled: true,
      url: base.fileUrl,
    });
  });

  it("uses the file name when the metadata has no name", () => {
    const entry = buildImportEntry({
      ...base,
      info: info({ name: "", filename: "nameless.jar" }),
      displayName: "nameless.jar",
      installed: [],
    });

    expect(entry.project.title).toBe("nameless.jar");
  });

  it("flags duplicates of installed mods without crashing on broken titles", () => {
    const entry = buildImportEntry({
      ...base,
      info: info({ sha1: "b".repeat(40) }),
      displayName: "sodium.jar",
      installed: [installed({ title: undefined as unknown as string })],
    });

    expect(entry.status).toBe("duplicate");
  });

  it("flags a second copy inside the same import", () => {
    const first = buildImportEntry({
      ...base,
      info: info(),
      displayName: "sodium.jar",
      installed: [],
    });
    const second = buildImportEntry({
      ...base,
      info: info({ filename: "sodium-copy.jar" }),
      displayName: "sodium-copy.jar",
      installed: [],
      collected: [first],
    });

    expect(second.status).toBe("duplicate");
  });
});

describe("buildInvalidEntry", () => {
  it("shows the jar name for an unreadable disabled file", () => {
    const entry = buildInvalidEntry({
      displayName: "broken.jar.disabled",
      projectType: ProjectType.MOD,
      deletedAt: null,
    });

    expect(entry.status).toBe("invalid");
    expect(entry.fileName).toBe("broken.jar");
  });
});

describe("withEnabledFiles", () => {
  it("clears the disabled mark on every file", () => {
    const entry = buildImportEntry({
      ...base,
      info: info(),
      displayName: "sodium.jar.disabled",
      installed: [],
    });

    const enabled = withEnabledFiles(entry);

    expect(enabled.disabled).toBe(false);
    expect(enabled.project.versions[0].files[0].disabled).toBe(false);
    expect(entry.project.versions[0].files[0].disabled).toBe(true);
  });
});

describe("mapWithConcurrency", () => {
  it("keeps the input order and reports progress", async () => {
    const progress: number[] = [];
    const result = await mapWithConcurrency(
      [30, 10, 20],
      2,
      async (delay) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return delay * 2;
      },
      (done) => progress.push(done),
    );

    expect(result).toEqual([60, 20, 40]);
    expect(progress).toEqual([1, 2, 3]);
  });

  it("returns an empty list for no input", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe("findForeignFiles", () => {
  const tracked = installed({
    id: "a",
    version: {
      id: "1",
      dependencies: [],
      files: [
        { filename: "a.jar", size: 1, sha1: "", url: "", isServer: true },
      ],
    },
  });

  it("lists archives that neither the instance nor the launcher placed", () => {
    expect(
      findForeignFiles({
        listing: ["a.jar", "b.jar", "manual.jar", "muted.jar.disabled", "notes.txt"],
        mods: [tracked],
        pendingRemoved: [],
        projectType: ProjectType.MOD,
        managed: ["a.jar", "b.jar"],
      }),
    ).toEqual(["manual.jar", "muted.jar.disabled"]);
  });

  it("does not count a mod waiting to be removed as foreign", () => {
    expect(
      findForeignFiles({
        listing: ["a.jar"],
        mods: [],
        pendingRemoved: [tracked],
        projectType: ProjectType.MOD,
        managed: [],
      }),
    ).toEqual([]);
  });

  it("stays quiet when nothing is known about the instance yet", () => {
    expect(
      findForeignFiles({
        listing: ["manual.jar"],
        mods: [],
        pendingRemoved: [],
        projectType: ProjectType.MOD,
        managed: null,
      }),
    ).toEqual([]);
  });
});
