import { describe, expect, it } from "vitest";
import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";
import {
  baseProjectsOf,
  isContentPath,
  isProtectedPath,
  mergeModpackMods,
  modpackMergeDiff,
  packLocalContentPaths,
  planModpackFiles,
} from "./modpackMerge";

function mod(
  id: string,
  version: string,
  options: {
    provider?: Provider;
    filename?: string;
    pinned?: boolean;
    disabled?: boolean;
  } = {},
): ILocalProject {
  return {
    id,
    title: id,
    description: "",
    projectType: ProjectType.MOD,
    iconUrl: null,
    url: "",
    provider: options.provider ?? Provider.MODRINTH,
    pinned: options.pinned,
    version: {
      id: version,
      dependencies: [],
      files: [
        {
          filename: options.filename ?? `${id}-${version}.jar`,
          size: 1,
          sha1: "",
          url: "",
          isServer: true,
          disabled: options.disabled,
        },
      ],
    },
  };
}

function ids(mods: ILocalProject[]): string[] {
  return mods.map((item) => `${item.id}@${item.version?.id}`);
}

describe("mergeModpackMods", () => {
  it("updates pack mods the player left alone", () => {
    const base = [mod("sodium", "1")];
    const result = mergeModpackMods({
      base: baseProjectsOf(base),
      current: [mod("sodium", "1")],
      next: [mod("sodium", "2")],
    });

    expect(ids(result.mods)).toEqual(["sodium@2"]);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].replacedUserVersion).toBe(false);
  });

  it("replaces a version the player changed unless the mod is pinned", () => {
    const base = baseProjectsOf([mod("a", "1"), mod("b", "1")]);
    const result = mergeModpackMods({
      base,
      current: [mod("a", "5"), mod("b", "5", { pinned: true })],
      next: [mod("a", "2"), mod("b", "2")],
    });

    expect(ids(result.mods)).toEqual(["a@2", "b@5"]);
    expect(result.updated[0].replacedUserVersion).toBe(true);
    expect(ids(result.keptPinned)).toEqual(["b@5"]);
  });

  it("does not bring back pack mods the player removed", () => {
    const base = baseProjectsOf([mod("a", "1"), mod("b", "1")]);
    const result = mergeModpackMods({
      base,
      current: [mod("a", "1")],
      next: [mod("a", "1"), mod("b", "2")],
    });

    expect(ids(result.mods)).toEqual(["a@1"]);
    expect(ids(result.removedByUser)).toEqual(["b@2"]);
    expect(result.unchanged).toBe(1);
  });

  it("returns removed mods when asked to", () => {
    const base = baseProjectsOf([mod("b", "1")]);
    const result = mergeModpackMods({
      base,
      current: [],
      next: [mod("b", "2")],
      restoreRemoved: true,
    });

    expect(ids(result.mods)).toEqual(["b@2"]);
    expect(ids(result.added)).toEqual(["b@2"]);
  });

  it("drops mods the pack removed and keeps pinned ones", () => {
    const base = baseProjectsOf([mod("a", "1"), mod("b", "1")]);
    const result = mergeModpackMods({
      base,
      current: [mod("a", "1"), mod("b", "1", { pinned: true })],
      next: [],
    });

    expect(ids(result.mods)).toEqual(["b@1"]);
    expect(ids(result.removed)).toEqual(["a@1"]);
    expect(ids(result.keptPinned)).toEqual(["b@1"]);
  });

  it("never touches the player's own mods", () => {
    const base = baseProjectsOf([mod("a", "1")]);
    const result = mergeModpackMods({
      base,
      current: [mod("a", "1"), mod("mine", "3")],
      next: [mod("a", "2")],
    });

    expect(ids(result.mods)).toEqual(["a@2", "mine@3"]);
    expect(ids(result.own)).toEqual(["mine@3"]);
  });

  it("adopts a mod the player installed before the pack shipped it", () => {
    const result = mergeModpackMods({
      base: [],
      current: [mod("a", "9")],
      next: [mod("a", "2")],
    });

    expect(ids(result.mods)).toEqual(["a@2"]);
    expect(result.added).toHaveLength(0);
    expect(result.updated[0].replacedUserVersion).toBe(false);
  });

  it("adds mods new to the pack", () => {
    const result = mergeModpackMods({
      base: [],
      current: [],
      next: [mod("fresh", "1")],
    });

    expect(ids(result.added)).toEqual(["fresh@1"]);
  });

  it("keeps a disabled mod disabled across the update", () => {
    const base = baseProjectsOf([mod("a", "1")]);
    const result = mergeModpackMods({
      base,
      current: [mod("a", "1", { disabled: true })],
      next: [mod("a", "2")],
    });

    expect(result.mods[0].version?.files[0].disabled).toBe(true);
  });

  it("follows a pack mod the player re-identified on another site", () => {
    const base = baseProjectsOf([
      mod("local-a", "local", {
        provider: Provider.LOCAL,
        filename: "a-1.jar",
      }),
    ]);
    const result = mergeModpackMods({
      base,
      current: [mod("cf-a", "77", { provider: Provider.CURSEFORGE, filename: "a-1.jar" })],
      next: [
        mod("local-a", "local", {
          provider: Provider.LOCAL,
          filename: "a-2.jar",
        }),
      ],
    });

    expect(result.mods.map((item) => item.version?.files[0].filename)).toEqual([
      "a-2.jar",
    ]);
    expect(result.own).toHaveLength(0);
  });

  it("treats the same file under another key as unchanged", () => {
    const base = baseProjectsOf([mod("a", "1", { filename: "a.jar" })]);
    const result = mergeModpackMods({
      base,
      current: [mod("x", "9", { provider: Provider.CURSEFORGE, filename: "a.jar" })],
      next: [mod("a", "1", { filename: "a.jar" })],
    });

    expect(result.unchanged).toBe(1);
    expect(result.mods[0].provider).toBe(Provider.CURSEFORGE);
  });
});

describe("mergeModpackMods hashes", () => {
  it("updates a jar the pack replaced under the same file name", () => {
    const before = mod("a", "1", { filename: "a.jar" });
    before.version!.files[0].sha1 = "old";
    const after = mod("a", "1", { filename: "a.jar" });
    after.version!.files[0].sha1 = "new";

    const result = mergeModpackMods({
      base: baseProjectsOf([before]),
      current: [before],
      next: [after],
    });

    expect(result.updated).toHaveLength(1);
    expect(result.mods[0].version?.files[0].sha1).toBe("new");
  });
});

describe("planModpackFiles", () => {
  const empty = { client: {}, server: {} };

  function plan(
    base: Record<string, string>,
    next: Record<string, string>,
    current: Record<string, string | null>,
  ) {
    return planModpackFiles({
      base: { client: base, server: {} },
      next: { client: next, server: {} },
      current: { client: current, server: {} },
    });
  }

  it("overwrites files the player did not change", () => {
    const result = plan({ "config/a.toml": "1" }, { "config/a.toml": "2" }, {
      "config/a.toml": "1",
    });

    expect(result.write).toEqual([{ side: "client", path: "config/a.toml" }]);
    expect(result.conflicts).toEqual([]);
  });

  it("keeps the player's file when the pack did not change it", () => {
    const result = plan({ "config/a.toml": "1" }, { "config/a.toml": "1" }, {
      "config/a.toml": "mine",
    });

    expect(result.write).toEqual([]);
  });

  it("takes the pack's file on a conflict and marks it for backup", () => {
    const result = plan({ "config/a.toml": "1" }, { "config/a.toml": "2" }, {
      "config/a.toml": "mine",
    });

    expect(result.write).toEqual([{ side: "client", path: "config/a.toml" }]);
    expect(result.conflicts).toEqual([{ side: "client", path: "config/a.toml" }]);
  });

  it("treats a new pack file over the player's own file as a conflict", () => {
    const result = plan({}, { "kubejs/x.js": "2" }, { "kubejs/x.js": "mine" });

    expect(result.conflicts).toEqual([{ side: "client", path: "kubejs/x.js" }]);
  });

  it("writes new and changed files that are missing", () => {
    const result = plan({ "config/old.toml": "1" }, {
      "config/old.toml": "2",
      "config/new.toml": "1",
    }, {});

    expect(result.write.map((item) => item.path)).toEqual([
      "config/new.toml",
      "config/old.toml",
    ]);
  });

  it("respects a file the player deleted when the pack did not change it", () => {
    const result = plan({ "config/a.toml": "1" }, { "config/a.toml": "1" }, {
      "config/a.toml": null,
    });

    expect(result.write).toEqual([]);
  });

  it("removes files the pack dropped unless the player edited them", () => {
    const result = plan(
      { "kubejs/old.js": "1", "kubejs/edited.js": "1" },
      {},
      { "kubejs/old.js": "1", "kubejs/edited.js": "mine" },
    );

    expect(result.remove).toEqual([{ side: "client", path: "kubejs/old.js" }]);
    expect(result.kept).toEqual([{ side: "client", path: "kubejs/edited.js" }]);
  });

  it("never overwrites player state files that exist", () => {
    const result = plan(
      { "options.txt": "1", "saves/World/level.dat": "1" },
      { "options.txt": "2", "saves/World/level.dat": "2" },
      { "options.txt": "mine", "saves/World/level.dat": "played" },
    );

    expect(result.write).toEqual([]);
    expect(result.protected.map((item) => item.path)).toEqual([
      "options.txt",
      "saves/World/level.dat",
    ]);
  });

  it("writes a player state file the instance does not have yet", () => {
    const result = plan({}, { "servers.dat": "1" }, {});

    expect(result.write).toEqual([{ side: "client", path: "servers.dat" }]);
  });

  it("plans server overrides on their own side", () => {
    const result = planModpackFiles({
      base: { client: {}, server: { "config/s.toml": "1" } },
      next: { client: {}, server: { "config/s.toml": "2" } },
      current: { ...empty, server: { "config/s.toml": "1" } },
    });

    expect(result.write).toEqual([{ side: "server", path: "config/s.toml" }]);
  });
});

describe("packLocalContentPaths", () => {
  it("lists override content the update will copy into the instance", () => {
    const local = mod("helper", "local", {
      provider: Provider.LOCAL,
      filename: "Mod Menu Helper.zip",
    });
    local.projectType = ProjectType.RESOURCEPACK;
    local.version!.files[0].localPath =
      "C:\\temp\\pack\\overrides\\resourcepacks\\Mod Menu Helper.zip";
    const kept = mod("kept", "1");
    kept.version!.files[0].localPath = "C:/instance/mods/kept.jar";

    expect(
      packLocalContentPaths(
        [local, kept, mod("remote", "1")],
        "C:\\temp\\pack",
      ),
    ).toEqual([
      "resourcepacks/Mod Menu Helper.zip",
      "resourcepacks/Mod Menu Helper.zip.disabled",
    ]);
  });
});

describe("modpackMergeDiff", () => {
  it("shows a file replaced under the same name by its hash", () => {
    const before = mod("a", "1", { filename: "a.zip" });
    before.version!.files[0].sha1 = "1111111aaaa";
    const after = mod("a", "1", { filename: "a.zip" });
    after.version!.files[0].sha1 = "2222222bbbb";

    const diff = modpackMergeDiff(
      mergeModpackMods({
        base: baseProjectsOf([before]),
        current: [before, mod("mine", "1")],
        next: [after, mod("new", "1")],
      }),
    );

    expect(diff.updated[0]).toMatchObject({
      fromVersion: "a.zip · 1111111",
      toVersion: "a.zip · 2222222",
    });
    expect(diff.added.map((item) => item.title)).toEqual(["new"]);
    expect(diff.unchanged).toBe(1);
  });
});

describe("path rules", () => {
  it("recognises content folders", () => {
    expect(isContentPath("mods/a.jar")).toBe(true);
    expect(isContentPath("Shaderpacks\\x.zip")).toBe(true);
    expect(isContentPath("config/mods.toml")).toBe(false);
  });

  it("recognises player state", () => {
    expect(isProtectedPath("options.txt")).toBe(true);
    expect(isProtectedPath("saves/a/level.dat")).toBe(true);
    expect(isProtectedPath("config/options.txt")).toBe(false);
  });
});
