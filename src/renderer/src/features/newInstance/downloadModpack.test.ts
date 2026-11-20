import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IProject, IVersion } from "@/types/ModManager";

const state = vi.hoisted(() => ({
  downloaded: true,
  extracted: 0,
  checked: 0,
}));

vi.stubGlobal("window", {
  api: {
    path: {
      join: async (...parts: string[]) => parts.join("/"),
      basename: async (value: string, ext?: string) => {
        const name = value.split("/").pop() ?? value;
        return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
      },
      extname: async (value: string) => value.slice(value.lastIndexOf(".")),
    },
    file: { download: async () => state.downloaded },
    fs: {
      extractZip: async () => {
        state.extracted++;
        return true;
      },
      rimraf: async () => true,
    },
    modManager: {
      checkModpack: async () => {
        state.checked++;
        return { name: "Pack", folderPath: "/tmp/pack" };
      },
    },
  },
});

vi.mock("@renderer/utilities/diskRoom", () => ({
  ensureDiskRoom: async () => undefined,
}));

vi.mock("@renderer/utilities/archiveProgress", () => ({
  withExtractProgress: (
    _path: string,
    _onPercent: unknown,
    run: () => Promise<unknown>,
  ) => run(),
}));

const { downloadModpack } = await import("./downloadModpack");

const project = { id: "1", title: "All the Mods" } as IProject;
const version = {
  id: "2",
  files: [
    {
      filename: "All the Mods 10-8.3.zip",
      url: "https://edge.forgecdn.net/files/9190/157/All%20the%20Mods%2010-8.3.zip",
      sha1: "abc",
      size: 10,
    },
  ],
} as unknown as IVersion;

beforeEach(() => {
  state.downloaded = true;
  state.extracted = 0;
  state.checked = 0;
});

describe("downloadModpack", () => {
  it("stops at a failed download and names where it came from", async () => {
    state.downloaded = false;

    const result = await downloadModpack(project, version, () => undefined);

    expect(result).toEqual({
      status: "failed",
      downloadSource: "edge.forgecdn.net",
    });
    expect(state.extracted).toBe(0);
    expect(state.checked).toBe(0);
  });

  it("unpacks the archive once it is downloaded", async () => {
    const result = await downloadModpack(project, version, () => undefined);

    expect(result.status).toBe("ok");
    expect(state.extracted).toBe(1);
    expect(state.checked).toBe(1);
  });
});
