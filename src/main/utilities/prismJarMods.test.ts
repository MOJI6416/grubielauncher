import os from "os";
import path from "path";
import fs from "fs-extra";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readPrismJarMods } from "./prismJarMods";

let root: string;
let overrides: string;

async function patch(uid: string, body: unknown) {
  await fs.outputJSON(path.join(root, "patches", `${uid}.json`), body);
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "prism-jarmods-"));
  overrides = path.join(root, "overrides");
});

afterEach(async () => {
  await fs.remove(root);
});

describe("readPrismJarMods", () => {
  it("copies jar mods in component order and keeps disabled ones off", async () => {
    await fs.outputFile(path.join(root, "jarmods", "aaa.jar"), "first");
    await fs.outputFile(path.join(root, "jarmods", "bbb.jar"), "second");
    await patch("org.multimc.jarmod.aaa", {
      jarMods: [
        {
          "MMC-displayname": "mcdiverge.zip",
          "MMC-filename": "aaa.jar",
          name: "org.multimc.jarmods:aaa:1",
        },
      ],
    });
    await patch("org.multimc.jarmod.bbb", {
      "+jarMods": [{ name: "org.multimc.jarmods:bbb:1" }],
    });

    const result = await readPrismJarMods(
      root,
      [
        { uid: "net.minecraft", version: "a1.1.2_01" },
        { uid: "org.multimc.jarmod.aaa", cachedName: "mcdiverge (jar mod)" },
        { uid: "org.multimc.jarmod.bbb", cachedName: "Second", disabled: true },
      ],
      overrides,
    );

    expect(result.jarMods.map(({ name, enabled }) => ({ name, enabled }))).toEqual([
      { name: "mcdiverge.zip", enabled: true },
      { name: "Second", enabled: false },
    ]);
    expect(
      await fs.readFile(path.join(overrides, "jarmods", result.jarMods[1].file), "utf-8"),
    ).toBe("second");
    expect(result.btaVersion).toBeUndefined();
  });

  it("imports the replaced Minecraft.jar from the instance libraries", async () => {
    await fs.outputFile(path.join(root, "libraries", "customjar-1.jar"), "custom");
    await patch("customjar", {
      mainJar: { "MMC-hint": "local", name: "org.multimc:customjar:1" },
    });

    const result = await readPrismJarMods(
      root,
      [{ uid: "customjar", cachedName: "Replaced Minecraft.jar" }],
      overrides,
    );

    expect(result.mainJar?.name).toBe("Replaced Minecraft.jar");
    expect(
      await fs.readFile(path.join(overrides, "jarmods", result.mainJar!.file), "utf-8"),
    ).toBe("custom");
  });

  it("recognises BTA instances by the patch version, not the stale cached one", async () => {
    await patch("custom.jarmod.bta", {
      version: "v8.0.1",
      jarMods: [{ name: "net.betterthanadventure:bta-client:v8.0.1:client" }],
    });

    const result = await readPrismJarMods(
      root,
      [{ uid: "custom.jarmod.bta", cachedVersion: "v8.0-pre2" }],
      overrides,
    );

    expect(result.btaVersion).toBe("v8.0.1");
    expect(result.jarMods).toEqual([]);
  });

  it("adds the v prefix the 7.3 instances leave out", async () => {
    await fs.outputFile(path.join(root, "jarmods", "bta.jar"), "bta");
    await patch("org.multimc.jarmod.bta", {
      version: "7.3_04",
      jarMods: [{ "MMC-filename": "bta.jar", name: "org.multimc.jarmods:bta:1" }],
    });

    const result = await readPrismJarMods(
      root,
      [{ uid: "org.multimc.jarmod.bta" }],
      overrides,
    );

    expect(result.btaVersion).toBe("v7.3_04");
    expect(result.jarMods).toEqual([]);
  });

  it("keeps an old BTA as an ordinary jar mod", async () => {
    await fs.outputFile(path.join(root, "jarmods", "bta.jar"), "bta");
    await patch("org.multimc.jarmod.bta", {
      version: "1.7.7.0_02",
      jarMods: [{ "MMC-filename": "bta.jar", name: "custom.jarmods:bta:1" }],
    });

    const result = await readPrismJarMods(
      root,
      [{ uid: "org.multimc.jarmod.bta", cachedName: "Better than Adventure!" }],
      overrides,
    );

    expect(result.btaVersion).toBeUndefined();
    expect(result.jarMods.map((mod) => mod.name)).toEqual(["Better than Adventure!"]);
  });

  it("ignores file names that try to leave the instance", async () => {
    await fs.outputFile(path.join(root, "secret.jar"), "x");
    await patch("org.multimc.jarmod.evil", {
      jarMods: [{ "MMC-filename": "../secret.jar", name: "a:b:1" }],
    });

    const result = await readPrismJarMods(
      root,
      [{ uid: "org.multimc.jarmod.evil" }, { uid: "../../patches" }],
      overrides,
    );

    expect(result.jarMods).toEqual([]);
  });
});
