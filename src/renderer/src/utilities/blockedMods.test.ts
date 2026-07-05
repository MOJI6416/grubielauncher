import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyBlockedModFilePaths,
  areBlockedModsReady,
  checkBlockedMods,
  isResolvedBlockedModFile,
  type IBlockedMod,
} from "./blockedMods";
import { ProjectType, Provider } from "@/types/ModManager";
import type { ILocalProject } from "@/types/ModManager";

function mod(files: Array<Record<string, unknown>>): ILocalProject {
  return {
    id: "curseforge-project",
    provider: Provider.CURSEFORGE,
    title: "Blocked Mod",
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    version: {
      id: "file-version",
      dependencies: [],
      files: files as any,
    },
  } as ILocalProject;
}

function blocked(fileName: string, filePath?: string): IBlockedMod {
  return {
    projectId: "curseforge-project",
    fileId: 123,
    fileName,
    filePath,
    hash: "sha1",
    url: "https://curseforge.example/file",
  };
}

function stubBlockedModsApi({
  exists = true,
  sha1 = "sha1",
  cdnUrl = null,
}: {
  exists?: boolean;
  sha1?: string;
  cdnUrl?: string | null;
} = {}) {
  vi.stubGlobal("window", {
    api: {
      fs: {
        pathExists: vi.fn().mockResolvedValue(exists),
        sha1: vi.fn().mockResolvedValue(sha1),
      },
      modManager: {
        ptToFolder: vi.fn().mockResolvedValue("mods"),
        resolveCfDownload: vi.fn().mockResolvedValue(cdnUrl),
      },
      path: {
        join: vi.fn(async (...parts: string[]) => parts.join("/")),
      },
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("blocked mods helpers", () => {
  it("stores a downloaded local path on the matching blocked file", () => {
    const mods = [
      mod([
        {
          filename: "blocked.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/file",
        },
      ]),
    ];

    const changed = applyBlockedModFilePaths(mods, [
      blocked("blocked.jar", "C:/Downloads/blocked.jar"),
    ]);

    expect(changed).toBe(true);
    expect(mods[0].version?.files[0].localPath).toBe(
      "C:/Downloads/blocked.jar",
    );
  });

  it("does not overwrite when the blocked mod has no selected file", () => {
    const mods = [
      mod([
        {
          filename: "blocked.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/file",
        },
      ]),
    ];

    const changed = applyBlockedModFilePaths(mods, [blocked("blocked.jar")]);

    expect(changed).toBe(false);
    expect(mods[0].version?.files[0].localPath).toBeUndefined();
  });

  it("treats resolved, skipped and substituted mods as ready", () => {
    expect(areBlockedModsReady([blocked("one.jar", "C:/one.jar")])).toBe(true);
    expect(
      areBlockedModsReady([
        blocked("one.jar", "C:/one.jar"),
        blocked("two.jar"),
      ]),
    ).toBe(false);
    expect(areBlockedModsReady([])).toBe(false);
    expect(
      areBlockedModsReady([{ ...blocked("two.jar"), skipped: true }]),
    ).toBe(true);
    expect(
      areBlockedModsReady([{ ...blocked("two.jar"), substituted: true }]),
    ).toBe(true);
  });

  it("falls back to the only blocked file when CurseForge filename changed", () => {
    const mods = [
      mod([
        {
          filename: "actual-name.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/file",
        },
      ]),
    ];

    const changed = applyBlockedModFilePaths(mods, [
      blocked("renamed-by-browser.jar", "C:/Downloads/actual-name.jar"),
    ]);

    expect(changed).toBe(true);
    expect(mods[0].version?.files[0].localPath).toBe(
      "C:/Downloads/actual-name.jar",
    );
  });

  it("ignores non-blocked files", () => {
    const mods = [
      mod([
        {
          filename: "normal.jar",
          sha1: "sha1",
          url: "https://cdn.example/normal.jar",
        },
      ]),
    ];

    const changed = applyBlockedModFilePaths(mods, [
      blocked("normal.jar", "C:/Downloads/normal.jar"),
    ]);

    expect(changed).toBe(false);
    expect(mods[0].version?.files[0].localPath).toBeUndefined();
  });

  it("treats blocked files with a matching localPath as resolved", () => {
    expect(
      isResolvedBlockedModFile(
        {
          filename: "blocked.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/file",
          localPath: "C:/Downloads/blocked.jar",
        } as any,
        true,
        "sha1",
      ),
    ).toBe(true);
  });

  it("keeps blocked files unresolved when localPath is missing or hash mismatches", () => {
    const file = {
      filename: "blocked.jar",
      sha1: "sha1",
      url: "blocked::https://curseforge.example/file",
    } as any;

    expect(isResolvedBlockedModFile(file, true, "sha1")).toBe(false);
    expect(
      isResolvedBlockedModFile(
        { ...file, localPath: "C:/Downloads/blocked.jar" },
        false,
        "sha1",
      ),
    ).toBe(false);
    expect(
      isResolvedBlockedModFile(
        { ...file, localPath: "C:/Downloads/blocked.jar" },
        true,
        "other-sha1",
      ),
    ).toBe(false);
  });

  it("does not return blocked mods when selected localPath exists and sha1 matches", async () => {
    stubBlockedModsApi({ exists: true, sha1: "sha1" });
    const mods = [
      mod([
        {
          filename: "blocked.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/mod/download/555",
          localPath: "C:/Downloads/blocked.jar",
        },
      ]),
    ];

    await expect(checkBlockedMods(mods)).resolves.toEqual([]);
  });

  it("returns blocked mods with a parsed fileId when CDN cannot resolve", async () => {
    stubBlockedModsApi({ exists: false, cdnUrl: null });
    const mods = [
      mod([
        {
          filename: "blocked.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/mod/download/555",
          localPath: "C:/Downloads/blocked.jar",
        },
      ]),
    ];

    await expect(checkBlockedMods(mods)).resolves.toEqual([
      {
        fileName: "blocked.jar",
        hash: "sha1",
        projectId: "curseforge-project",
        url: "https://curseforge.example/mod/download/555",
        fileId: 555,
        modTitle: "Blocked Mod",
      },
    ]);
  });

  it("auto-resolves a blocked file via the CurseForge CDN and rewrites its url", async () => {
    const cdnUrl = "https://edge.forgecdn.net/files/8273/779/mod.jar";
    stubBlockedModsApi({ exists: false, cdnUrl });
    const mods = [
      mod([
        {
          filename: "mod.jar",
          sha1: "sha1",
          url: "blocked::https://curseforge.example/mod/download/8273779",
        },
      ]),
    ];

    await expect(checkBlockedMods(mods)).resolves.toEqual([]);
    expect(mods[0].version?.files[0].url).toBe(cdnUrl);
  });
});
