import { describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
  buildLaunchAliasName,
  hasNonAsciiPath,
  needsLaunchAlias,
  normalizeLinkTarget,
  resolveLaunchPath,
} from "./launchAlias";

const isWindows = process.platform === "win32";

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-launch-alias-"));
  try {
    return await run(dir);
  } finally {
    await fs.remove(dir).catch(() => {});
  }
}

describe("launch alias", () => {
  it("only aliases non-ascii paths on windows", () => {
    expect(hasNonAsciiPath("C:\\pack\\Vanilla 26.2")).toBe(false);
    expect(hasNonAsciiPath("C:\\pack\\整合包")).toBe(true);
    expect(hasNonAsciiPath("C:\\pack\\Сборка")).toBe(true);

    expect(needsLaunchAlias("C:\\pack\\整合包", "win32")).toBe(true);
    expect(needsLaunchAlias("C:\\pack\\Vanilla", "win32")).toBe(false);
    expect(needsLaunchAlias("/home/user/整合包", "linux")).toBe(false);
  });

  it("builds a stable ascii alias name", () => {
    const first = buildLaunchAliasName("C:\\versions\\整合包");
    const second = buildLaunchAliasName("C:\\versions\\整合包");

    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(first).not.toBe(buildLaunchAliasName("C:\\versions\\другой"));
  });

  it("keeps a readable ascii part of the folder name", () => {
    expect(buildLaunchAliasName("C:\\versions\\Pack整合包")).toMatch(/^Pack-/);
    expect(buildLaunchAliasName("C:\\versions\\整合包")).toMatch(/^instance-/);
  });

  it("strips the extended path prefix from a link target", () => {
    expect(normalizeLinkTarget("\\\\?\\C:\\versions\\整合包")).toBe(
      path.resolve("C:\\versions\\整合包"),
    );
  });

  it("returns the path untouched when it is already ascii", async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, "minecraft", "versions", "Vanilla");
      await fs.ensureDir(target);

      expect(await resolveLaunchPath(target, dir)).toBe(target);
      expect(await fs.pathExists(path.join(dir, "launch"))).toBe(false);
    });
  });

  it.runIf(isWindows)(
    "gives a non-ascii instance folder a working ascii path",
    async () => {
      await withTempDir(async (dir) => {
        const target = path.join(dir, "minecraft", "versions", "整合包");
        await fs.ensureDir(target);
        await fs.writeFile(path.join(target, "client.jar"), "jar");

        const aliased = await resolveLaunchPath(target, dir);

        expect(aliased).not.toBe(target);
        expect(hasNonAsciiPath(aliased)).toBe(false);
        expect(await fs.readFile(path.join(aliased, "client.jar"), "utf8")).toBe(
          "jar",
        );

        await fs.writeFile(path.join(aliased, "options.txt"), "lang:ru_ru");
        expect(await fs.readFile(path.join(target, "options.txt"), "utf8")).toBe(
          "lang:ru_ru",
        );

        expect(await resolveLaunchPath(target, dir)).toBe(aliased);
      });
    },
  );

  it.runIf(isWindows)("repoints an alias left over from a rename", async () => {
    await withTempDir(async (dir) => {
      const target = path.join(dir, "minecraft", "versions", "整合包");
      await fs.ensureDir(target);

      const aliased = await resolveLaunchPath(target, dir);
      await fs.remove(aliased);
      await fs.writeFile(aliased, "stale file in the way");

      const repointed = await resolveLaunchPath(target, dir);
      expect(repointed).toBe(aliased);
      expect((await fs.lstat(repointed)).isSymbolicLink()).toBe(true);
    });
  });

  it.runIf(isWindows)(
    "removing the alias never removes the instance",
    async () => {
      await withTempDir(async (dir) => {
        const target = path.join(dir, "minecraft", "versions", "整合包");
        await fs.ensureDir(path.join(target, "saves", "world"));
        await fs.writeFile(path.join(target, "saves", "world", "level.dat"), "x");

        await resolveLaunchPath(target, dir);
        await fs.remove(path.join(dir, "launch"));

        expect(
          await fs.pathExists(path.join(target, "saves", "world", "level.dat")),
        ).toBe(true);
      });
    },
  );

  it.runIf(isWindows)("drops aliases of instances that are gone", async () => {
    await withTempDir(async (dir) => {
      const gone = path.join(dir, "minecraft", "versions", "старая");
      const kept = path.join(dir, "minecraft", "versions", "整合包");
      await fs.ensureDir(gone);
      await fs.ensureDir(kept);

      const goneAlias = await resolveLaunchPath(gone, dir);
      await fs.remove(gone);
      await resolveLaunchPath(kept, dir);

      expect(await fs.pathExists(goneAlias)).toBe(false);
    });
  });
});
