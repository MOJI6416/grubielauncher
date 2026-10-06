import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import { Provider } from "@/types/ModManager";
import {
  applyModpackUpdateFiles,
  dropModpackRollback,
  planModpackUpdateFiles,
  readModpackBase,
  readModpackRollback,
  restoreModpackRollback,
  writeModpackBase,
} from "./modpackSource";

let root: string;
let instance: string;

function write(target: string, content: string) {
  fs.ensureDirSync(path.dirname(target));
  fs.writeFileSync(target, content);
}

function read(target: string): string | null {
  return fs.existsSync(target) ? fs.readFileSync(target, "utf-8") : null;
}

function pack(name: string, files: Record<string, string>): string {
  const folder = path.join(root, name);
  for (const [relative, content] of Object.entries(files)) {
    write(path.join(folder, relative), content);
  }
  return folder;
}

function conf(versionNumber: string): IVersionConf {
  return {
    name: "Pack",
    loader: { name: "fabric", mods: [] },
    version: { id: "1.21.1", type: "release", url: "", serverManager: true },
    build: 0,
    downloadedVersion: false,
    lastUpdate: new Date(0),
    runArguments: { game: "", jvm: "" },
    image: "",
    modpack: {
      provider: Provider.MODRINTH,
      projectId: "p",
      versionId: "v1",
      versionNumber,
      title: "Pack",
      url: "",
    },
  };
}

async function install(folder: string) {
  for (const sub of ["overrides", "client-overrides"]) {
    const source = path.join(folder, sub);
    if (fs.existsSync(source)) fs.copySync(source, instance);
  }
  const server = path.join(folder, "server-overrides");
  if (fs.existsSync(server)) {
    fs.copySync(server, path.join(instance, "storage", "server-overrides"));
  }
  await writeModpackBase(instance, folder, {
    versionId: "v1",
    projects: [],
    extraFiles: [],
  });
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "grubie-modpack-"));
  instance = path.join(root, "instance");
  fs.ensureDirSync(instance);
});

afterEach(() => {
  fs.removeSync(root);
});

describe("writeModpackBase", () => {
  it("hashes override files and leaves content folders to the mod list", async () => {
    const folder = pack("v1", {
      "overrides/config/a.toml": "a",
      "overrides/mods/local.jar": "jar",
      "client-overrides/config/client.toml": "c",
      "server-overrides/config/server.toml": "s",
    });

    await writeModpackBase(instance, folder, {
      versionId: "v1",
      loaderVersion: "0.16.0",
      projects: [{ key: "modrinth:a", versionId: "1", files: ["a.jar"] }],
      extraFiles: [
        {
          path: "config/extra.json",
          url: "https://cdn.modrinth.com/x",
          sha1: "ABC",
          size: 1,
          isClient: true,
          isServer: false,
        },
      ],
    });

    const base = await readModpackBase(instance);
    expect(Object.keys(base!.client).sort()).toEqual([
      "config/a.toml",
      "config/client.toml",
      "config/extra.json",
    ]);
    expect(base!.client["config/extra.json"]).toBe("abc");
    expect(Object.keys(base!.server)).toEqual(["config/server.toml"]);
    expect(base!.loaderVersion).toBe("0.16.0");
  });
});

describe("modpack update files", () => {
  it("updates, backs up conflicts, removes dropped files and rolls back", async () => {
    await install(
      pack("v1", {
        "overrides/config/same.toml": "1",
        "overrides/config/edited.toml": "1",
        "overrides/config/dropped.toml": "1",
        "overrides/options.txt": "pack",
      }),
    );

    write(path.join(instance, "config/edited.toml"), "mine");
    write(path.join(instance, "options.txt"), "player");
    write(path.join(instance, "config/own.toml"), "own");

    const next = pack("v2", {
      "overrides/config/same.toml": "2",
      "overrides/config/edited.toml": "2",
      "overrides/config/new.toml": "new",
      "overrides/options.txt": "pack2",
    });

    const plan = await planModpackUpdateFiles(instance, next, []);
    expect(plan!.write.map((item) => item.path)).toEqual([
      "config/edited.toml",
      "config/new.toml",
      "config/same.toml",
    ]);
    expect(plan!.conflicts.map((item) => item.path)).toEqual([
      "config/edited.toml",
    ]);
    expect(plan!.remove.map((item) => item.path)).toEqual([
      "config/dropped.toml",
    ]);
    expect(plan!.protected.map((item) => item.path)).toEqual(["options.txt"]);

    await applyModpackUpdateFiles({
      versionPath: instance,
      root: next,
      extraFiles: [],
      plan: plan!,
      previousConf: conf("1.0"),
      toVersion: "2.0",
    });

    expect(read(path.join(instance, "config/same.toml"))).toBe("2");
    expect(read(path.join(instance, "config/edited.toml"))).toBe("2");
    expect(read(path.join(instance, "config/new.toml"))).toBe("new");
    expect(read(path.join(instance, "config/dropped.toml"))).toBeNull();
    expect(read(path.join(instance, "options.txt"))).toBe("player");
    expect(read(path.join(instance, "config/own.toml"))).toBe("own");

    expect(await readModpackRollback(instance)).toMatchObject({
      fromVersion: "1.0",
      toVersion: "2.0",
    });

    const restored = await restoreModpackRollback(instance);
    expect(restored?.conf.modpack?.versionNumber).toBe("1.0");
    expect(read(path.join(instance, "config/same.toml"))).toBe("1");
    expect(read(path.join(instance, "config/edited.toml"))).toBe("mine");
    expect(read(path.join(instance, "config/dropped.toml"))).toBe("1");
    expect(read(path.join(instance, "config/new.toml"))).toBeNull();

    await dropModpackRollback(instance);
    expect(await readModpackRollback(instance)).toBeNull();
  });

  it("hands remote extra files back as downloads after backing them up", async () => {
    await install(pack("v1", { "overrides/config/keep.toml": "1" }));
    write(path.join(instance, "config/remote.json"), "old");

    const next = pack("v2", { "overrides/config/keep.toml": "1" });
    const extraFiles = [
      {
        path: "config/remote.json",
        url: "https://cdn.modrinth.com/data/remote.json",
        sha1: "0000000000000000000000000000000000000000",
        size: 3,
        isClient: true,
        isServer: false,
      },
    ];

    const plan = await planModpackUpdateFiles(instance, next, extraFiles);
    const result = await applyModpackUpdateFiles({
      versionPath: instance,
      root: next,
      extraFiles,
      plan: plan!,
      previousConf: conf("1.0"),
      toVersion: "2.0",
    });

    expect(result.downloads).toEqual([
      {
        url: "https://cdn.modrinth.com/data/remote.json",
        destination: path.join(instance, "config", "remote.json"),
      },
    ]);

    await restoreModpackRollback(instance);
    expect(read(path.join(instance, "config/remote.json"))).toBe("old");
  });

  it("undoes the files it already wrote when a write fails", async () => {
    await install(
      pack("v1", {
        "overrides/config/a.toml": "1",
        "overrides/config/b.toml": "1",
      }),
    );
    fs.removeSync(path.join(instance, "config/b.toml"));
    write(path.join(instance, "config/b.toml/blocker.txt"), "dir");

    const next = pack("v2", {
      "overrides/config/a.toml": "2",
      "overrides/config/b.toml": "2",
    });

    await expect(
      applyModpackUpdateFiles({
        versionPath: instance,
        root: next,
        extraFiles: [],
        plan: {
          write: [
            { side: "client", path: "config/a.toml" },
            { side: "client", path: "config/b.toml" },
          ],
          remove: [],
        },
        previousConf: conf("1.0"),
        toVersion: "2.0",
      }),
    ).rejects.toBeTruthy();

    expect(read(path.join(instance, "config/a.toml"))).toBe("1");
    expect(await readModpackRollback(instance)).toBeNull();
  });

  it("keeps the old copy of local pack content the update overwrites", async () => {
    await install(pack("v1", { "overrides/resourcepacks/helper.zip": "old" }));
    expect(read(path.join(instance, "resourcepacks/helper.zip"))).toBe("old");

    const next = pack("v2", { "overrides/resourcepacks/helper.zip": "new" });
    await applyModpackUpdateFiles({
      versionPath: instance,
      root: next,
      extraFiles: [],
      plan: { write: [], remove: [] },
      preserve: [
        "resourcepacks/helper.zip",
        "resourcepacks/helper.zip.disabled",
        "../outside.zip",
      ],
      previousConf: conf("1.0"),
      toVersion: "2.0",
    });

    write(path.join(instance, "resourcepacks/helper.zip"), "new");
    await restoreModpackRollback(instance);
    expect(read(path.join(instance, "resourcepacks/helper.zip"))).toBe("old");
  });

  it("refuses paths that leave the instance", async () => {
    await install(pack("v1", {}));
    const next = pack("v2", { "overrides/config/a.toml": "1" });

    await applyModpackUpdateFiles({
      versionPath: instance,
      root: next,
      extraFiles: [],
      plan: { write: [{ side: "client", path: "../escape.txt" }], remove: [] },
      previousConf: conf("1.0"),
      toVersion: "2.0",
    });

    expect(fs.existsSync(path.join(root, "escape.txt"))).toBe(false);
  });

  it("has no plan without a recorded base", async () => {
    const next = pack("v2", { "overrides/config/a.toml": "1" });
    expect(await planModpackUpdateFiles(instance, next, [])).toBeNull();
  });
});
