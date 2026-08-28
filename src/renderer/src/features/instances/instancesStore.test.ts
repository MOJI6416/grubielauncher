import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStore } from "jotai";

const toasts: string[] = [];

vi.mock("@renderer/i18n", () => ({
  default: { t: (key: string) => key },
}));

vi.mock("@renderer/utilities/errorToast", () => ({
  showErrorToast: (title: string) => toasts.push(title),
}));

vi.mock("@renderer/utilities/failures", () => ({
  showFailureToast: (title: string) => toasts.push(title),
}));

vi.mock("@renderer/utilities/versionOrganize", () => ({
  loadManualOrder: () => [],
  loadVersionTags: () => ({}),
}));

interface Disk {
  exists: boolean;
  content: unknown;
  writeError: string;
  written: unknown[];
}

const disk: Disk = { exists: true, content: null, writeError: "", written: [] };

async function loadStore() {
  vi.resetModules();
  vi.stubGlobal("window", {
    api: {
      path: { join: async (...parts: string[]) => parts.join("\\") },
      fs: {
        pathExists: async () => disk.exists,
        readJSON: async () => disk.content,
        writeJSONSync: (_path: string, data: unknown) => {
          if (disk.writeError) return disk.writeError;
          disk.written.push(data);
          disk.content = data;
          return "";
        },
      },
    },
  });

  return await import("./instancesStore");
}

const FILE = {
  version: 1,
  tags: { "C:\\Pack": ["favourite"] },
  order: ["C:\\Pack"],
  groups: [{ id: "g_1", name: "Group", keys: ["C:\\Pack"] }],
};

beforeEach(() => {
  toasts.length = 0;
  disk.exists = true;
  disk.content = structuredClone(FILE);
  disk.writeError = "";
  disk.written = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("updateInstancesFile", () => {
  it("keeps the change when the file was written", async () => {
    const store = await loadStore();
    await store.hydrateInstancesFile("C:\\launcher");

    store.updateInstancesFile((file) => ({ ...file, order: ["C:\\Other"] }));

    expect(getDefaultStore().get(store.instancesFileAtom).order).toEqual([
      "C:\\Other",
    ]);
    expect(disk.written).toHaveLength(1);
    expect(toasts).toEqual([]);
  });

  it("rolls the change back when the write failed", async () => {
    const store = await loadStore();
    await store.hydrateInstancesFile("C:\\launcher");
    disk.writeError = "Error: EBUSY";

    store.updateInstancesFile((file) => ({
      ...file,
      tags: { ...file.tags, "C:\\Pack": ["favourite", "new"] },
    }));

    expect(getDefaultStore().get(store.instancesFileAtom).tags).toEqual({
      "C:\\Pack": ["favourite"],
    });
    expect(toasts).toEqual(["versions.organizeSaveFailed"]);
  });

  it("does not touch the store when the updater returns the same file", async () => {
    const store = await loadStore();
    await store.hydrateInstancesFile("C:\\launcher");

    store.updateInstancesFile((file) => file);

    expect(disk.written).toHaveLength(0);
    expect(toasts).toEqual([]);
  });
});

describe("hydrateInstancesFile", () => {
  it("loads tags, order and groups from disk", async () => {
    const store = await loadStore();
    await store.hydrateInstancesFile("C:\\launcher");

    const loaded = getDefaultStore().get(store.instancesFileAtom);
    expect(loaded.groups).toHaveLength(1);
    expect(loaded.order).toEqual(["C:\\Pack"]);
    expect(disk.written).toHaveLength(0);
  });

  it("never overwrites a file it could not read", async () => {
    const store = await loadStore();
    disk.content = null;

    await store.hydrateInstancesFile("C:\\launcher");
    expect(toasts).toEqual(["versions.organizeLoadFailed"]);
    expect(disk.written).toHaveLength(0);

    store.updateInstancesFile((file) => ({ ...file, order: ["C:\\Pack"] }));

    expect(getDefaultStore().get(store.instancesFileAtom).order).toEqual([]);
    expect(disk.written).toHaveLength(0);
    expect(toasts).toEqual([
      "versions.organizeLoadFailed",
      "versions.organizeSaveFailed",
    ]);
  });

  it("writes a fresh file when there is nothing on disk yet", async () => {
    const store = await loadStore();
    disk.exists = false;

    await store.hydrateInstancesFile("C:\\launcher");
    store.updateInstancesFile((file) => ({ ...file, order: ["C:\\Pack"] }));

    expect(getDefaultStore().get(store.instancesFileAtom).order).toEqual([
      "C:\\Pack",
    ]);
    expect(disk.written).toHaveLength(1);
    expect(toasts).toEqual([]);
  });
});
