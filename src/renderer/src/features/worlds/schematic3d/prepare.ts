import type { BlockModelSet, SchematicVolume } from "@/types/Schematic";
import { buildAtlas, type Atlas } from "./atlas";
import { compileBlocks } from "./compile";
import { compileModels, type CompiledModels, type VolumeGrid } from "./mesher";

const api = window.api;

export const QUAD_BUDGET = 1_600_000;

export interface PreparedSchematic {
  volume: SchematicVolume;
  grid: VolumeGrid;
  models: CompiledModels;
  atlas: Atlas;
  vanillaSource: BlockModelSet["vanillaSource"];
  colorOnly: number;
}

export type PrepareResult =
  | { ok: true; prepared: PreparedSchematic }
  | { ok: false; error: "missing" | "tooLarge" | "unreadable" };

const modelCache = new Map<string, Promise<BlockModelSet>>();
const MODEL_CACHE_LIMIT = 6;

function modelsFor(versionPath: string, palette: string[]): Promise<BlockModelSet> {
  const key = `${versionPath}\0${palette.join("\0")}`;
  let pending = modelCache.get(key);
  if (!pending) {
    pending = api.schematics.models(versionPath, palette);
    pending.catch(() => modelCache.delete(key));
    modelCache.set(key, pending);
    while (modelCache.size > MODEL_CACHE_LIMIT) {
      modelCache.delete(modelCache.keys().next().value!);
    }
  }
  return pending;
}

export async function prepareSchematic(
  filePath: string,
  versionPath: string,
  yFrom = 0,
): Promise<PrepareResult> {
  const result = await api.schematics.volume(filePath, yFrom);
  if (!result.ok) return result;
  const volume = result.volume;
  const set = await modelsFor(versionPath, volume.palette);
  const atlas = await buildAtlas(set.textures);
  const models = compileModels(compileBlocks(set, atlas, volume.palette));
  const height = volume.yTo - volume.yFrom + 1;
  return {
    ok: true,
    prepared: {
      volume,
      grid: {
        sx: volume.size.x,
        sy: Math.max(0, height),
        sz: volume.size.z,
        yFrom: volume.yFrom,
        data: volume.data,
      },
      models,
      atlas,
      vanillaSource: set.vanillaSource,
      colorOnly: set.blocks.filter((block) => block.missing).length,
    },
  };
}
