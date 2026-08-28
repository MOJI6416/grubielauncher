import { describe, expect, it, vi } from "vitest";
import { ProjectType } from "@/types/ModManager";

async function loadToggle(rename: () => Promise<boolean>) {
  vi.resetModules();

  const calls: string[][] = [];

  vi.stubGlobal("window", {
    api: {
      path: {
        join: (...parts: string[]) => Promise.resolve(parts.join("/")),
      },
      fs: {
        pathExists: () => Promise.resolve(true),
        readdir: () => Promise.resolve([]),
        rename: (from: string, to: string) => {
          calls.push([from, to]);
          return rename();
        },
      },
      modManager: {
        ptToFolder: () => Promise.resolve("mods"),
      },
    },
  });

  const { toggleModFile } = await import("./useModFileStates");
  return { toggleModFile, calls };
}

describe("toggleModFile", () => {
  it("renames the file when the main process confirms the rename", async () => {
    const { toggleModFile, calls } = await loadToggle(() =>
      Promise.resolve(true),
    );

    await toggleModFile("C:/pack", ProjectType.MOD, "sodium.jar", true);

    expect(calls).toEqual([
      ["C:/pack/mods/sodium.jar", "C:/pack/mods/sodium.jar.disabled"],
    ]);
  });

  it("throws when the rename channel answers false", async () => {
    const { toggleModFile } = await loadToggle(() => Promise.resolve(false));

    await expect(
      toggleModFile("C:/pack", ProjectType.MOD, "sodium.jar", true),
    ).rejects.toThrow();
  });
});
