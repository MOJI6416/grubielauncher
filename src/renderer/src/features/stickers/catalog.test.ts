import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  STICKER_PACKS,
  STICKER_VALUE_PATTERN,
  findSticker,
  stickerValue,
} from "./catalog";
import { hasStickerData, stickerPoster } from "./stickerData";

const ASSETS = path.resolve(__dirname, "../../assets/stickers");

describe("sticker catalog", () => {
  it("ships an animation for every sticker and no stray files", () => {
    for (const pack of STICKER_PACKS) {
      const files = fs
        .readdirSync(path.join(ASSETS, pack.id))
        .filter((file) => file.endsWith(".json"))
        .map((file) => file.slice(0, -".json".length))
        .sort();
      expect(pack.items.map((item) => item.id).sort()).toEqual(files);
      for (const item of pack.items) {
        expect(hasStickerData(item)).toBe(true);
        expect(stickerPoster(item)).toBeTruthy();
      }
    }
  });

  it("builds values the server accepts", () => {
    for (const pack of STICKER_PACKS) {
      for (const item of pack.items) {
        expect(STICKER_VALUE_PATTERN.test(stickerValue(item))).toBe(true);
      }
    }
  });

  it("finds a sticker by its message value", () => {
    expect(findSticker("noto/1f602")?.emoji).toBe("😂");
    expect(findSticker("noto/2764_fe0f")?.emoji).toBe("❤️");
    expect(findSticker("noto/ffff")).toBeNull();
    expect(findSticker("other/1f602")).toBeNull();
  });

  it("has no duplicates", () => {
    const values = STICKER_PACKS.flatMap((pack) => pack.items.map(stickerValue));
    expect(new Set(values).size).toBe(values.length);
  });
});
