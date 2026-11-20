import { describe, expect, it } from "vitest";
import {
  compileModels,
  countLayerQuads,
  fitRange,
  meshSection,
  sectionsInRange,
  type CompileBlock,
  type CompileQuad,
  type VolumeGrid,
} from "./mesher";

const FACES: number[][] = [
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1],
  [0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0],
  [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1],
  [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
  [1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0],
];

function cube(options: { translucent?: boolean; top?: number } = {}): CompileQuad[] {
  return FACES.map((positions, direction) => ({
    positions: positions.map((value, index) =>
      index % 3 === 1 && value === 1 && options.top ? options.top : value,
    ),
    uvs: [0, 0, 0, 1, 1, 1, 1, 0],
    rect: [0, 0, 0.5, 0.5] as const,
    cull: direction,
    shade: direction,
    tint: -1,
    translucent: options.translucent ?? false,
  }));
}

const AIR: CompileBlock = { quads: [], occludes: false, selfCull: false, liquid: 0 };
const STONE: CompileBlock = { quads: cube(), occludes: true, selfCull: false, liquid: 0 };
const GLASS: CompileBlock = {
  quads: cube({ translucent: true }),
  occludes: false,
  selfCull: true,
  liquid: 0,
};
const LEAVES: CompileBlock = { quads: cube(), occludes: false, selfCull: false, liquid: 0 };
const WATER: CompileBlock = {
  quads: cube({ translucent: true, top: 0.875 }),
  occludes: false,
  selfCull: true,
  liquid: 1,
};

function grid(sx: number, sy: number, sz: number, cells: number[]): VolumeGrid {
  return { sx, sy, sz, yFrom: 0, data: Uint16Array.from(cells) };
}

const models = compileModels([AIR, STONE, GLASS, LEAVES, WATER]);
const full = (volume: VolumeGrid) => ({ lo: 0, hi: volume.sy - 1 });

function quads(volume: VolumeGrid) {
  const mesh = meshSection(volume, models, full(volume), 0, 0, 0);
  return {
    total: mesh.quads,
    opaque: (mesh.opaque?.indices.length ?? 0) / 6,
    translucent: (mesh.translucent?.indices.length ?? 0) / 6,
    mesh,
  };
}

describe("schematic mesher", () => {
  it("drops faces between solid blocks", () => {
    expect(quads(grid(1, 1, 1, [1])).total).toBe(6);
    expect(quads(grid(2, 1, 1, [1, 1])).total).toBe(10);
    expect(quads(grid(3, 3, 3, Array(27).fill(1))).total).toBe(54);
  });

  it("joins glass to glass and keeps faces of leaves", () => {
    const glass = quads(grid(2, 1, 1, [2, 2]));
    expect(glass).toMatchObject({ total: 10, translucent: 10, opaque: 0 });
    expect(quads(grid(2, 1, 1, [3, 3])).total).toBe(12);
    expect(quads(grid(2, 1, 1, [1, 2])).total).toBe(11);
  });

  it("raises water that has water above it", () => {
    const tower = quads(grid(1, 2, 1, [4, 4]));
    expect(tower.total).toBe(10);
    const heights = new Set<number>();
    const positions = tower.mesh.translucent!.positions;
    for (let index = 1; index < positions.length; index += 3) heights.add(positions[index]);
    expect([...heights].sort()).toEqual([0, 1, 1.875]);
  });

  it("bakes shading and atlas coordinates", () => {
    expect(Array.from(models.colors.slice(0, 6))).toEqual([179, 179, 179, 255, 255, 255]);
    expect(Array.from(models.uvs.slice(0, 8))).toEqual([0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0]);
  });

  it("cuts by layer range and opens the cut", () => {
    const column = grid(1, 3, 1, [1, 1, 1]);
    expect(meshSection(column, models, { lo: 0, hi: 2 }, 0, 0, 0).quads).toBe(14);
    expect(meshSection(column, models, { lo: 0, hi: 0 }, 0, 0, 0).quads).toBe(6);
    expect(meshSection(column, models, { lo: 1, hi: 2 }, 0, 0, 0).quads).toBe(10);
  });

  it("counts quads per layer and fits a range into the budget", () => {
    const tall = grid(1, 4, 1, [1, 0, 1, 1]);
    expect(Array.from(countLayerQuads(tall, models))).toEqual([6, 0, 5, 5]);
    expect(fitRange([6, 0, 5, 5], 0, 11, { lo: 0, hi: 3 })).toEqual({ lo: 0, hi: 2 });
    expect(fitRange([6, 0, 5, 5], 0, 100, { lo: 1, hi: 3 })).toEqual({ lo: 1, hi: 3 });
    expect(fitRange([6, 0, 5, 5], 0, 11, { lo: 0, hi: 3 }, "hi")).toEqual({ lo: 1, hi: 3 });
    expect(fitRange([6, 0, 5, 5], 0, 4, { lo: 0, hi: 3 }, "hi")).toEqual({ lo: 3, hi: 3 });
  });

  it("lists sections of the range from the centre out", () => {
    const wide = grid(40, 20, 16, new Array(40 * 20 * 16).fill(0));
    const sections = sectionsInRange(wide, { lo: 0, hi: 19 });
    expect(sections).toHaveLength(6);
    expect(sections[0]).toEqual([1, 0, 0]);
    expect(sectionsInRange(wide, { lo: 16, hi: 19 }).every(([, y]) => y === 1)).toBe(true);
  });
});
