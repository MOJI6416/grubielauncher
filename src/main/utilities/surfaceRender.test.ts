import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import { PNG } from "pngjs";

const hoisted = vi.hoisted(() => {
  const root = process.env.TEMP || process.env.TMPDIR || "/tmp";
  return { base: `${root}/grubie-surface-${process.pid}-${Date.now()}` };
});

vi.mock("electron", () => ({
  app: { getPath: () => hoisted.base },
}));

import {
  clearSurfaceCache,
  renderRegionFile,
  renderRegionSurface,
  surfaceCacheDir,
} from "./surfaceRender";
import { REGION_PIXELS } from "./chunkSurface";
import {
  flatChunkNbt,
  localIndex,
  regionFile,
} from "./chunkFixtures.test-helpers";

const worldPath = path.join(hoisted.base, "saves", "World");
const dimension = "minecraft:overworld";

beforeEach(async () => {
  await fs.ensureDir(path.join(worldPath, "region"));
  await fs.outputFile(path.join(worldPath, "level.dat"), "level");
});

afterEach(async () => {
  await fs.remove(hoisted.base);
});

async function writeRegion(chunks: Parameters<typeof regionFile>[0]) {
  const target = path.join(worldPath, "region", "r.0.0.mca");
  await fs.writeFile(target, regionFile(chunks));
  return target;
}

describe("renderRegionSurface", () => {
  it("renders a PNG and caches it next to the launcher data", async () => {
    await writeRegion([
      { index: localIndex(0, 0), nbt: flatChunkNbt({ x: 0, z: 0 }) },
      {
        index: localIndex(2, 1),
        nbt: flatChunkNbt({
          x: 2,
          z: 1,
          sections: [{ y: 0, blocks: ["minecraft:sand"] }],
        }),
      },
    ]);

    const bytes = await renderRegionSurface(worldPath, dimension, 0, 0);
    expect(bytes).not.toBeNull();
    expect([...bytes!.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    const png = PNG.sync.read(Buffer.from(bytes!));
    expect(png.width).toBe(REGION_PIXELS);
    expect(png.height).toBe(REGION_PIXELS);

    const pixel = (x: number, z: number) => {
      const offset = (z * REGION_PIXELS + x) * 4;
      return [...png.data.subarray(offset, offset + 4)];
    };
    expect(pixel(0, 0)[3]).toBe(255);
    expect(pixel(2 * 16 + 3, 16 + 3)[3]).toBe(255);
    expect(pixel(2 * 16 + 3, 16 + 3)[0]).toBeGreaterThan(pixel(0, 0)[0]);
    expect(pixel(200, 200)[3]).toBe(0);

    const cacheDir = surfaceCacheDir(worldPath, dimension);
    const cached = await fs.readdir(cacheDir);
    expect(cached).toHaveLength(1);
    expect(cached[0]).toMatch(/^r\.0\.0\.\d+-\d+\.png$/);
    expect(
      cacheDir.startsWith(path.join(hoisted.base, ".grubielauncher", "cache")),
    ).toBe(true);
  });

  it("serves the cache until the region file changes", async () => {
    const target = await writeRegion([
      { index: localIndex(0, 0), nbt: flatChunkNbt({ x: 0, z: 0 }) },
    ]);
    const first = await renderRegionSurface(worldPath, dimension, 0, 0);
    const cacheDir = surfaceCacheDir(worldPath, dimension);
    const [cacheName] = await fs.readdir(cacheDir);

    await fs.writeFile(path.join(cacheDir, cacheName), Buffer.from("sentinel"));
    const second = await renderRegionSurface(worldPath, dimension, 0, 0);
    expect(Buffer.from(second!).toString()).toBe("sentinel");

    await fs.writeFile(
      target,
      regionFile([
        { index: localIndex(0, 0), nbt: flatChunkNbt({ x: 0, z: 0 }) },
        { index: localIndex(1, 0), nbt: flatChunkNbt({ x: 1, z: 0 }) },
      ]),
    );
    const third = await renderRegionSurface(worldPath, dimension, 0, 0);
    expect(Buffer.from(third!).toString()).not.toBe("sentinel");
    expect(third!.length).not.toBe(first!.length + 0.5);

    const names = await fs.readdir(cacheDir);
    expect(names).toHaveLength(1);
    expect(names[0]).not.toBe(cacheName);

    await clearSurfaceCache(worldPath, dimension);
    expect(await fs.pathExists(cacheDir)).toBe(false);
  });

  it("returns null for missing regions and bad dimensions", async () => {
    expect(await renderRegionSurface(worldPath, dimension, 5, 5)).toBeNull();
    expect(await renderRegionSurface(worldPath, "../escape", 0, 0)).toBeNull();
    expect(
      await renderRegionFile(path.join(worldPath, "nope.mca"), 0, 0),
    ).toBeNull();
  });

  it("skips chunks it cannot decompress and keeps the rest", async () => {
    const target = await writeRegion([
      { index: localIndex(0, 0), nbt: flatChunkNbt({ x: 0, z: 0 }) },
      {
        index: localIndex(1, 0),
        nbt: flatChunkNbt({ x: 1, z: 0 }),
        rawData: Buffer.from("junk"),
      },
      {
        index: localIndex(2, 0),
        nbt: flatChunkNbt({ x: 2, z: 0 }),
        rawCompressionByte: 4,
      },
    ]);

    const rgba = await renderRegionFile(target, 0, 0);
    expect(rgba).not.toBeNull();

    const alphaAt = (x: number) => rgba![x * 4 + 3];
    expect(alphaAt(0)).toBe(255);
    expect(alphaAt(16)).toBe(0);
    expect(alphaAt(32)).toBe(255);
    expect(rgba![32 * 4]).toBe(70);
  });
});
