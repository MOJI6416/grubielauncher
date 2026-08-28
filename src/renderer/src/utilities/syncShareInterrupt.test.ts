import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import os from "os";
import nodePath from "path";
import { VERSION_INSTALL_CANCELLED } from "@/types/InstallationProgress";

vi.mock("@renderer/i18n", () => ({
  default: { t: (key: string) => key },
}));

vi.mock("sonner", () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock("./errorToast", () => ({
  showErrorToast: vi.fn(),
  recordError: vi.fn(),
}));

let instancePath = "";
let root = "";
let savedConfs = 0;
let checkBehaviour: () => Promise<void> = async () => {};

function localMod(id: string, filename: string) {
  return {
    id,
    provider: "modrinth",
    projectType: "mod",
    title: id,
    version: { files: [{ filename, url: `https://x/${filename}`, sha1: id }] },
  } as any;
}

function makeApi() {
  return {
    path: { join: (...parts: string[]) => nodePath.join(...parts) },
    fs: {
      pathExists: (target: string) => fs.pathExists(target),
      readJSON: async () => null,
      readFile: async () => "",
      writeFile: async () => true,
      rimraf: async () => true,
    },
    modManager: {
      compareMods: async (left: any[], right: any[]) =>
        JSON.stringify(left) === JSON.stringify(right),
    },
    servers: {
      compare: async () => true,
      write: async () => true,
    },
    mods: {
      check: async () => {
        await checkBehaviour();
        return { success: true };
      },
      downloadOther: async () => ({ success: true }),
    },
    backend: { getModpack: async () => ({ status: "success", data: null }) },
  };
}

async function modsOnDisk() {
  const modsPath = nodePath.join(instancePath, "mods");
  return (await fs.readdir(modsPath).catch(() => [] as string[])).sort();
}

async function confOnDisk() {
  return fs.readJSON(nodePath.join(instancePath, "version.json"));
}

beforeEach(async () => {
  root = await fs.mkdtemp(nodePath.join(os.tmpdir(), "grubie-sync-"));
  instancePath = nodePath.join(root, "instance");
  savedConfs = 0;

  await fs.outputFile(nodePath.join(instancePath, "mods", "old.jar"), "old");
  await fs.outputFile(
    nodePath.join(instancePath, "config", "pack.toml"),
    "mine=1",
  );

  (globalThis as any).window = { api: makeApi() };
});

afterEach(async () => {
  await fs.remove(root);
  vi.resetModules();
});

function instanceConf() {
  return {
    name: "Pack",
    shareCode: "abc",
    build: 1,
    downloadedVersion: true,
    loader: { name: "fabric", mods: [localMod("old", "old.jar")] },
    version: { id: "1.21.1", type: "release", url: "" },
    runArguments: { game: "", jvm: "" },
    image: "",
    lastUpdate: new Date(),
  } as any;
}

function publishedModpack() {
  return {
    build: 2,
    conf: {
      name: "Pack",
      description: "",
      image: "",
      quickServer: "",
      options: "",
      servers: [],
      runArguments: { game: "", jvm: "" },
      version: { id: "1.21.1", type: "release", url: "" },
      loader: { name: "fabric", mods: [localMod("new", "new.jar")] },
    },
  } as any;
}

function makeVersion() {
  const conf = instanceConf();
  return {
    version: conf,
    versionPath: instancePath,
    save: async () => {
      savedConfs += 1;
      await fs.writeJSON(nodePath.join(instancePath, "version.json"), conf);
      return true;
    },
  } as any;
}

// The instance conf is written once, up front, so "what version.json says"
// stays readable after a sync that never reaches its own save.
async function seedConf(version: any) {
  await fs.writeJSON(
    nodePath.join(instancePath, "version.json"),
    version.version,
  );
  savedConfs = 0;
}

describe("a sync that stops half way", () => {
  it("leaves the files ahead of version.json and says so", async () => {
    const { syncShare } = await import("./version");
    const { isShareSyncInterrupted } = await import("./shareSyncPure");

    const version = makeVersion();
    await seedConf(version);

    // What a real check does before it can fail: the published build's mod is
    // fetched and the one it dropped is taken away.
    checkBehaviour = async () => {
      await fs.outputFile(nodePath.join(instancePath, "mods", "new.jar"), "new");
      await fs.remove(nodePath.join(instancePath, "mods", "old.jar"));
      throw new Error("network died mid-download");
    };

    expect(await modsOnDisk()).toEqual(["old.jar"]);

    const error = await syncShare(version, [], {} as any, "token", publishedModpack())
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(await modsOnDisk()).toEqual(["new.jar"]);
    expect((await confOnDisk()).loader.mods[0].id).toBe("old");
    expect(savedConfs).toBe(0);

    expect(isShareSyncInterrupted(error)).toBe(true);
    expect((error as any).isCancelled).toBe(false);
  });

  it("does not stay silent when the player cancels", async () => {
    const { syncShare } = await import("./version");
    const { isShareSyncInterrupted } = await import("./shareSyncPure");

    const version = makeVersion();
    await seedConf(version);

    checkBehaviour = async () => {
      await fs.outputFile(nodePath.join(instancePath, "mods", "new.jar"), "new");
      throw new Error(VERSION_INSTALL_CANCELLED);
    };

    const error = await syncShare(version, [], {} as any, "token", publishedModpack())
      .then(() => null)
      .catch((caught: unknown) => caught);

    expect(isShareSyncInterrupted(error)).toBe(true);
    expect((error as any).isCancelled).toBe(true);

    const { reportShareSyncInterruption } = await import("./version");
    const { toast } = await import("sonner");

    expect(reportShareSyncInterruption(error)).toBe(true);
    expect(toast.warning).toHaveBeenCalledWith(
      "versions.syncInterrupted",
      expect.objectContaining({ description: "versions.syncInterruptedHint" }),
    );
  });

  it("keeps quiet about anything that is not an interrupted sync", async () => {
    const { reportShareSyncInterruption } = await import("./version");

    expect(reportShareSyncInterruption(new Error("boom"))).toBe(false);
    expect(reportShareSyncInterruption(undefined)).toBe(false);
  });

  it("still finishes and saves when nothing goes wrong", async () => {
    const { syncShare } = await import("./version");

    const version = makeVersion();
    await seedConf(version);

    checkBehaviour = async () => {
      await fs.outputFile(nodePath.join(instancePath, "mods", "new.jar"), "new");
      await fs.remove(nodePath.join(instancePath, "mods", "old.jar"));
    };

    await syncShare(version, [], {} as any, "token", publishedModpack());

    expect(savedConfs).toBeGreaterThan(0);
    expect((await confOnDisk()).loader.mods[0].id).toBe("new");
    expect(await modsOnDisk()).toEqual(["new.jar"]);
  });
});
