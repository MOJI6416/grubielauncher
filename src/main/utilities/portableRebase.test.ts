import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, describe, expect, it } from "vitest";
import {
  rebasePortableData,
  rebaseString,
  rebaseValue,
  rebaseWindowsPath,
} from "./portableRebase";

const FROM = "E:\\Grubie\\data";
const TO = "F:\\Games\\Grubie\\data";

describe("rebasing stored paths after the drive letter changed", () => {
  it("moves plain Windows paths that start inside the old root", () => {
    expect(
      rebaseWindowsPath("e:\\grubie\\data\\.grubielauncher\\java", FROM, TO),
    ).toBe("F:\\Games\\Grubie\\data\\.grubielauncher\\java");
    expect(rebaseWindowsPath(FROM, FROM, TO)).toBe(TO);
    expect(rebaseWindowsPath("E:\\Grubie\\database\\x", FROM, TO)).toBeNull();
    expect(rebaseWindowsPath("C:\\Users\\me", FROM, TO)).toBeNull();
  });

  it("moves file URLs and keeps their query", () => {
    expect(
      rebaseString(
        "file:///E:/Grubie/data/.grubielauncher/minecraft/versions/My%20Pack/logo.png?v=3",
        FROM,
        TO,
      ),
    ).toBe(
      "file:///F:/Games/Grubie/data/.grubielauncher/minecraft/versions/My%20Pack/logo.png?v=3",
    );
  });

  it("moves app media URLs of mod icons", () => {
    const icon = `app://media/?p=${encodeURIComponent(
      "E:\\Grubie\\data\\.grubielauncher\\cache\\mod-icons\\a b.png",
    )}`;

    expect(rebaseString(icon, FROM, TO)).toBe(
      `app://media/?p=${encodeURIComponent(
        "F:\\Games\\Grubie\\data\\.grubielauncher\\cache\\mod-icons\\a b.png",
      )}`,
    );
  });

  it("leaves unrelated strings and urls alone", () => {
    expect(rebaseString("https://cdn.modrinth.com/x.png", FROM, TO)).toBeNull();
    expect(rebaseString("Fabric", FROM, TO)).toBeNull();
    expect(rebaseString("file:///C:/Users/me/x.png", FROM, TO)).toBeNull();
  });

  it("walks nested JSON and reports whether anything changed", () => {
    const jar = "\\.grubielauncher\\minecraft\\versions\\A\\mods\\x.jar";
    const value = {
      image:
        "file:///E:/Grubie/data/.grubielauncher/minecraft/versions/A/logo.png",
      loader: {
        mods: [
          { files: [{ localPath: `${FROM}${jar}` }] },
          { url: "https://example.com/y.jar" },
        ],
      },
      count: 2,
    };

    const result = rebaseValue(value, FROM, TO);

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      image:
        "file:///F:/Games/Grubie/data/.grubielauncher/minecraft/versions/A/logo.png",
      loader: {
        mods: [
          { files: [{ localPath: `${TO}${jar}` }] },
          { url: "https://example.com/y.jar" },
        ],
      },
      count: 2,
    });
    expect(rebaseValue({ a: "b" }, FROM, TO).changed).toBe(false);
  });
});

describe("rebasePortableData", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await fs.remove(dir);
    dir = "";
  });

  it("rewrites launcher files once the data folder shows up on another drive", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-portable-"));
    const userData = path.join(dir, "grubie-launcher");
    const dataRoot = path.join(dir, ".grubielauncher");
    const instance = path.join(dataRoot, "minecraft", "versions", "Pack");
    const logo = (root: string) =>
      `file:///${root.replace(/\\/g, "/")}/.grubielauncher/minecraft/versions/Pack/logo.png`;

    await fs.outputJSON(path.join(userData, "portable-root.json"), {
      root: FROM,
    });
    await fs.outputFile(
      path.join(instance, "version.json"),
      `${JSON.stringify({ image: logo(FROM) }, null, 2)}\n`,
    );
    await fs.outputJSON(
      path.join(
        instance,
        "storage",
        "modpack",
        "rollback",
        "1",
        "snapshot.json",
      ),
      { conf: { image: logo(FROM) } },
    );
    await fs.outputJSON(path.join(dataRoot, "themes", "themes.json"), {
      backdrop: { path: `${FROM}\\.grubielauncher\\themes\\backdrops\\a.webp` },
    });
    await fs.outputJSON(path.join(instance, "config", "mod.json"), {
      path: `${FROM}\\x`,
    });

    const result = await rebasePortableData({ root: TO, dataRoot, userData });

    expect(result).toEqual({ from: FROM, files: 3 });
    expect(await fs.readFile(path.join(instance, "version.json"), "utf8")).toBe(
      `${JSON.stringify({ image: logo(TO) }, null, 2)}\n`,
    );
    expect(
      await fs.readJSON(
        path.join(
          instance,
          "storage",
          "modpack",
          "rollback",
          "1",
          "snapshot.json",
        ),
      ),
    ).toEqual({ conf: { image: logo(TO) } });
    expect(
      (await fs.readJSON(path.join(dataRoot, "themes", "themes.json"))).backdrop
        .path,
    ).toBe(`${TO}\\.grubielauncher\\themes\\backdrops\\a.webp`);
    expect(
      (await fs.readJSON(path.join(instance, "config", "mod.json"))).path,
    ).toBe(`${FROM}\\x`);
    expect(
      await fs.readJSON(path.join(userData, "portable-root.json")),
    ).toEqual({ root: TO });

    expect(await rebasePortableData({ root: TO, dataRoot, userData })).toEqual({
      from: TO,
      files: 0,
    });
  });

  it("only remembers the root on the first portable start", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-portable-"));
    const userData = path.join(dir, "grubie-launcher");

    expect(
      await rebasePortableData({
        root: TO,
        dataRoot: path.join(dir, ".grubielauncher"),
        userData,
      }),
    ).toEqual({ from: null, files: 0 });
    expect(
      await fs.readJSON(path.join(userData, "portable-root.json")),
    ).toEqual({ root: TO });
  });
});
