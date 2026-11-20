import {
  BlockProps,
  formatBlockState,
  parseBlockState,
} from "@/shared/blockState";
import { legacyBlockName as flattenedName } from "./legacyChunks";
import { LEGACY_BLOCK_NAMES } from "./legacyBlockNames";

export const FLATTENING_DATA_VERSION = 1451;

interface Codec {
  decode(data: number): BlockProps;
  encode(props: BlockProps): number;
}

function pick(values: readonly string[], value: string | undefined): number {
  const index = value === undefined ? -1 : values.indexOf(value);
  return index < 0 ? 0 : index;
}

const STAIR_FACING = ["east", "west", "south", "north"];
const DOOR_FACING = ["east", "south", "west", "north"];
const SIDE_FACING = ["north", "south", "west", "east"];
const BED_FACING = ["south", "west", "north", "east"];
const ANY_FACING = ["down", "up", "north", "south", "west", "east"];
const TORCH_FACING = ["up", "east", "west", "south", "north", "up"];
const AXES = ["y", "x", "z", "none"];
const RAIL_SHAPES = [
  "north_south",
  "east_west",
  "ascending_east",
  "ascending_west",
  "ascending_north",
  "ascending_south",
  "south_east",
  "south_west",
  "north_west",
  "north_east",
];
const VINE_SIDES: [string, number][] = [
  ["south", 1],
  ["west", 2],
  ["north", 4],
  ["east", 8],
];

const stairs: Codec = {
  decode: (data) => ({
    facing: STAIR_FACING[data & 3],
    half: data & 4 ? "top" : "bottom",
  }),
  encode: (props) =>
    pick(STAIR_FACING, props.facing) | (props.half === "top" ? 4 : 0),
};

const slab: Codec = {
  decode: (data) => ({ type: data & 8 ? "top" : "bottom" }),
  encode: (props) =>
    props.half === "top" || props.type === "top" ? 8 : 0,
};

const pillar: Codec = {
  decode: (data) => {
    const axis = AXES[(data >> 2) & 3];
    return { axis: axis === "none" ? "y" : axis };
  },
  encode: (props) => pick(AXES, props.axis) << 2,
};

const door: Codec = {
  decode: (data): BlockProps =>
    data & 8
      ? { half: "upper", hinge: data & 1 ? "right" : "left" }
      : {
          half: "lower",
          facing: DOOR_FACING[data & 3],
          open: data & 4 ? "true" : "false",
        },
  encode: (props) =>
    props.half === "upper"
      ? 8 | (props.hinge === "right" ? 1 : 0)
      : pick(DOOR_FACING, props.facing) | (props.open === "true" ? 4 : 0),
};

const trapdoor: Codec = {
  decode: (data) => ({
    facing: SIDE_FACING[data & 3],
    half: data & 8 ? "top" : "bottom",
    open: data & 4 ? "true" : "false",
  }),
  encode: (props) =>
    pick(SIDE_FACING, props.facing) |
    (props.open === "true" ? 4 : 0) |
    (props.half === "top" ? 8 : 0),
};

const gate: Codec = {
  decode: (data) => ({
    facing: BED_FACING[data & 3],
    open: data & 4 ? "true" : "false",
  }),
  encode: (props) =>
    pick(BED_FACING, props.facing) | (props.open === "true" ? 4 : 0),
};

const sideFacing: Codec = {
  decode: (data) => ({ facing: SIDE_FACING[Math.max(0, (data & 7) - 2)] ?? "north" }),
  encode: (props) => pick(SIDE_FACING, props.facing) + 2,
};

const anyFacing: Codec = {
  decode: (data) => ({ facing: ANY_FACING[data & 7] ?? "up" }),
  encode: (props) => pick(ANY_FACING, props.facing),
};

const bed: Codec = {
  decode: (data) => ({
    facing: BED_FACING[data & 3],
    part: data & 8 ? "head" : "foot",
  }),
  encode: (props) =>
    pick(BED_FACING, props.facing) | (props.part === "head" ? 8 : 0),
};

const pumpkin: Codec = {
  decode: (data) => ({ facing: BED_FACING[data & 3] }),
  encode: (props) => pick(BED_FACING, props.facing),
};

const snow: Codec = {
  decode: (data) => ({ layers: String((data & 7) + 1) }),
  encode: (props) => Math.max(0, Number(props.layers ?? 1) - 1) & 7,
};

const rotation: Codec = {
  decode: (data) => ({ rotation: String(data & 15) }),
  encode: (props) => Number(props.rotation ?? 0) & 15,
};

const rail: Codec = {
  decode: (data) => ({ shape: RAIL_SHAPES[data] ?? "north_south" }),
  encode: (props) => pick(RAIL_SHAPES, props.shape),
};

const poweredRail: Codec = {
  decode: (data) => ({
    shape: RAIL_SHAPES[data & 7] ?? "north_south",
    powered: data & 8 ? "true" : "false",
  }),
  encode: (props) =>
    pick(RAIL_SHAPES, props.shape) | (props.powered === "true" ? 8 : 0),
};

const vine: Codec = {
  decode: (data) =>
    Object.fromEntries(
      VINE_SIDES.map(([side, bit]) => [side, data & bit ? "true" : "false"]),
    ),
  encode: (props) =>
    VINE_SIDES.reduce(
      (data, [side, bit]) => (props[side] === "true" ? data | bit : data),
      0,
    ),
};

const CODECS = new Map<number, Codec>();
const register = (codec: Codec, ids: number[]) =>
  ids.forEach((id) => CODECS.set(id, codec));

register(stairs, [53, 67, 108, 109, 114, 128, 134, 135, 136, 156, 163, 164, 180, 203]);
register(slab, [44, 126, 182, 205]);
register(pillar, [17, 162, 170, 202, 216]);
register(door, [64, 71, 193, 194, 195, 196, 197]);
register(trapdoor, [96, 167]);
register(gate, [107, 183, 184, 185, 186, 187]);
register(sideFacing, [54, 61, 62, 65, 68, 130, 146, 177]);
register(anyFacing, [23, 29, 33, 158, 198, 218]);
register(bed, [26]);
register(pumpkin, [86, 91]);
register(snow, [78]);
register(rotation, [63, 176]);
register(rail, [66]);
register(poweredRail, [27, 28, 157]);
register(vine, [106]);

const TORCHES: Record<number, { floor: string; wall: string; lit?: boolean }> =
  {
    50: { floor: "torch", wall: "wall_torch" },
    75: { floor: "redstone_torch", wall: "redstone_wall_torch", lit: false },
    76: { floor: "redstone_torch", wall: "redstone_wall_torch", lit: true },
  };

const LIT = new Set([62, 74, 124]);

function torchState(id: number, data: number): string {
  const torch = TORCHES[id];
  const facing = TORCH_FACING[data & 7] ?? "up";
  const props: BlockProps = {};
  if (facing !== "up") props.facing = facing;
  if (torch.lit !== undefined) props.lit = String(torch.lit);
  return formatBlockState(
    `minecraft:${facing === "up" ? torch.floor : torch.wall}`,
    props,
  );
}

function quartzState(data: number): string {
  if (data === 1) return "minecraft:chiseled_quartz_block";
  if (data >= 2 && data <= 4) {
    return `minecraft:quartz_pillar[axis=${["y", "x", "z"][data - 2]}]`;
  }
  return "minecraft:quartz_block";
}

export function legacyBlockState(
  id: number,
  data: number,
  mapping?: ReadonlyMap<number, string>,
): string {
  if (id === 0) return "minecraft:air";
  const mapped = mapping?.get(id);
  if (mapped) return parseBlockState(mapped).name;
  if (TORCHES[id]) return torchState(id, data);
  if (id === 155) return quartzState(data);

  const flattened = flattenedName(id, data);
  if (flattened.startsWith("legacy:")) return `legacy:${id}`;

  const codec = CODECS.get(id);
  const props = codec ? codec.decode(data) : {};
  if (LIT.has(id)) props.lit = "true";

  let name = flattened;
  if ((id === 17 || id === 162) && ((data >> 2) & 3) === 3) {
    name = name.replace(/_log$/, "_wood");
  }
  return formatBlockState(name, props);
}

const LEGACY_IDS = new Map<string, number>();
LEGACY_BLOCK_NAMES.forEach((name, id) => {
  if (name && !LEGACY_IDS.has(name)) LEGACY_IDS.set(name, id);
});

const LEGACY_DYES = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "silver",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black",
];
const WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak"];
const SLAB_STONES = [
  "stone",
  "sand",
  "wood_old",
  "cobblestone",
  "brick",
  "smooth_stone_brick",
  "nether_brick",
  "quartz",
];

const VARIANTS: Record<string, [string, readonly string[]]> = {
  stone: [
    "variant",
    [
      "stone",
      "granite",
      "smooth_granite",
      "diorite",
      "smooth_diorite",
      "andesite",
      "smooth_andesite",
    ],
  ],
  dirt: ["variant", ["dirt", "coarse_dirt", "podzol"]],
  planks: ["variant", WOODS],
  sapling: ["type", WOODS],
  log: ["variant", WOODS.slice(0, 4)],
  log2: ["variant", WOODS.slice(4)],
  leaves: ["variant", WOODS.slice(0, 4)],
  leaves2: ["variant", WOODS.slice(4)],
  wooden_slab: ["variant", WOODS],
  double_wooden_slab: ["variant", WOODS],
  sand: ["variant", ["sand", "red_sand"]],
  sponge: ["wet", ["false", "true"]],
  sandstone: ["type", ["sandstone", "chiseled_sandstone", "smooth_sandstone"]],
  red_sandstone: [
    "type",
    ["red_sandstone", "chiseled_red_sandstone", "smooth_red_sandstone"],
  ],
  tallgrass: ["type", ["dead_bush", "tall_grass", "fern"]],
  red_flower: [
    "type",
    [
      "poppy",
      "blue_orchid",
      "allium",
      "houstonia",
      "red_tulip",
      "orange_tulip",
      "white_tulip",
      "pink_tulip",
      "oxeye_daisy",
    ],
  ],
  double_plant: [
    "variant",
    ["sunflower", "syringa", "double_grass", "double_fern", "double_rose", "paeonia"],
  ],
  stone_slab: ["variant", SLAB_STONES],
  double_stone_slab: ["variant", SLAB_STONES],
  stonebrick: [
    "variant",
    ["stonebrick", "mossy_stonebrick", "cracked_stonebrick", "chiseled_stonebrick"],
  ],
  monster_egg: [
    "variant",
    [
      "stone",
      "cobblestone",
      "stone_brick",
      "mossy_brick",
      "cracked_brick",
      "chiseled_brick",
    ],
  ],
  prismarine: ["variant", ["prismarine", "prismarine_bricks", "dark_prismarine"]],
  cobblestone_wall: ["variant", ["cobblestone", "mossy_cobblestone"]],
  quartz_block: ["variant", ["default", "chiseled", "lines_y", "lines_x", "lines_z"]],
};

function legacyData(id: number, shortName: string, props: BlockProps): number {
  let data = 0;
  const variant = VARIANTS[shortName];
  if (variant) data |= pick(variant[1], props[variant[0]]);
  if (props.color !== undefined) data |= pick(LEGACY_DYES, props.color);

  if (TORCHES[id]) return pick(TORCH_FACING, props.facing);
  const codec = CODECS.get(id);
  if (codec) data |= codec.encode(props);
  return data;
}

const LEGACY_ONLY = new Set([
  "planks",
  "log",
  "log2",
  "leaves",
  "leaves2",
  "wool",
  "stonebrick",
  "stained_hardened_clay",
  "hardened_clay",
  "red_flower",
  "yellow_flower",
  "tallgrass",
  "double_plant",
  "wooden_slab",
  "double_wooden_slab",
  "double_stone_slab",
  "stone_slab2",
  "monster_egg",
  "quartz_ore",
  "lit_pumpkin",
  "melon_block",
  "grass_path",
  "magma",
  "nether_brick",
  "slime",
  "web",
  "deadbush",
  "waterlily",
  "reeds",
  "noteblock",
  "mob_spawner",
  "golden_rail",
  "concrete",
  "concrete_powder",
  "carpet",
  "stained_glass",
  "stained_glass_pane",
  "brick_block",
  "fence",
  "fence_gate",
  "trapdoor",
  "wooden_door",
]);

export function paletteIsLegacy(
  dataVersion: number | null,
  states: readonly (string | null)[],
): boolean {
  if (dataVersion !== null) return dataVersion < FLATTENING_DATA_VERSION;
  return states.some((state) => {
    if (!state) return false;
    const { name, props } = parseBlockState(state);
    return (
      name.startsWith("minecraft:") &&
      (LEGACY_ONLY.has(name.slice("minecraft:".length)) ||
        props.variant !== undefined)
    );
  });
}

export function modernizeBlockState(state: string): string {
  const { name, props } = parseBlockState(state);
  if (!name.startsWith("minecraft:")) return state;
  const shortName = name.slice("minecraft:".length);
  const id = LEGACY_IDS.get(shortName);
  if (id === undefined) return state;
  return legacyBlockState(id, legacyData(id, shortName, props));
}
