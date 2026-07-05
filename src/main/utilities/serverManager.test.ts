import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => process.env.TEMP || "C:\\Temp"),
  },
}));

import {
  AIKAR_FLAGS,
  setServerAikarFlags,
  syncServerExtraFiles,
} from "./serverManager";

const SYNC_DIRS = ["config", "defaultconfigs", "kubejs", "scripts"];
const tempRoots: string[] = [];

async function makeTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-server-sync-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.remove(root)));
});

describe("syncServerExtraFiles", () => {
  it("does nothing when the server folder is missing", async () => {
    const versionPath = await makeTempRoot();
    await fs.outputFile(path.join(versionPath, "config", "a.toml"), "x");

    await syncServerExtraFiles(
      versionPath,
      path.join(versionPath, "server"),
      SYNC_DIRS,
    );

    await expect(
      fs.pathExists(path.join(versionPath, "server")),
    ).resolves.toBe(false);
  });

  it("mirrors config-type directories but leaves mods to the mod sync", async () => {
    const versionPath = await makeTempRoot();
    const serverPath = path.join(versionPath, "server");
    await fs.ensureDir(serverPath);

    await fs.outputFile(path.join(versionPath, "config", "mod.toml"), "a=1");
    await fs.outputFile(
      path.join(versionPath, "kubejs", "server_scripts", "s.js"),
      "//",
    );
    await fs.outputFile(path.join(versionPath, "mods", "client.jar"), "jar");

    await syncServerExtraFiles(versionPath, serverPath, SYNC_DIRS);

    await expect(
      fs.pathExists(path.join(serverPath, "config", "mod.toml")),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(path.join(serverPath, "kubejs", "server_scripts", "s.js")),
    ).resolves.toBe(true);
    await expect(
      fs.pathExists(path.join(serverPath, "mods")),
    ).resolves.toBe(false);
  });

  it("applies server-overrides but preserves existing world and server.properties", async () => {
    const versionPath = await makeTempRoot();
    const serverPath = path.join(versionPath, "server");
    await fs.ensureDir(serverPath);

    await fs.outputFile(
      path.join(serverPath, "server.properties"),
      "motd=admin",
    );
    await fs.outputFile(
      path.join(serverPath, "world", "level.dat"),
      "existing-world",
    );

    const stash = path.join(versionPath, "storage", "server-overrides");
    await fs.outputFile(path.join(stash, "config", "server-only.toml"), "s=1");
    await fs.outputFile(path.join(stash, "server.properties"), "motd=pack");
    await fs.outputFile(path.join(stash, "world", "level.dat"), "pack-world");

    await syncServerExtraFiles(versionPath, serverPath, SYNC_DIRS);

    await expect(
      fs.readFile(path.join(serverPath, "config", "server-only.toml"), "utf-8"),
    ).resolves.toBe("s=1");
    await expect(
      fs.readFile(path.join(serverPath, "server.properties"), "utf-8"),
    ).resolves.toBe("motd=admin");
    await expect(
      fs.readFile(path.join(serverPath, "world", "level.dat"), "utf-8"),
    ).resolves.toBe("existing-world");
  });

  it("lays down server-overrides protected files on first install", async () => {
    const versionPath = await makeTempRoot();
    const serverPath = path.join(versionPath, "server");
    await fs.ensureDir(serverPath);

    const stash = path.join(versionPath, "storage", "server-overrides");
    await fs.outputFile(path.join(stash, "server.properties"), "motd=pack");

    await syncServerExtraFiles(versionPath, serverPath, SYNC_DIRS);

    await expect(
      fs.readFile(path.join(serverPath, "server.properties"), "utf-8"),
    ).resolves.toBe("motd=pack");
  });
});

describe("setServerAikarFlags", () => {
  it("adds -Xms and Aikar flags to run scripts", async () => {
    const serverPath = await makeTempRoot();
    await fs.outputFile(
      path.join(serverPath, "run.bat"),
      "java -Xmx4096M -jar forge.jar nogui",
    );
    await fs.outputFile(path.join(serverPath, "user_jvm_args.txt"), "-Xmx4096M");

    await setServerAikarFlags(serverPath, true);

    const bat = await fs.readFile(path.join(serverPath, "run.bat"), "utf-8");
    expect(bat).toContain("-Xms4096M");
    expect(bat).toContain("-Xmx4096M");
    expect(bat).toContain(AIKAR_FLAGS);

    const jvm = await fs.readFile(
      path.join(serverPath, "user_jvm_args.txt"),
      "utf-8",
    );
    expect(jvm).toContain("-Xms4096M");
    expect(jvm).toContain(AIKAR_FLAGS);
  });

  it("removes Aikar flags and -Xms when disabled", async () => {
    const serverPath = await makeTempRoot();
    await fs.outputFile(
      path.join(serverPath, "run.sh"),
      `java -Xms4096M -Xmx4096M ${AIKAR_FLAGS} -jar forge.jar nogui`,
    );

    await setServerAikarFlags(serverPath, false);

    const sh = await fs.readFile(path.join(serverPath, "run.sh"), "utf-8");
    expect(sh).not.toContain(AIKAR_FLAGS);
    expect(sh).not.toContain("-Xms");
    expect(sh).toContain("-Xmx4096M");
  });

  it("is idempotent when Aikar is already enabled", async () => {
    const serverPath = await makeTempRoot();
    const content = `java -Xms4096M -Xmx4096M ${AIKAR_FLAGS} -jar forge.jar nogui`;
    await fs.outputFile(path.join(serverPath, "run.bat"), content);

    await setServerAikarFlags(serverPath, true);

    expect(
      await fs.readFile(path.join(serverPath, "run.bat"), "utf-8"),
    ).toBe(content);
  });
});
