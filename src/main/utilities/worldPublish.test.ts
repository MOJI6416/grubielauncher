import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deserialize } from "@xmcl/nbt";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import os from "os";
import path from "path";
import zlib from "zlib";
import { isExcludedInstancePath } from "@/shared/instancePrivacy";
import { createZipArchive } from "./archiver";
import {
  collectSanitizedWorldEntries,
  sanitizeLevelDat,
  shouldSkipPublishEntry,
} from "./worldPublish";

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;

const WORLD_FOLDER = "Тестовый мир";
const PLAYER_UUID = "30d67d36-f877-40b1-920b-7179839b9f60";

function nbtName(value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(encoded.length, 0);
  return Buffer.concat([header, encoded]);
}

function tag(type: number, name: string, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([type]), nbtName(name), payload]);
}

function compound(...children: Buffer[]): Buffer {
  return Buffer.concat([...children, Buffer.from([TAG_END])]);
}

function intPayload(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function longPayload(value: bigint): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(value, 0);
  return buffer;
}

function floatPayload(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatBE(value, 0);
  return buffer;
}

function doublePayload(value: number): Buffer {
  const buffer = Buffer.alloc(8);
  buffer.writeDoubleBE(value, 0);
  return buffer;
}

function listPayload(itemType: number, items: Buffer[]): Buffer {
  const header = Buffer.alloc(5);
  header.writeUInt8(itemType, 0);
  header.writeInt32BE(items.length, 1);
  return Buffer.concat([header, ...items]);
}

function intArrayPayload(values: number[]): Buffer {
  const buffer = Buffer.alloc(4 + values.length * 4);
  buffer.writeInt32BE(values.length, 0);
  values.forEach((value, index) => buffer.writeInt32BE(value, 4 + index * 4));
  return buffer;
}

function byteArrayPayload(values: number[]): Buffer {
  return Buffer.concat([intPayload(values.length), Buffer.from(values)]);
}

function buildPlayerCompound(): Buffer {
  return compound(
    tag(TAG_FLOAT, "Health", floatPayload(17.5)),
    tag(TAG_INT, "XpLevel", intPayload(42)),
    tag(
      TAG_LIST,
      "Pos",
      listPayload(TAG_DOUBLE, [
        doublePayload(120.5),
        doublePayload(64),
        doublePayload(-31.25),
      ]),
    ),
    tag(
      TAG_LIST,
      "Inventory",
      listPayload(TAG_COMPOUND, [
        compound(
          tag(TAG_STRING, "id", nbtName("minecraft:diamond_sword")),
          tag(TAG_BYTE, "Count", Buffer.from([1])),
        ),
      ]),
    ),
    tag(TAG_BYTE_ARRAY, "SecretBytes", byteArrayPayload([1, 2, 3, 4])),
    tag(TAG_INT_ARRAY, "UUID", intArrayPayload([1, 2, 3, 4])),
  );
}

function buildLevelDat(withPlayer: boolean): Buffer {
  const dataChildren = [
    tag(TAG_INT, "DataVersion", intPayload(3953)),
    tag(TAG_STRING, "LevelName", nbtName(WORLD_FOLDER)),
    ...(withPlayer ? [tag(TAG_COMPOUND, "Player", buildPlayerCompound())] : []),
    tag(
      TAG_COMPOUND,
      "GameRules",
      compound(tag(TAG_STRING, "doFireTick", nbtName("false"))),
    ),
    tag(TAG_LONG, "Time", longPayload(123456789n)),
    tag(TAG_BYTE, "hardcore", Buffer.from([0])),
    tag(
      TAG_COMPOUND,
      "Version",
      compound(
        tag(TAG_INT, "Id", intPayload(3953)),
        tag(TAG_STRING, "Name", nbtName("1.21")),
      ),
    ),
  ];

  const root = Buffer.concat([
    Buffer.from([TAG_COMPOUND]),
    nbtName(""),
    compound(tag(TAG_COMPOUND, "Data", compound(...dataChildren))),
  ]);

  return zlib.gzipSync(root);
}

let root = "";
let instancePath = "";
let worldPath = "";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "grubie-world-publish-"));
  instancePath = path.join(root, "instance");
  worldPath = path.join(instancePath, "saves", WORLD_FOLDER);

  await fs.ensureDir(path.join(worldPath, "region"));
  await fs.ensureDir(path.join(worldPath, "playerdata"));
  await fs.ensureDir(path.join(worldPath, "stats"));
  await fs.ensureDir(path.join(worldPath, "advancements"));
  await fs.ensureDir(path.join(instancePath, "config"));

  await fs.writeFile(path.join(worldPath, "level.dat"), buildLevelDat(true));
  await fs.writeFile(path.join(worldPath, "level.dat_old"), buildLevelDat(true));
  await fs.writeFile(path.join(worldPath, "session.lock"), "lock");
  await fs.writeFile(
    path.join(worldPath, "region", "r.0.0.mca"),
    "region-bytes",
  );
  await fs.writeFile(
    path.join(worldPath, "playerdata", PLAYER_UUID + ".dat"),
    "player-nbt",
  );
  await fs.writeFile(path.join(worldPath, "stats", PLAYER_UUID + ".json"), "{}");
  await fs.writeFile(
    path.join(worldPath, "advancements", PLAYER_UUID + ".json"),
    "{}",
  );
  await fs.writeFile(path.join(instancePath, "config", "mod.toml"), "a=1");
});

afterAll(async () => {
  await fs.remove(root);
});

async function readLevelDatFromZip(zipPath: string, entryName: string) {
  const entry = new AdmZip(zipPath).getEntry(entryName);
  if (!entry) throw new Error("missing archive entry " + entryName);
  const raw = entry.getData();
  return (await deserialize(new Uint8Array(zlib.gunzipSync(raw)))) as any;
}

function entryNames(zipPath: string): string[] {
  return new AdmZip(zipPath)
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName);
}

async function archiveForPublish(zipPath: string, files: string[]) {
  const extras = await collectSanitizedWorldEntries(files, instancePath);
  await createZipArchive(
    files,
    zipPath,
    instancePath,
    undefined,
    shouldSkipPublishEntry,
    extras,
  );
}

async function archiveForExport(zipPath: string, files: string[]) {
  await createZipArchive(
    files,
    zipPath,
    instancePath,
    undefined,
    isExcludedInstancePath,
  );
}

describe("publishing a world", () => {
  it("drops personal files and the Player compound", async () => {
    const zipPath = path.join(root, "publish.zip");
    await archiveForPublish(zipPath, [
      path.join(instancePath, "saves"),
      path.join(instancePath, "config"),
    ]);

    const names = entryNames(zipPath);

    expect(names).toContain("saves/" + WORLD_FOLDER + "/region/r.0.0.mca");
    expect(names).toContain("saves/" + WORLD_FOLDER + "/level.dat");
    expect(names).toContain("config/mod.toml");

    expect(names.filter((name) => name.includes("playerdata"))).toEqual([]);
    expect(names.filter((name) => name.includes("/stats/"))).toEqual([]);
    expect(names.filter((name) => name.includes("/advancements/"))).toEqual([]);
    expect(names.filter((name) => name.endsWith("session.lock"))).toEqual([]);

    for (const levelFile of ["level.dat", "level.dat_old"]) {
      const level = await readLevelDatFromZip(
        zipPath,
        "saves/" + WORLD_FOLDER + "/" + levelFile,
      );
      expect(level.Data.Player, levelFile).toBeUndefined();
      expect(level.Data.LevelName).toBe(WORLD_FOLDER);
      expect(level.Data.DataVersion).toBe(3953);
      expect(level.Data.GameRules.doFireTick).toBe("false");
      expect(level.Data.Version.Name).toBe("1.21");
      expect(level.Data.hardcore).toBe(0);
    }
  });

  it("leaves the exported instance untouched", async () => {
    const zipPath = path.join(root, "export.zip");
    await archiveForExport(zipPath, [
      path.join(instancePath, "saves"),
      path.join(instancePath, "config"),
    ]);

    const names = entryNames(zipPath);

    expect(names).toContain(
      "saves/" + WORLD_FOLDER + "/playerdata/" + PLAYER_UUID + ".dat",
    );
    expect(names).toContain(
      "saves/" + WORLD_FOLDER + "/stats/" + PLAYER_UUID + ".json",
    );
    expect(names).toContain(
      "saves/" + WORLD_FOLDER + "/advancements/" + PLAYER_UUID + ".json",
    );
    expect(names).toContain("saves/" + WORLD_FOLDER + "/session.lock");

    const level = await readLevelDatFromZip(
      zipPath,
      "saves/" + WORLD_FOLDER + "/level.dat",
    );
    expect(level.Data.Player).toBeTruthy();
    expect(level.Data.Player.XpLevel).toBe(42);
    expect(level.Data.LevelName).toBe(WORLD_FOLDER);
  });
});

describe("sanitizeLevelDat", () => {
  it("keeps a world without a Player compound byte-identical", async () => {
    const original = buildLevelDat(false);
    expect(await sanitizeLevelDat(original)).toEqual(original);
  });

  it("returns unreadable data unchanged", async () => {
    const garbage = Buffer.from("not nbt at all");
    expect(await sanitizeLevelDat(garbage)).toEqual(garbage);
  });
});
