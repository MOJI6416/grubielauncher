import type { BlockModelSet } from "@/types/Schematic";
import { parseBlockState } from "@/shared/blockState";
import type { Atlas } from "./atlas";
import type { CompileBlock } from "./mesher";

const LAVA = /lava/;

export function compileBlocks(
  set: BlockModelSet,
  atlas: Atlas,
  palette: string[],
): CompileBlock[] {
  return palette.map((state, index) => {
    const block = set.blocks[index];
    if (!block || index === 0) {
      return { quads: [], occludes: false, selfCull: false, liquid: 0 };
    }
    const name = parseBlockState(state).name;
    const opaque = block.quads.every(
      (quad) => atlas.alpha[quad.texture] === "opaque",
    );
    return {
      quads: block.quads.map((quad) => ({
        positions: quad.positions,
        uvs: quad.uvs,
        rect: atlas.rects[quad.texture] ?? [0, 0, 0, 0],
        cull: quad.cull,
        shade: quad.shade,
        tint: quad.tint,
        translucent: atlas.alpha[quad.texture] === "translucent",
      })),
      occludes: block.cube && opaque && !block.liquid,
      selfCull: block.liquid || (block.cube && !opaque && !name.includes("leaves")),
      liquid: block.liquid ? (LAVA.test(name) ? 2 : 1) : 0,
    };
  });
}
