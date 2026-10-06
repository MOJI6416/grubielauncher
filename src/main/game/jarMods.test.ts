import os from "os";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IVersionConf } from "@/types/IVersion";
import { classifyError } from "@/shared/errors";
import {
  PATCHED_JAR_FOLDER,
  gameJarInputs,
  importJarMods,
  jarModDownloads,
  normalizeEntryName,
  prepareGameJar,
  removeUnusedJarModFiles,
} from "./jarMods";
import { BTA_VANILLA_JAR } from "@/shared/btaLoader";

let root: string;

function writeZip(target: string, entries: Record<string, string>) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  fs.ensureDirSync(path.dirname(target));
  zip.writeZip(target);
}

function readZip(target: string): Record<string, string> {
  const zip = new AdmZip(target);
  return Object.fromEntries(
    zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => [entry.entryName, entry.getData().toString()]),
  );
}

function conf(extra: Partial<IVersionConf> = {}): IVersionConf {
  return {
    name: "Old",
    loader: { name: "vanilla", mods: [] },
    version: { id: "b1.7.3", type: "old_beta", url: "", serverManager: false },
    build: 0,
    downloadedVersion: false,
    lastUpdate: new Date(0),
    runArguments: { game: "", jvm: "" },
    image: "",
    ...extra,
  };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "jarmods-"));
  writeZip(path.join(root, "b1.7.3.jar"), {
    "a.class": "vanilla-a",
    "b.class": "vanilla-b",
    "META-INF/MANIFEST.MF": "signed",
    "META-INF/MOJANG_C.SF": "sig",
  });
  writeZip(path.join(root, "jarmods", "first.zip"), {
    "a.class": "first-a",
    "c.class": "first-c",
  });
  writeZip(path.join(root, "jarmods", "second.jar"), {
    "c.class": "second-c",
    "META-INF/MANIFEST.MF": "mod",
    "META-INF/services/x": "service",
  });
});

afterEach(async () => {
  await fs.remove(root);
});

describe("normalizeEntryName", () => {
  it("turns backslashes into slashes and refuses parent hops", () => {
    expect(normalizeEntryName("net\\minecraft\\a.class")).toBe(
      "net/minecraft/a.class",
    );
    expect(normalizeEntryName("../evil.class")).toBeNull();
  });
});

describe("gameJarInputs", () => {
  it("uses the vanilla jar unless a replacement is enabled", () => {
    expect(gameJarInputs(conf()).base).toBe("b1.7.3.jar");
    expect(
      gameJarInputs(
        conf({ mainJar: { file: "custom.jar", name: "BTA", enabled: true } }),
      ).base,
    ).toBe(path.join("jarmods", "custom.jar"));
    expect(
      gameJarInputs(
        conf({ mainJar: { file: "custom.jar", name: "BTA", enabled: false } }),
      ).base,
    ).toBe("b1.7.3.jar");
  });

  it("refuses file names that leave the jar mods folder", () => {
    expect(() =>
      gameJarInputs(
        conf({ jarMods: [{ file: "../x.jar", name: "x", enabled: true }] }),
      ),
    ).toThrow();
  });
});

describe("prepareGameJar", () => {
  it("returns the vanilla jar untouched without enabled jar mods", async () => {
    expect(
      await prepareGameJar(
        root,
        conf({
          jarMods: [{ file: "first.zip", name: "first", enabled: false }],
        }),
      ),
    ).toBe("b1.7.3.jar");
  });

  it("merges jar mods over the game, the lower one wins, signatures go", async () => {
    const relative = await prepareGameJar(
      root,
      conf({
        jarMods: [
          { file: "first.zip", name: "first", enabled: true },
          { file: "second.jar", name: "second", enabled: true },
        ],
      }),
    );

    expect(relative.startsWith(PATCHED_JAR_FOLDER)).toBe(true);
    expect(readZip(path.join(root, relative))).toEqual({
      "a.class": "first-a",
      "b.class": "vanilla-b",
      "c.class": "second-c",
      "META-INF/services/x": "service",
    });
  });

  it("reuses the patched jar and rebuilds when the order changes", async () => {
    const mods = [
      { file: "first.zip", name: "first", enabled: true },
      { file: "second.jar", name: "second", enabled: true },
    ];
    const first = await prepareGameJar(root, conf({ jarMods: mods }));
    expect(await prepareGameJar(root, conf({ jarMods: mods }))).toBe(first);

    const swapped = await prepareGameJar(
      root,
      conf({ jarMods: [...mods].reverse() }),
    );
    expect(swapped).not.toBe(first);
    expect(readZip(path.join(root, swapped))["c.class"]).toBe("first-c");
    expect(await fs.readdir(path.join(root, PATCHED_JAR_FOLDER))).toEqual([
      path.basename(swapped),
    ]);
  });

  it("builds over a replacement jar", async () => {
    writeZip(path.join(root, "jarmods", "custom.jar"), {
      "a.class": "custom-a",
    });

    const relative = await prepareGameJar(
      root,
      conf({
        mainJar: { file: "custom.jar", name: "custom", enabled: true },
        jarMods: [{ file: "second.jar", name: "second", enabled: true }],
      }),
    );

    expect(readZip(path.join(root, relative))).toEqual({
      "a.class": "custom-a",
      "c.class": "second-c",
      "META-INF/services/x": "service",
    });
  });

  it("names the missing file instead of launching without it", async () => {
    const error = await prepareGameJar(
      root,
      conf({
        jarMods: [{ file: "gone.jar", name: "Gone.zip", enabled: true }],
      }),
    ).catch((caught: unknown) => caught);

    expect(String(error)).toContain("Gone.zip");
    expect(classifyError(error).cause).toBe("fileMissing");
  });
});

describe("Better than Adventure", () => {
  const bta = (extra: Partial<IVersionConf> = {}) =>
    conf({
      loader: {
        name: "bta-babric",
        mods: [],
        version: { id: "v8.0.1", url: "" },
      },
      ...extra,
    });

  it("lays the BTA client over the official b1.7.3 jar", () => {
    const inputs = gameJarInputs(bta());

    expect(inputs.base).toBe(BTA_VANILLA_JAR);
    expect(inputs.mods).toEqual(["b1.7.3.jar"]);
  });

  it("keeps vanilla classes BTA does not replace and lets user jar mods win", async () => {
    writeZip(path.join(root, BTA_VANILLA_JAR), {
      "a.class": "vanilla-a",
      "paulscode/sound/Library.class": "vanilla-sound",
      "META-INF/MOJANG_C.SF": "sig",
    });
    writeZip(path.join(root, "b1.7.3.jar"), {
      "a.class": "bta-a",
      "c.class": "bta-c",
    });

    const relative = await prepareGameJar(
      root,
      bta({ jarMods: [{ file: "first.zip", name: "first", enabled: true }] }),
    );

    expect(readZip(path.join(root, relative))).toEqual({
      "a.class": "first-a",
      "c.class": "first-c",
      "paulscode/sound/Library.class": "vanilla-sound",
    });
  });

  it("names the missing official jar", async () => {
    await expect(prepareGameJar(root, bta())).rejects.toThrow(
      "Jar mod file is missing: Minecraft b1.7.3",
    );
  });
});

describe("importJarMods", () => {
  it("copies archives under fresh names and keeps the original name", async () => {
    const source = path.join(root, "downloads", "ModLoader B1.7.3.zip");
    writeZip(source, { "ModLoader.class": "x" });

    const [imported] = await importJarMods(root, [source]);

    expect(imported.name).toBe("ModLoader B1.7.3.zip");
    expect(imported.enabled).toBe(true);
    expect(imported.file).toMatch(/^[0-9a-f-]+\.zip$/);
    expect(await fs.pathExists(path.join(root, "jarmods", imported.file))).toBe(
      true,
    );
  });

  it("refuses files that are not archives", async () => {
    const source = path.join(root, "notes.jar");
    await fs.writeFile(source, "plain text");

    const error = await importJarMods(root, [source]).catch(
      (caught: unknown) => caught,
    );

    expect(String(error)).toContain("notes.jar");
    expect(classifyError(error).cause).toBe("archive");
  });
});

describe("published jar mods", () => {
  const url = "https://cdn.grubielauncher.com/modpacks/abc/jarmods/";

  it("downloads only the published files that are missing", async () => {
    const items = await jarModDownloads(root, {
      jarMods: [
        {
          file: "first.zip",
          name: "first",
          enabled: true,
          url: `${url}first.zip`,
        },
        {
          file: "new.jar",
          name: "new",
          enabled: true,
          url: `${url}new.jar`,
          sha1: "s",
          size: 3,
        },
        { file: "local.jar", name: "local", enabled: true },
        {
          file: "evil.jar",
          name: "evil",
          enabled: true,
          url: "https://example.com/evil.jar",
        },
      ],
      mainJar: {
        file: "main.jar",
        name: "main",
        enabled: true,
        url: `${url}main.jar`,
      },
    });

    expect(items).toEqual([
      {
        url: `${url}new.jar`,
        destination: path.join(root, "jarmods", "new.jar"),
        sha1: "s",
        size: 3,
        group: "jarmods",
      },
      expect.objectContaining({
        url: `${url}main.jar`,
        destination: path.join(root, "jarmods", "main.jar"),
      }),
    ]);
  });

  it("refuses a published file name that leaves the folder", async () => {
    await expect(
      jarModDownloads(root, {
        jarMods: [
          { file: "../x.jar", name: "x", enabled: true, url: `${url}x.jar` },
        ],
      }),
    ).rejects.toThrow();
  });

  it("removes files the build no longer uses", async () => {
    await removeUnusedJarModFiles(root, {
      jarMods: [{ file: "second.jar", name: "second", enabled: false }],
    });

    expect(await fs.readdir(path.join(root, "jarmods"))).toEqual([
      "second.jar",
    ]);
  });
});
