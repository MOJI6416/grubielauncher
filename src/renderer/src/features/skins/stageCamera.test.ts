import { describe, expect, it } from "vitest";
import {
  MAX_STAGE_ZOOM,
  MIN_STAGE_ZOOM,
  stageExtents,
  stageZoom,
  visibleHalfSize,
} from "./stageCamera";

const PLAYER_HALF_HEIGHT = 16;
const PLAYER_HALF_WIDTH = 8;

const STAGES: [string, number, number][] = [
  ["wardrobe column", 294, 372],
  ["wardrobe column with diff row", 294, 330],
  ["catalog column", 296, 250],
  ["skin view dialog", 414, 330],
  ["add dialog preview", 200, 180],
  ["very narrow", 120, 400],
  ["very wide", 500, 160],
];

describe("stageExtents", () => {
  it("keeps the resting silhouette by default", () => {
    expect(stageExtents({})).toEqual({ halfHeight: 19, halfWidth: 10 });
  });

  it("grows upward for the name tag", () => {
    expect(stageExtents({ hasNameTag: true }).halfHeight).toBe(24);
  });

  it("grows sideways for the elytra", () => {
    expect(stageExtents({ hasElytra: true }).halfWidth).toBe(13.5);
  });

  it("grows sideways for a raised arm", () => {
    expect(stageExtents({ raisesArm: true })).toEqual({
      halfHeight: 19,
      halfWidth: 12,
    });
  });

  it("combines every requirement", () => {
    expect(
      stageExtents({ hasNameTag: true, hasElytra: true, raisesArm: true }),
    ).toEqual({ halfHeight: 24, halfWidth: 13.5 });
  });
});

describe("stageZoom", () => {
  it("keeps the whole player inside every stage shape", () => {
    for (const [, width, height] of STAGES) {
      const zoom = stageZoom({ width, height });
      const visible = visibleHalfSize(zoom, width, height);

      expect(visible.halfHeight).toBeGreaterThan(PLAYER_HALF_HEIGHT * 0.999);
      expect(visible.halfWidth).toBeGreaterThan(PLAYER_HALF_WIDTH * 0.999);
    }
  });

  it("leaves a margin around the resting player", () => {
    for (const [, width, height] of STAGES) {
      const zoom = stageZoom({ width, height });
      const visible = visibleHalfSize(zoom, width, height);

      expect(visible.halfHeight).toBeGreaterThan(PLAYER_HALF_HEIGHT * 1.1);
    }
  });

  it("fits the name tag above the head", () => {
    for (const [, width, height] of STAGES) {
      const zoom = stageZoom({ width, height, hasNameTag: true });
      const visible = visibleHalfSize(zoom, width, height);

      expect(visible.halfHeight).toBeGreaterThan(23.99);
    }
  });

  it("fits the elytra wings on a narrow stage", () => {
    const width = 120;
    const height = 400;
    const zoom = stageZoom({ width, height, hasElytra: true });
    const visible = visibleHalfSize(zoom, width, height);

    expect(visible.halfWidth).toBeGreaterThan(13.49);
  });

  it("is limited by width on a narrow stage and by height on a wide one", () => {
    expect(stageZoom({ width: 120, height: 400 })).toBeLessThan(
      stageZoom({ width: 400, height: 400 }),
    );
    expect(stageZoom({ width: 500, height: 160 })).toBe(
      stageZoom({ width: 900, height: 160 }),
    );
  });

  it("never leaves the allowed range", () => {
    expect(stageZoom({ width: 10, height: 4000 })).toBe(MIN_STAGE_ZOOM);
    expect(stageZoom({ width: 4000, height: 10 })).toBeLessThanOrEqual(
      MAX_STAGE_ZOOM,
    );
  });

  it("survives an unmeasured stage", () => {
    expect(stageZoom({ width: 0, height: 0 })).toBe(MIN_STAGE_ZOOM);
    expect(stageZoom({ width: Number.NaN, height: 100 })).toBe(MIN_STAGE_ZOOM);
  });

  it("zooms out when the silhouette needs more room", () => {
    const base = stageZoom({ width: 294, height: 372 });

    expect(stageZoom({ width: 294, height: 372, hasNameTag: true })).toBeLessThan(
      base,
    );
    expect(
      stageZoom({ width: 120, height: 400, raisesArm: true }),
    ).toBeLessThan(stageZoom({ width: 120, height: 400 }));
  });
});
