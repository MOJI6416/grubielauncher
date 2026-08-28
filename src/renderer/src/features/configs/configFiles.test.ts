import { describe, expect, it } from "vitest";
import {
  DirectoryEntry,
  collectConfigFiles,
  collectInstanceConfigs,
  isEditableConfig,
  sortConfigEntries,
  splitConfigPath,
} from "./configFiles";

function makeReader(tree: Record<string, DirectoryEntry[]>) {
  const visited: string[] = [];

  const read = async (directory: string) => {
    visited.push(directory);
    const entries = tree[directory];
    if (!entries) throw new Error(`missing ${directory}`);
    return entries;
  };

  return { read, visited };
}

describe("isEditableConfig", () => {
  it("accepts known config extensions regardless of case", () => {
    expect(isEditableConfig("client.toml")).toBe(true);
    expect(isEditableConfig("Options.TXT")).toBe(true);
    expect(isEditableConfig("pack.json5")).toBe(true);
  });

  it("rejects binaries and unknown extensions", () => {
    expect(isEditableConfig("mod.jar")).toBe(false);
    expect(isEditableConfig("level.dat")).toBe(false);
    expect(isEditableConfig("noextension")).toBe(false);
  });
});

describe("splitConfigPath", () => {
  it("splits nested paths", () => {
    expect(splitConfigPath("jei/jei-client.toml")).toEqual({
      folder: "jei",
      name: "jei-client.toml",
    });
  });

  it("keeps root files without a folder", () => {
    expect(splitConfigPath("options.txt")).toEqual({
      folder: "",
      name: "options.txt",
    });
  });
});

describe("sortConfigEntries", () => {
  it("groups by folder then by name", () => {
    const sorted = sortConfigEntries([
      { relative: "b/z.toml", folder: "b", name: "z.toml", base: "root" },
      { relative: "a.toml", folder: "", name: "a.toml", base: "root" },
      { relative: "b/a.toml", folder: "b", name: "a.toml", base: "root" },
    ]);

    expect(sorted.map((entry) => entry.relative)).toEqual([
      "a.toml",
      "b/a.toml",
      "b/z.toml",
    ]);
  });
});

describe("collectConfigFiles", () => {
  it("walks nested folders and keeps only editable files", async () => {
    const { read } = makeReader({
      root: [
        { path: "client.toml", type: "file" },
        { path: "mod.jar", type: "file" },
        { path: "jei", type: "folder" },
      ],
      "root/jei": [
        { path: "jei-client.toml", type: "file" },
        { path: "blacklist.cfg", type: "file" },
      ],
    });

    const files = await collectConfigFiles(read, "root");

    expect(files.map((entry) => entry.relative)).toEqual([
      "client.toml",
      "jei/blacklist.cfg",
      "jei/jei-client.toml",
    ]);
  });

  it("skips noisy folders", async () => {
    const { read, visited } = makeReader({
      root: [
        { path: "backups", type: "folder" },
        { path: "logs", type: "folder" },
        { path: "keep.cfg", type: "file" },
      ],
    });

    const files = await collectConfigFiles(read, "root");

    expect(files.map((entry) => entry.relative)).toEqual(["keep.cfg"]);
    expect(visited).toEqual(["root"]);
  });

  it("stops at the depth limit", async () => {
    const { read } = makeReader({
      root: [{ path: "a", type: "folder" }],
      "root/a": [{ path: "b", type: "folder" }],
      "root/a/b": [{ path: "deep.toml", type: "file" }],
    });

    expect(
      (await collectConfigFiles(read, "root", { maxDepth: 2 })).length,
    ).toBe(0);
    expect(
      (await collectConfigFiles(read, "root", { maxDepth: 3 })).map(
        (entry) => entry.relative,
      ),
    ).toEqual(["a/b/deep.toml"]);
  });

  it("caps the number of collected files", async () => {
    const { read } = makeReader({
      root: Array.from({ length: 10 }, (_, index) => ({
        path: `file-${index}.cfg`,
        type: "file" as const,
      })),
    });

    expect((await collectConfigFiles(read, "root", { maxFiles: 4 })).length).toBe(
      4,
    );
  });

  it("survives an unreadable directory", async () => {
    const { read } = makeReader({
      root: [{ path: "broken", type: "folder" }],
    });

    await expect(collectConfigFiles(read, "root")).resolves.toEqual([]);
  });
});

describe("collectInstanceConfigs", () => {
  const joinPath = (...parts: string[]) => parts.join("/");

  it("reaches script folders and keeps config keys unprefixed", async () => {
    const { read } = makeReader({
      "pack/config": [{ path: "jei.toml", type: "file" }],
      "pack/kubejs": [{ path: "server_scripts", type: "folder" }],
      "pack/kubejs/server_scripts": [{ path: "recipes.js", type: "file" }],
      "pack/scripts": [{ path: "hardmode.zs", type: "file" }],
    });

    const entries = await collectInstanceConfigs(
      read,
      async (target: string) => target !== "pack/defaultconfigs",
      joinPath,
      "pack",
    );

    expect(entries.map((entry) => entry.relative)).toEqual([
      "jei.toml",
      "kubejs/server_scripts/recipes.js",
      "scripts/hardmode.zs",
    ]);

    expect(entries.map((entry) => entry.base)).toEqual([
      "pack/config",
      "pack",
      "pack",
    ]);
  });

  it("skips roots the instance does not have", async () => {
    const { read, visited } = makeReader({
      "pack/config": [{ path: "options.txt", type: "file" }],
    });

    const entries = await collectInstanceConfigs(
      read,
      async (target: string) => target === "pack/config",
      joinPath,
      "pack",
    );

    expect(entries).toHaveLength(1);
    expect(visited).toEqual(["pack/config"]);
  });
});
