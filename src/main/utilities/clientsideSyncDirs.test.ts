import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGetMock = vi.fn();

vi.mock("axios", () => ({
  default: { get: (...args: unknown[]) => axiosGetMock(...args) },
}));

beforeEach(() => {
  vi.resetModules();
  axiosGetMock.mockReset();
});

async function syncDirs() {
  const { getServerSyncDirs } = await import("./clientsideMods");
  return getServerSyncDirs();
}

describe("getServerSyncDirs", () => {
  it("copies KubeGroovy scripts to the server even when the backend list omits them", async () => {
    axiosGetMock.mockResolvedValue({
      data: { mustInclude: ["config", "kubejs", "structures"] },
    });

    const dirs = await syncDirs();

    expect(dirs).toEqual(
      expect.arrayContaining([
        "config",
        "defaultconfigs",
        "kubejs",
        "kubegroovy",
        "scripts",
        "structures",
      ]),
    );
    expect(new Set(dirs).size).toBe(dirs.length);
  });

  it("falls back to the built-in list when the backend is unreachable", async () => {
    axiosGetMock.mockRejectedValue(new Error("offline"));

    expect(await syncDirs()).toEqual([
      "config",
      "defaultconfigs",
      "kubejs",
      "kubegroovy",
      "scripts",
    ]);
  });
});
