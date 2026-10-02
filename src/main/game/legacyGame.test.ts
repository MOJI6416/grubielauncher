import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import {
  legacyAssetsDir,
  legacyFmlDownloads,
  legacyForgeJvmArguments,
  legacySessionArgument,
  materializeLegacyAssets,
  legacyHomeBase,
  prepareLegacyHome,
  usesLegacyWorkDir,
  usesUppercaseLangCode,
} from "./legacyGame";

describe("usesUppercaseLangCode", () => {
  it("is uppercase up to 1.10 and lowercase from 1.11", () => {
    for (const id of [
      "1.7.10",
      "1.10.2",
      "1.5.2",
      "b1.7.3",
      "a1.2.6",
      "16w20a",
    ]) {
      expect(usesUppercaseLangCode(id)).toBe(true);
    }
    for (const id of [
      "1.11",
      "1.12.2",
      "1.21.11",
      "26.3",
      "16w32a",
      "24w14a",
    ]) {
      expect(usesUppercaseLangCode(id)).toBe(false);
    }
  });
});

describe("legacyAssetsDir", () => {
  const options = {
    minecraftPath: "/mc",
    indexId: "legacy",
    gameDir: "/mc/versions/Old",
  };

  it("maps pre-1.6 indexes to the game resources folder", () => {
    expect(legacyAssetsDir({ map_to_resources: true }, options)).toBe(
      path.join("/mc/versions/Old", "resources"),
    );
  });

  it("maps 1.6 indexes to the shared virtual folder", () => {
    expect(legacyAssetsDir({ virtual: true }, options)).toBe(
      path.join("/mc", "assets", "virtual", "legacy"),
    );
  });

  it("leaves modern indexes alone", () => {
    expect(legacyAssetsDir({}, options)).toBeNull();
  });
});

describe("legacyForgeJvmArguments", () => {
  it("lets old FML start on Java that rejects SHA-1 jar signatures", () => {
    expect(legacyForgeJvmArguments("forge", true)).toEqual([
      "-Dfml.ignoreInvalidMinecraftCertificates=true",
    ]);
    expect(legacyForgeJvmArguments("forge", false)).toEqual([]);
    expect(legacyForgeJvmArguments("vanilla", true)).toEqual([]);
  });
});

describe("legacyFmlDownloads", () => {
  it("puts the FML 1.5 deobfuscation data where FML looks before downloading", () => {
    expect(legacyFmlDownloads("forge", "1.5.2", "/game")).toEqual([
      {
        url: "https://files.prismlauncher.org/fmllibs/deobfuscation_data_1.5.2.zip",
        destination: path.join("/game", "lib", "deobfuscation_data_1.5.2.zip"),
        sha1: "446e55cd986582c70fcf12cb27bc00114c5adfd9",
        size: 201404,
        group: "forge",
      },
    ]);
  });

  it("asks nothing for other versions and loaders", () => {
    expect(legacyFmlDownloads("forge", "1.6.4", "/game")).toEqual([]);
    expect(legacyFmlDownloads("vanilla", "1.5.2", "/game")).toEqual([]);
  });
});

describe("legacySessionArgument", () => {
  it("passes the session only for real accounts", () => {
    expect(legacySessionArgument(true, "abc", "1234-5678")).toBe(
      "token:abc:12345678",
    );
    expect(legacySessionArgument(false, "0", "1234-5678")).toBe("-");
  });
});

describe("materializeLegacyAssets", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await fs.remove(dir);
  });

  it("copies objects under their names once and refuses paths outside the target", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-assets-"));
    const objects = path.join(dir, "objects");
    const hash = "ab".padEnd(40, "0");
    await fs.outputFile(path.join(objects, "ab", hash), "sound");
    const index = {
      objects: {
        "sound/random/click.ogg": { hash, size: 5 },
        "../escape.ogg": { hash, size: 5 },
        "missing.ogg": { hash: "cd".padEnd(40, "0"), size: 1 },
      },
    };
    const target = path.join(dir, "resources");

    expect(await materializeLegacyAssets(index, objects, target)).toBe(1);
    expect(
      await fs.readFile(path.join(target, "sound/random/click.ogg"), "utf8"),
    ).toBe("sound");
    expect(await fs.pathExists(path.join(dir, "escape.ogg"))).toBe(false);
    expect(await materializeLegacyAssets(index, objects, target)).toBe(0);
  });
});

describe("usesLegacyWorkDir", () => {
  it("matches the positional pre-1.6 arguments only", () => {
    expect(
      usesLegacyWorkDir(
        "${auth_player_name} ${auth_session} --gameDir ${game_directory}",
      ),
    ).toBe(true);
    expect(
      usesLegacyWorkDir(
        "--username ${auth_player_name} --session ${auth_session}",
      ),
    ).toBe(false);
    expect(usesLegacyWorkDir(undefined)).toBe(false);
  });
});

describe("prepareLegacyHome", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await fs.remove(dir);
  });

  it("points the default game folder of old Minecraft at the instance", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-home-"));
    const gameDir = path.join(dir, "minecraft", "versions", "Vanilla 1.5.2");
    const other = path.join(dir, "minecraft", "versions", "Other");
    await fs.ensureDir(gameDir);
    await fs.ensureDir(other);
    await fs.outputFile(path.join(gameDir, "options.txt"), "lang:ru_RU");

    const first = await prepareLegacyHome({
      dataRoot: dir,
      gameDir,
      homeDir: dir,
    });
    const home =
      process.platform === "win32"
        ? first?.env.APPDATA
        : first?.jvm[0].replace("-Duser.home=", "");
    expect(home).toBeTruthy();
    const defaultDir =
      process.platform === "darwin"
        ? path.join(home!, "Library", "Application Support", "minecraft")
        : path.join(home!, ".minecraft");
    expect(
      await fs.readFile(path.join(defaultDir, "options.txt"), "utf8"),
    ).toBe("lang:ru_RU");

    await fs.unlink(defaultDir);
    await fs.symlink(other, defaultDir, "junction");
    await prepareLegacyHome({ dataRoot: dir, gameDir, homeDir: dir });
    expect(await fs.pathExists(path.join(defaultDir, "options.txt"))).toBe(
      true,
    );
  });

  it("leaves a real folder alone instead of replacing it", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-home-"));
    const gameDir = path.join(dir, "game");
    await fs.ensureDir(gameDir);
    const first = await prepareLegacyHome({
      dataRoot: dir,
      gameDir,
      homeDir: dir,
    });
    const home =
      process.platform === "win32"
        ? first!.env.APPDATA
        : first!.jvm[0].replace("-Duser.home=", "");
    const defaultDir =
      process.platform === "darwin"
        ? path.join(home, "Library", "Application Support", "minecraft")
        : path.join(home, ".minecraft");
    await fs.unlink(defaultDir);
    await fs.outputFile(path.join(defaultDir, "saves", "world"), "keep");

    expect(
      await prepareLegacyHome({ dataRoot: dir, gameDir, homeDir: dir }),
    ).toBeNull();
    expect(
      await fs.readFile(path.join(defaultDir, "saves", "world"), "utf8"),
    ).toBe("keep");
  });
});

describe("legacyHomeBase", () => {
  it("keeps Windows homes in the user profile, outside AppData", () => {
    expect(legacyHomeBase("C:/data", "win32", "C:/Users/steve")).toBe(
      path.join("C:/Users/steve", ".grubie-legacy-home"),
    );
  });

  it("falls back to the data folder for non-ASCII profiles and other systems", () => {
    expect(legacyHomeBase("C:/data", "win32", "C:/Users/Иван")).toBe(
      path.join("C:/data", "launch", "legacy-home"),
    );
    expect(legacyHomeBase("/data", "linux", "/home/steve")).toBe(
      path.join("/data", "launch", "legacy-home"),
    );
  });
});

describe("prepareLegacyHome cleanup", () => {
  let dir = "";
  afterEach(async () => {
    if (dir) await fs.remove(dir);
  });

  it("drops homes of deleted instances without touching anything else", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "legacy-home-"));
    const gone = path.join(dir, "versions", "Gone");
    const kept = path.join(dir, "versions", "Kept");
    await fs.ensureDir(gone);
    await fs.ensureDir(kept);
    await fs.outputFile(path.join(kept, "saves", "w"), "keep");

    await prepareLegacyHome({ dataRoot: dir, gameDir: gone, homeDir: dir });
    const base = legacyHomeBase(dir, process.platform, dir);
    expect((await fs.readdir(base)).length).toBe(1);

    await fs.remove(gone);
    await prepareLegacyHome({ dataRoot: dir, gameDir: kept, homeDir: dir });

    expect((await fs.readdir(base)).length).toBe(1);
    expect(await fs.readFile(path.join(kept, "saves", "w"), "utf8")).toBe(
      "keep",
    );
  });
});
