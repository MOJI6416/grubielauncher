import { beforeEach, describe, expect, it } from "vitest";

const files = new Map<string, string>();

const join = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");

(globalThis as any).window = {
  api: {
    platform: "win32",
    path: { join },
    fs: {
      pathExists: async (path: string) =>
        files.has(path) ||
        [...files.keys()].some((key) => key.startsWith(`${path}/`)),
      readFile: async (path: string) => {
        if (!files.has(path)) throw new Error("missing");
        return files.get(path)!;
      },
      writeFile: async (path: string, text: string) => {
        files.set(path, text);
        return true;
      },
      ensure: async () => true,
      rimraf: async (path: string) => files.delete(path),
      readdirWithTypes: async (directory: string) => {
        const seen = new Map<string, "file" | "folder">();
        for (const key of files.keys()) {
          if (!key.startsWith(`${directory}/`)) continue;
          const rest = key.slice(directory.length + 1).split("/");
          seen.set(rest[0], rest.length > 1 ? "folder" : "file");
        }
        return [...seen].map(([path, type]) => ({ path, type }));
      },
    },
    file: { getTotalSizes: async () => 100 },
  },
};

const { getDefaultStore } = await import("jotai");
const atoms = await import("@renderer/stores/atoms");
const { Version } = await import("@renderer/classes/Version");
const configs = await import("./configs");
const { runUndo } = await import("../undo");

const store = getDefaultStore();
const ROOT = "C:/instances/Pack";

const TOML = [
  "[client]",
  "\t#Show the minimap",
  "\tminimap = true",
  "\t#Range: 1 ~ 64",
  "\tzoom = 8",
  "",
].join("\n");

beforeEach(() => {
  files.clear();
  files.set(`${ROOT}/config/map-client.toml`, TOML);
  files.set(`${ROOT}/config/notes.txt`, "hello");
  files.set(
    `${ROOT}/options.txt`,
    ["version:4671", "renderDistance:12", 'renderClouds:"true"'].join("\n"),
  );

  const version = new Version({
    name: "Pack",
    loader: { name: "fabric", version: { id: "0.16.9" }, mods: [] },
    version: { id: "1.21.1", type: "release", url: "", serverManager: false },
    build: 1,
    downloadedVersion: false,
    lastUpdate: new Date(0),
    runArguments: { jvm: "", game: "" },
    image: "",
  } as any);
  version.versionPath = ROOT;

  store.set(atoms.versionsAtom, [version]);
  store.set(atoms.installActiveAtom, false);
  store.set(atoms.isRunningAtom, false);
});

describe("mod configs", () => {
  it("lists only the files the assistant can edit", async () => {
    const result = await configs.listModConfigs.run({ instance: "Pack" });

    expect(String((result.data as any).files)).toContain("config/map-client.toml");
    expect(String((result.data as any).files)).not.toContain("notes.txt");
  });

  it("reads settings with their range and description", async () => {
    const result = await configs.readModConfig.run({
      instance: "Pack",
      file: "config/map-client.toml",
    });

    const fields = String((result.data as any).fields);
    expect(fields).toContain('"key":"client.zoom"');
    expect(fields).toContain('"max":64');
    expect(fields).toContain("Show the minimap");
  });

  it("refuses paths outside the config folders", async () => {
    const result = await configs.readModConfig.run({
      instance: "Pack",
      file: "config/../options.txt",
    });

    expect(result.ok).toBe(false);
  });

  it("changes one value, keeps the comments and can put the file back", async () => {
    const result = await configs.setModConfigValues.run({
      instance: "Pack",
      file: "config/map-client.toml",
      changes: [{ key: "client.minimap", value: false }],
    });

    expect(result.ok).toBe(true);
    const written = files.get(`${ROOT}/config/map-client.toml`)!;
    expect(written).toBe(TOML.replace("minimap = true", "minimap = false"));
    expect(
      [...files.keys()].some((key) => key.includes("config-backups")),
    ).toBe(true);

    expect((await runUndo(result.undo!)).ok).toBe(true);
    expect(files.get(`${ROOT}/config/map-client.toml`)).toBe(TOML);
  });

  it("writes nothing when one change breaks the declared range", async () => {
    const result = await configs.setModConfigValues.run({
      instance: "Pack",
      file: "config/map-client.toml",
      changes: [
        { key: "client.minimap", value: false },
        { key: "client.zoom", value: 500 },
      ],
    });

    expect(result.ok).toBe(false);
    expect(files.get(`${ROOT}/config/map-client.toml`)).toBe(TOML);
  });

  it("does not undo over a file the user changed afterwards", async () => {
    const result = await configs.setModConfigValues.run({
      instance: "Pack",
      file: "config/map-client.toml",
      changes: [{ key: "client.zoom", value: 16 }],
    });
    files.set(`${ROOT}/config/map-client.toml`, "edited by hand");

    expect((await runUndo(result.undo!)).ok).toBe(false);
    expect(files.get(`${ROOT}/config/map-client.toml`)).toBe("edited by hand");
  });
});

describe("game options", () => {
  it("changes options.txt and puts the old values back", async () => {
    const result = await configs.setGameOptions.run({
      instance: "Pack",
      values: { renderDistance: 8, renderClouds: "fast" },
    });

    expect(result.ok).toBe(true);
    expect(files.get(`${ROOT}/options.txt`)).toBe(
      ["version:4671", "renderDistance:8", 'renderClouds:"fast"'].join("\n"),
    );

    await runUndo(result.undo!);
    expect(files.get(`${ROOT}/options.txt`)).toBe(
      ["version:4671", "renderDistance:12", 'renderClouds:"true"'].join("\n"),
    );
  });

  it("refuses while the game is running", async () => {
    store.set(atoms.isRunningAtom, true);

    const result = await configs.setGameOptions.run({
      instance: "Pack",
      values: { renderDistance: 8 },
    });

    expect(result.ok).toBe(false);
  });
});
