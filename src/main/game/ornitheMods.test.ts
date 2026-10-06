import os from "os";
import path from "path";
import fs from "fs-extra";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/Versions", () => ({ VersionsService: {} }));
vi.mock("../utilities/downloader", () => ({ Downloader: class {} }));

import { checkOrnitheMods, classifyGeneration } from "./ornitheMods";
import { mavenJarPath } from "./profileLoaderManifest";

const GEN1 = "net.ornithemc:calamus-intermediary:1.12.2";
const GEN2 = "net.ornithemc:calamus-intermediary-gen2:1.12.2";

const GEN1_CLASSES = [
  "1000001",
  "1000002",
  "1000003",
  "1000004",
  "1000005",
  "1000006",
];
const GEN2_CLASSES = [
  "2000001",
  "2000002",
  "2000003",
  "2000004",
  "2000005",
  "2000006",
];

let root: string;
let librariesPath: string;
let modsPath: string;

function zipBuffer(entries: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(
      name,
      Buffer.isBuffer(content) ? content : Buffer.from(content),
    );
  }
  return zip.toBuffer();
}

function writeZip(target: string, entries: Record<string, string | Buffer>) {
  fs.ensureDirSync(path.dirname(target));
  fs.writeFileSync(target, zipBuffer(entries));
}

function classRefs(ids: string[]): string {
  return ids.map((id) => `Lnet/minecraft/unmapped/C_${id};`).join("\u0000");
}

function writeMapping(library: string, ids: string[]): string {
  const target = path.join(librariesPath, mavenJarPath(library));
  const lines = ids.map(
    (id, index) =>
      `CLASS\t${String.fromCharCode(97 + index)}\tnet/minecraft/unmapped/C_${id}`,
  );
  writeZip(target, {
    "mappings/mappings.tiny": ["v1\tofficial\tintermediary", ...lines].join(
      "\n",
    ),
  });
  return target;
}

function writeMod(file: string, name: string, ids: string[]) {
  const references = ids.map((id) => `Lnet/minecraft/unmapped/C_${id};`);
  writeZip(path.join(modsPath, file), {
    "fabric.mod.json": JSON.stringify({ id: file, name }),
    "com/example/Mixin.class": references.join("\u0000"),
    "example.refmap.json": JSON.stringify({ mappings: references }),
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ornithe-mods-"));
  librariesPath = path.join(root, "libraries");
  modsPath = path.join(root, "mods");
  await fs.ensureDir(modsPath);
});

afterEach(async () => {
  await fs.remove(root);
});

describe("checkOrnitheMods", () => {
  it("skips instances that do not run Ornithe", async () => {
    writeMod("tweak.jar", "Tweakeroo", GEN1_CLASSES);

    const result = await checkOrnitheMods({
      libraries: ["net.fabricmc:fabric-loader:0.19.5"],
      librariesPath,
      modsPath,
      loadMapping: async () => null,
    });

    expect(result).toBeNull();
  });

  it("accepts mods built for the installed generation", async () => {
    writeMapping(GEN2, GEN2_CLASSES);
    writeMod("menu.jar", "Mod Menu", GEN2_CLASSES);

    const result = await checkOrnitheMods({
      libraries: [GEN2],
      librariesPath,
      modsPath,
      loadMapping: async () => {
        throw new Error("other generation should not be needed");
      },
    });

    expect(result).toEqual({
      generation: 2,
      target: null,
      mismatched: [],
      compatible: ["Mod Menu"],
    });
  });

  it("names mods built for the other generation", async () => {
    writeMapping(GEN2, GEN2_CLASSES);
    const gen1 = writeMapping(GEN1, GEN1_CLASSES);
    writeMod("tweak.jar", "Tweakeroo", GEN1_CLASSES);
    writeMod("malilib.jar", "MaLiLib", GEN1_CLASSES);

    const requested: number[] = [];
    const result = await checkOrnitheMods({
      libraries: [GEN2],
      librariesPath,
      modsPath,
      loadMapping: async (generation) => {
        requested.push(generation);
        return gen1;
      },
    });

    expect(requested).toEqual([1]);
    expect(result).toEqual({
      generation: 2,
      target: 1,
      mismatched: ["MaLiLib", "Tweakeroo"],
      compatible: [],
    });
  });

  it("keeps compatible mods apart from mismatched ones", async () => {
    writeMapping(GEN1, GEN1_CLASSES);
    const gen2 = writeMapping(GEN2, GEN2_CLASSES);
    writeMod("old.jar", "Old", GEN1_CLASSES);
    writeMod("new.jar", "New", GEN2_CLASSES);

    const result = await checkOrnitheMods({
      libraries: [GEN1],
      librariesPath,
      modsPath,
      loadMapping: async () => gen2,
    });

    expect(result?.target).toBe(2);
    expect(result?.mismatched).toEqual(["New"]);
    expect(result?.compatible).toEqual(["Old"]);
  });

  it("ignores mods with too few game references to judge", async () => {
    writeMapping(GEN2, GEN2_CLASSES);
    writeMod("tiny.jar", "Tiny", GEN1_CLASSES.slice(0, 2));

    const result = await checkOrnitheMods({
      libraries: [GEN2],
      librariesPath,
      modsPath,
      loadMapping: async () => null,
    });

    expect(result).toEqual({
      generation: 2,
      target: null,
      mismatched: [],
      compatible: [],
    });
  });

  it("does not blame mods when the other mapping is unavailable", async () => {
    writeMapping(GEN2, GEN2_CLASSES);
    writeMod("tweak.jar", "Tweakeroo", GEN1_CLASSES);

    const result = await checkOrnitheMods({
      libraries: [GEN2],
      librariesPath,
      modsPath,
      loadMapping: async () => null,
    });

    expect(result?.target).toBeNull();
    expect(result?.mismatched).toEqual([]);
  });

  it("looks inside bundled jars", async () => {
    writeMapping(GEN1, GEN1_CLASSES);
    const gen2 = writeMapping(GEN2, GEN2_CLASSES);
    writeMod("tweak.jar", "Tweakeroo", GEN1_CLASSES);
    writeZip(path.join(modsPath, "osl.jar"), {
      "fabric.mod.json": JSON.stringify({
        id: "osl",
        name: "Ornithe Standard Libraries",
      }),
      "META-INF/jars/osl-config.jar": zipBuffer({
        "fabric.mod.json": JSON.stringify({ id: "osl-config" }),
        "osl/Config.class": classRefs(GEN2_CLASSES.slice(0, 3)),
      }),
      "META-INF/jars/osl-keybinds.jar": zipBuffer({
        "osl/Keybinds.class": classRefs(GEN2_CLASSES.slice(3)),
      }),
    });

    const result = await checkOrnitheMods({
      libraries: [GEN1],
      librariesPath,
      modsPath,
      loadMapping: async () => gen2,
    });

    expect(result).toEqual({
      generation: 1,
      target: 2,
      mismatched: ["Ornithe Standard Libraries"],
      compatible: ["Tweakeroo"],
    });
  });
});

describe("classifyGeneration", () => {
  const mappings = new Map([
    [1, new Set(GEN1_CLASSES.map((id) => `C_${id}`))],
    [2, new Set(GEN2_CLASSES.map((id) => `C_${id}`))],
  ]);
  const names = (ids: string[]) => new Set(ids.map((id) => `C_${id}`));

  it("names the generation a mod was built for", () => {
    expect(classifyGeneration(names(GEN1_CLASSES), mappings)).toBe(1);
    expect(classifyGeneration(names(GEN2_CLASSES), mappings)).toBe(2);
  });

  it("tolerates names from other game versions", () => {
    expect(
      classifyGeneration(
        names([...GEN2_CLASSES, "9000001", "9000002"]),
        mappings,
      ),
    ).toBe(2);
  });

  it("stays undecided for mixed or tiny samples", () => {
    expect(
      classifyGeneration(names([...GEN1_CLASSES, ...GEN2_CLASSES]), mappings),
    ).toBeNull();
    expect(
      classifyGeneration(names(GEN1_CLASSES.slice(0, 2)), mappings),
    ).toBeNull();
  });
});
