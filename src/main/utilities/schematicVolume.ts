import fs from "fs-extra";
import path from "path";
import { SchematicVolumeResult } from "@/types/Schematic";
import {
  AIR_BLOCKS,
  blockBaseId,
  formatBlockState,
  parseBlockState,
} from "@/shared/blockState";
import { NbtCompound, inflateNbt, readNbtTree } from "./nbtTree";
import { openSchematicSource } from "./schematicFormats";
import { MAX_FILE_BYTES, MAX_INFLATED_BYTES } from "./schematics";

export const MAX_VOLUME_CELLS = 24 * 1024 * 1024;
const ROOT_CACHE_MS = 60_000;

let cachedRoot: { key: string; root: NbtCompound; at: number } | null = null;

async function readRoot(filePath: string, stats: fs.Stats): Promise<NbtCompound> {
  const key = `${filePath}\0${stats.size}\0${stats.mtimeMs}`;
  if (cachedRoot?.key === key && Date.now() - cachedRoot.at < ROOT_CACHE_MS) {
    cachedRoot.at = Date.now();
    return cachedRoot.root;
  }
  const inflated = await inflateNbt(await fs.readFile(filePath), MAX_INFLATED_BYTES);
  const root = readNbtTree(inflated).value;
  cachedRoot = { key, root, at: Date.now() };
  return root;
}

type Family = "fence" | "pane" | "wall";

function familyOf(name: string): Family | null {
  if (name.endsWith("_fence")) return "fence";
  if (name.endsWith("_pane") || name === "minecraft:iron_bars") return "pane";
  if (name.endsWith("_wall") && !name.includes("_wall_")) return "wall";
  return null;
}

const NO_CONNECTION =
  /fence_gate|torch|door|sign|button|lever|rail|carpet|flower|sapling|grass|fern|ladder|vine|pressure_plate|banner|_bed|_slab|_stairs|trapdoor|water|lava|snow|head|skull|pot|bush|crop|wheat|carrots|potatoes|sugar_cane|reeds|tulip|poppy|dandelion|orchid|allium|bluet|daisy|mushroom$/;

function connects(own: Family, neighbor: string): boolean {
  if (AIR_BLOCKS.has(neighbor)) return false;
  const family = familyOf(neighbor);
  if (family) return family === own;
  if (own === "fence" && neighbor.endsWith("fence_gate")) return true;
  return !NO_CONNECTION.test(neighbor);
}

const SIDES: [string, number, number][] = [
  ["north", 0, -1],
  ["south", 0, 1],
  ["west", -1, 0],
  ["east", 1, 0],
];

export function connectLegacyShapes(
  palette: string[],
  data: Uint16Array | Uint32Array,
  size: { x: number; y: number; z: number },
) {
  const parsed = palette.map((state) => parseBlockState(state));
  const families = parsed.map(({ name, props }) =>
    props.north === undefined ? familyOf(name) : null,
  );
  const doors = parsed.map(
    ({ name, props }) =>
      name.endsWith("_door") && props.half === "upper" && !props.facing,
  );
  if (!families.some(Boolean) && !doors.some(Boolean)) return;

  const index = new Map(palette.map((state, at) => [state, at]));
  const stateIndex = (state: string) => {
    let at = index.get(state);
    if (at === undefined) {
      palette.push(state);
      at = palette.length - 1;
      index.set(state, at);
      parsed.push(parseBlockState(state));
    }
    return at;
  };

  const { x: sx, y: sy, z: sz } = size;
  const layer = sx * sz;
  const limit = data instanceof Uint16Array ? 0xffff : 0xffffffff;

  for (let y = 0; y < sy; y += 1) {
    for (let z = 0; z < sz; z += 1) {
      for (let x = 0; x < sx; x += 1) {
        const cell = x + z * sx + y * layer;
        const state = data[cell];
        const family = families[state];

        if (family) {
          const props: Record<string, string> = {};
          for (const [side, dx, dz] of SIDES) {
            const nx = x + dx;
            const nz = z + dz;
            const linked =
              nx >= 0 &&
              nz >= 0 &&
              nx < sx &&
              nz < sz &&
              connects(family, parsed[data[nx + nz * sx + y * layer]].name);
            props[side] =
              family === "wall" ? (linked ? "low" : "none") : String(linked);
          }
          if (family === "wall") props.up = "true";
          const next = stateIndex(formatBlockState(parsed[state].name, props));
          if (next <= limit) data[cell] = next;
          continue;
        }

        if (doors[state] && y > 0) {
          const below = parsed[data[cell - layer]];
          if (!below.name.endsWith("_door") || below.props.half !== "lower") {
            continue;
          }
          const next = stateIndex(
            formatBlockState(parsed[state].name, {
              facing: below.props.facing ?? "east",
              half: "upper",
              hinge: parsed[state].props.hinge ?? "left",
              open: below.props.open ?? "false",
            }),
          );
          if (next <= limit) data[cell] = next;
        }
      }
    }
  }
}

export async function loadSchematicVolume(
  filePath: string,
  yFrom = 0,
): Promise<SchematicVolumeResult> {
  const resolved = path.resolve(filePath);
  const stats = await fs.stat(resolved).catch(() => null);
  if (!stats?.isFile()) return { ok: false, error: "missing" };
  if (stats.size > MAX_FILE_BYTES) return { ok: false, error: "tooLarge" };

  let root: NbtCompound;
  try {
    root = await readRoot(resolved, stats);
  } catch (error) {
    return { ok: false, error: error instanceof RangeError ? "tooLarge" : "unreadable" };
  }

  const source = openSchematicSource(root);
  if (!source) return { ok: false, error: "unreadable" };

  const size = source.details.size;
  const layer = size.x * size.z;
  if (layer > MAX_VOLUME_CELLS) return { ok: false, error: "tooLarge" };

  const from = Math.max(0, Math.min(Math.max(0, size.y - 1), Math.floor(yFrom)));
  const layers = layer > 0 ? Math.floor(MAX_VOLUME_CELLS / layer) : 0;
  const to = Math.max(from - 1, Math.min(size.y - 1, from + layers - 1));
  const height = Math.max(0, to - from + 1);

  const palette = [...source.palette];
  const remap = Uint32Array.from(palette, (state, index) =>
    AIR_BLOCKS.has(blockBaseId(state)) ? 0 : index,
  );
  const cells = layer * height;
  const data =
    palette.length < 0xffff ? new Uint16Array(cells) : new Uint32Array(cells);

  source.visit((x, y, z, state) => {
    if (y < from || y > to || x < 0 || z < 0 || x >= size.x || z >= size.z) {
      return;
    }
    data[x + z * size.x + (y - from) * layer] = remap[state] ?? 0;
  });

  connectLegacyShapes(palette, data, { x: size.x, y: height, z: size.z });

  let blocks = 0;
  for (let index = 0; index < cells; index += 1) if (data[index] !== 0) blocks += 1;

  return {
    ok: true,
    volume: {
      size: { ...size },
      palette,
      data,
      yFrom: from,
      yTo: to,
      blocks,
    },
  };
}
