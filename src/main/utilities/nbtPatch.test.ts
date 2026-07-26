import { describe, expect, it } from "vitest";
import { deserialize } from "@xmcl/nbt";
import { patchNbtString, readNbtString } from "./nbtPatch";

function tagName(name: string): Buffer {
  const encoded = Buffer.from(name, "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(encoded.length, 0);
  return Buffer.concat([length, encoded]);
}

function stringTag(name: string, value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  const length = Buffer.alloc(2);
  length.writeUInt16BE(encoded.length, 0);
  return Buffer.concat([
    Buffer.from([0x08]),
    tagName(name),
    length,
    encoded,
  ]);
}

function byteTag(name: string, value: number): Buffer {
  return Buffer.concat([
    Buffer.from([0x01]),
    tagName(name),
    Buffer.from([value]),
  ]);
}

function makeLevelDat(name: string): Buffer {
  const data = Buffer.concat([
    Buffer.from([0x0a]),
    tagName("Data"),
    stringTag("LevelName", name),
    byteTag("Difficulty", 2),
    byteTag("allowCommands", 1),
    Buffer.from([0x00]),
  ]);

  return Buffer.concat([
    Buffer.from([0x0a]),
    tagName(""),
    data,
    Buffer.from([0x00]),
  ]);
}

describe("patchNbtString", () => {
  it("replaces the value in place and keeps the tag readable", () => {
    const patched = patchNbtString(
      makeLevelDat("Old world"),
      "LevelName",
      "New world",
    );

    expect(patched).not.toBeNull();
    expect(readNbtString(patched as Buffer, "LevelName")).toBe("New world");
  });

  it("survives a longer name by resizing the payload", async () => {
    const longName = "very long world name with unicode: мир";
    const patched = patchNbtString(makeLevelDat("a"), "LevelName", longName);

    expect(readNbtString(patched as Buffer, "LevelName")).toBe(longName);

    const parsed: any = await deserialize(patched as Buffer);
    expect(parsed.Data.LevelName).toBe(longName);
  });

  it("keeps every sibling tag intact", async () => {
    const patched = patchNbtString(
      makeLevelDat("Old world"),
      "LevelName",
      "Renamed",
    );

    const parsed: any = await deserialize(patched as Buffer);
    expect(parsed.Data.LevelName).toBe("Renamed");
    expect(parsed.Data.Difficulty).toBe(2);
    expect(parsed.Data.allowCommands).toBe(1);
  });

  it("returns null instead of corrupting an unknown layout", () => {
    expect(patchNbtString(makeLevelDat("x"), "NoSuchTag", "y")).toBeNull();
    expect(patchNbtString(Buffer.alloc(4), "LevelName", "y")).toBeNull();
  });
});
