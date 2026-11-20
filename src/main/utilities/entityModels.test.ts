import { describe, expect, it } from "vitest";
import { bakeEntityModel, entityModelFor } from "./entityModels";
import type { RawQuad } from "./blockModels";

function bounds(quads: RawQuad[]) {
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const quad of quads) {
    quad.positions.forEach((value, index) => {
      low[index % 3] = Math.min(low[index % 3], value);
      high[index % 3] = Math.max(high[index % 3], value);
    });
  }
  return { low: low.map((value) => Math.round(value * 16 * 100) / 100), high: high.map((value) => Math.round(value * 16 * 100) / 100) };
}

function bake(state: string, props: Record<string, string>) {
  const model = entityModelFor(state, props);
  expect(model).not.toBeNull();
  return { model: model!, quads: bakeEntityModel(model!) };
}

function facesHaveArea(quads: RawQuad[]) {
  return quads.every((quad) => {
    const p = quad.positions;
    const a = [p[3] - p[0], p[4] - p[1], p[5] - p[2]];
    const b = [p[6] - p[0], p[7] - p[1], p[8] - p[2]];
    const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const length = Math.hypot(normal[0], normal[1], normal[2]);
    return length > 0;
  });
}

describe("block entity models", () => {
  it("builds a single chest with its lid and latch in front", () => {
    const { model, quads } = bake("minecraft:chest", { facing: "south", type: "single" });
    expect(model.texture).toBe("minecraft:entity/chest/normal");
    expect(quads).toHaveLength(18);
    expect(bounds(quads)).toEqual({ low: [1, 0, 1], high: [15, 14, 16] });
    const north = bounds(bakeEntityModel(entityModelFor("minecraft:chest", { facing: "north" })!));
    expect(north).toEqual({ low: [1, 0, 0], high: [15, 14, 15] });
    expect(facesHaveArea(quads)).toBe(true);
  });

  it("joins the halves of a double chest at the latch", () => {
    const left = bake("minecraft:chest", { facing: "south", type: "left" });
    const right = bake("minecraft:chest", { facing: "south", type: "right" });
    expect(left.model.texture).toBe("minecraft:entity/chest/normal_left");
    expect(right.model.texture).toBe("minecraft:entity/chest/normal_right");
    expect(bounds(left.quads)).toEqual({ low: [0, 0, 1], high: [15, 14, 16] });
    expect(bounds(right.quads)).toEqual({ low: [1, 0, 1], high: [16, 14, 16] });
    expect(entityModelFor("minecraft:waxed_weathered_copper_chest", {})?.texture).toBe(
      "minecraft:entity/chest/copper_weathered",
    );
    expect(entityModelFor("minecraft:ender_chest", { type: "left" })?.texture).toBe(
      "minecraft:entity/chest/ender",
    );
  });

  it("puts bed legs on the outer corners and the mattress at 3–9 px", () => {
    const head = bake("minecraft:red_bed", { facing: "north", part: "head" });
    const foot = bake("minecraft:red_bed", { facing: "north", part: "foot" });
    expect(head.model.texture).toBe("minecraft:entity/bed/red");
    expect(bounds(head.quads)).toEqual({ low: [0, 0, 0], high: [16, 9, 16] });
    const legs = (quads: RawQuad[]) =>
      bounds(quads.filter((quad) => quad.positions.some((value, index) => index % 3 === 1 && value < 2.9 / 16)));
    expect(legs(head.quads)).toEqual({ low: [0, 0, 0], high: [16, 3, 3] });
    expect(legs(foot.quads)).toEqual({ low: [0, 0, 13], high: [16, 3, 16] });
  });

  it("stands a sign on a post and hangs wall signs on the wall", () => {
    const standing = bake("minecraft:oak_sign", { rotation: "0" });
    expect(standing.model.texture).toBe("minecraft:entity/signs/oak");
    expect(standing.model.height).toBe(32);
    expect(bounds(standing.quads)).toEqual({ low: [0, 0, 7.33], high: [16, 17.33, 8.67] });
    const wall = bake("minecraft:spruce_wall_sign", { facing: "south" });
    expect(bounds(wall.quads)).toEqual({ low: [0, 4.33, 0.33], high: [16, 12.33, 1.67] });
    const turned = bounds(bakeEntityModel(entityModelFor("minecraft:oak_sign", { rotation: "4" })!));
    expect(turned).toEqual({ low: [7.33, 0, 0], high: [8.67, 17.33, 16] });
  });

  it("hangs a hanging sign from the block above", () => {
    const ceiling = bake("minecraft:oak_hanging_sign", { rotation: "0", attached: "false" });
    expect(ceiling.model.texture).toBe("minecraft:entity/signs/hanging/oak");
    expect(ceiling.quads).toHaveLength(14);
    expect(bounds(ceiling.quads).low[1]).toBe(0);
    expect(bounds(ceiling.quads).high[1]).toBe(16);
    const wall = bake("minecraft:birch_wall_hanging_sign", { facing: "south" });
    expect(wall.quads).toHaveLength(20);
    expect(bounds(wall.quads)).toMatchObject({ low: [0, 0, 6], high: [16, 16, 10] });
  });

  it("leaves other blocks and mods alone", () => {
    expect(entityModelFor("minecraft:stone", {})).toBeNull();
    expect(entityModelFor("mymod:fancy_chest", {})).toBeNull();
    expect(entityModelFor("minecraft:shulker_box", {})).toBeNull();
  });
});
