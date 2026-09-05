/**
 * Top-down colours for Minecraft blocks, used by the satellite view of the
 * chunk editor. Colours follow the in-game map palette so terrain reads the
 * way players expect; anything unknown gets a stable colour from its name.
 */

export type BlockRgb = readonly [number, number, number];

export interface BiomeTint {
  grass: BlockRgb;
  foliage: BlockRgb;
  water: BlockRgb;
}

export type BlockPaint =
  | { kind: "solid"; rgb: BlockRgb }
  | { kind: "grass" }
  | { kind: "foliage" }
  | { kind: "water" }
  | { kind: "transparent" };

const SOLID = (r: number, g: number, b: number): BlockPaint => ({
  kind: "solid",
  rgb: [r, g, b],
});
const GRASS: BlockPaint = { kind: "grass" };
const FOLIAGE: BlockPaint = { kind: "foliage" };
const WATER: BlockPaint = { kind: "water" };
const TRANSPARENT: BlockPaint = { kind: "transparent" };

export const DEFAULT_TINT: BiomeTint = {
  grass: [145, 189, 89],
  foliage: [119, 171, 60],
  water: [63, 118, 228],
};

const WATER_LIKE = new Set([
  "water",
  "bubble_column",
  "kelp",
  "kelp_plant",
  "seagrass",
  "tall_seagrass",
]);

const TRANSPARENT_BLOCKS = new Set([
  "air",
  "cave_air",
  "void_air",
  "glass",
  "glass_pane",
  "light",
  "barrier",
  "structure_void",
  "moving_piston",
]);

export const DYE_COLORS: Record<string, BlockRgb> = {
  white: [233, 236, 236],
  orange: [240, 118, 19],
  magenta: [189, 68, 179],
  light_blue: [58, 175, 217],
  yellow: [248, 197, 39],
  lime: [112, 185, 25],
  pink: [237, 141, 172],
  gray: [62, 68, 71],
  light_gray: [142, 142, 134],
  cyan: [21, 137, 145],
  purple: [121, 42, 172],
  blue: [53, 57, 157],
  brown: [114, 71, 40],
  green: [84, 109, 27],
  red: [161, 39, 34],
  black: [20, 21, 25],
};

const TERRACOTTA_BASE: BlockRgb = [152, 94, 67];

const WOOD_COLORS: Record<string, { log: BlockRgb; planks: BlockRgb }> = {
  oak: { log: [108, 85, 50], planks: [162, 130, 78] },
  spruce: { log: [58, 37, 16], planks: [114, 84, 48] },
  birch: { log: [216, 215, 210], planks: [192, 175, 121] },
  jungle: { log: [87, 68, 26], planks: [160, 115, 80] },
  acacia: { log: [103, 96, 86], planks: [168, 90, 50] },
  dark_oak: { log: [60, 47, 26], planks: [66, 43, 20] },
  mangrove: { log: [83, 66, 41], planks: [117, 54, 48] },
  cherry: { log: [54, 33, 44], planks: [227, 178, 172] },
  pale_oak: { log: [87, 77, 73], planks: [227, 216, 208] },
  bamboo: { log: [130, 148, 60], planks: [194, 174, 80] },
  crimson: { log: [107, 49, 72], planks: [101, 48, 70] },
  warped: { log: [58, 113, 109], planks: [43, 104, 99] },
};

const CORAL_COLORS: Record<string, BlockRgb> = {
  tube: [49, 87, 206],
  brain: [207, 91, 159],
  bubble: [167, 49, 191],
  fire: [193, 49, 49],
  horn: [216, 199, 66],
};

const EXACT: Record<string, BlockPaint> = {
  stone: SOLID(125, 125, 125),
  cobblestone: SOLID(122, 122, 122),
  mossy_cobblestone: SOLID(110, 118, 94),
  stone_bricks: SOLID(122, 122, 122),
  smooth_stone: SOLID(158, 158, 158),
  granite: SOLID(149, 103, 85),
  diorite: SOLID(188, 188, 189),
  andesite: SOLID(136, 136, 137),
  tuff: SOLID(108, 109, 102),
  calcite: SOLID(223, 224, 220),
  deepslate: SOLID(80, 80, 82),
  cobbled_deepslate: SOLID(77, 77, 80),
  dripstone_block: SOLID(134, 107, 92),
  pointed_dripstone: SOLID(134, 107, 92),
  smooth_basalt: SOLID(72, 72, 78),
  basalt: SOLID(80, 81, 86),
  blackstone: SOLID(42, 36, 41),
  obsidian: SOLID(15, 10, 24),
  crying_obsidian: SOLID(32, 10, 60),
  bedrock: SOLID(85, 85, 85),
  dirt: SOLID(134, 96, 67),
  coarse_dirt: SOLID(119, 85, 59),
  rooted_dirt: SOLID(144, 103, 76),
  podzol: SOLID(91, 63, 37),
  mud: SOLID(60, 57, 60),
  packed_mud: SOLID(142, 106, 79),
  mud_bricks: SOLID(137, 103, 79),
  muddy_mangrove_roots: SOLID(71, 58, 52),
  grass_block: GRASS,
  dirt_path: SOLID(148, 121, 65),
  farmland: SOLID(110, 76, 45),
  mycelium: SOLID(111, 99, 105),
  moss_block: SOLID(89, 109, 45),
  moss_carpet: SOLID(89, 109, 45),
  pale_moss_block: SOLID(118, 129, 105),
  pale_moss_carpet: SOLID(118, 129, 105),
  clay: SOLID(160, 166, 179),
  gravel: SOLID(131, 127, 126),
  suspicious_gravel: SOLID(131, 127, 126),
  sand: SOLID(219, 207, 163),
  suspicious_sand: SOLID(219, 207, 163),
  red_sand: SOLID(190, 102, 33),
  sandstone: SOLID(216, 203, 155),
  red_sandstone: SOLID(186, 99, 29),
  terracotta: SOLID(152, 94, 67),
  snow: SOLID(249, 254, 254),
  snow_block: SOLID(249, 254, 254),
  powder_snow: SOLID(248, 253, 253),
  ice: SOLID(145, 183, 253),
  packed_ice: SOLID(141, 180, 250),
  blue_ice: SOLID(116, 167, 251),
  frosted_ice: SOLID(145, 183, 253),
  lava: SOLID(207, 89, 15),
  magma_block: SOLID(142, 63, 31),
  netherrack: SOLID(97, 38, 38),
  soul_sand: SOLID(81, 62, 50),
  soul_soil: SOLID(75, 57, 46),
  nether_bricks: SOLID(44, 21, 26),
  red_nether_bricks: SOLID(69, 7, 9),
  glowstone: SOLID(171, 131, 84),
  nether_wart_block: SOLID(114, 2, 2),
  nether_wart: SOLID(113, 2, 2),
  warped_wart_block: SOLID(22, 119, 121),
  crimson_nylium: SOLID(130, 31, 31),
  warped_nylium: SOLID(43, 114, 101),
  shroomlight: SOLID(240, 146, 70),
  ancient_debris: SOLID(94, 66, 58),
  bone_block: SOLID(229, 225, 207),
  end_stone: SOLID(219, 222, 158),
  end_stone_bricks: SOLID(218, 224, 162),
  purpur_block: SOLID(169, 125, 169),
  purpur_pillar: SOLID(171, 129, 171),
  chorus_plant: SOLID(93, 57, 93),
  chorus_flower: SOLID(151, 120, 151),
  coal_ore: SOLID(105, 105, 105),
  iron_ore: SOLID(136, 130, 127),
  copper_ore: SOLID(124, 125, 120),
  gold_ore: SOLID(143, 140, 125),
  redstone_ore: SOLID(133, 107, 107),
  emerald_ore: SOLID(117, 142, 125),
  lapis_ore: SOLID(99, 116, 143),
  diamond_ore: SOLID(121, 141, 140),
  raw_iron_block: SOLID(166, 135, 107),
  raw_copper_block: SOLID(154, 105, 79),
  raw_gold_block: SOLID(221, 169, 46),
  coal_block: SOLID(16, 15, 15),
  iron_block: SOLID(220, 220, 220),
  gold_block: SOLID(249, 236, 79),
  diamond_block: SOLID(98, 237, 228),
  emerald_block: SOLID(42, 203, 87),
  lapis_block: SOLID(30, 67, 140),
  redstone_block: SOLID(171, 27, 9),
  netherite_block: SOLID(66, 61, 63),
  copper_block: SOLID(192, 107, 79),
  exposed_copper: SOLID(161, 125, 103),
  weathered_copper: SOLID(108, 153, 110),
  oxidized_copper: SOLID(82, 162, 132),
  amethyst_block: SOLID(133, 97, 191),
  budding_amethyst: SOLID(132, 96, 186),
  amethyst_cluster: SOLID(163, 128, 217),
  birch_leaves: SOLID(128, 167, 85),
  spruce_leaves: SOLID(97, 153, 97),
  cherry_leaves: SOLID(229, 172, 203),
  azalea_leaves: SOLID(100, 137, 49),
  flowering_azalea_leaves: SOLID(106, 138, 55),
  pale_oak_leaves: SOLID(118, 129, 105),
  dead_bush: SOLID(111, 91, 49),
  dandelion: SOLID(240, 200, 50),
  poppy: SOLID(200, 40, 40),
  sugar_cane: SOLID(148, 192, 101),
  bamboo: SOLID(93, 143, 26),
  cactus: SOLID(88, 131, 43),
  melon: SOLID(111, 153, 31),
  pumpkin: SOLID(197, 115, 24),
  carved_pumpkin: SOLID(197, 115, 24),
  jack_o_lantern: SOLID(197, 115, 24),
  hay_block: SOLID(166, 136, 37),
  wheat: SOLID(166, 151, 73),
  lily_pad: SOLID(34, 101, 26),
  mangrove_roots: SOLID(75, 60, 44),
  brown_mushroom: SOLID(153, 116, 89),
  red_mushroom: SOLID(216, 44, 42),
  brown_mushroom_block: SOLID(149, 112, 84),
  red_mushroom_block: SOLID(200, 46, 45),
  mushroom_stem: SOLID(203, 195, 178),
  bricks: SOLID(150, 97, 83),
  quartz_block: SOLID(236, 233, 226),
  prismarine: SOLID(99, 156, 151),
  prismarine_bricks: SOLID(99, 171, 158),
  dark_prismarine: SOLID(51, 91, 75),
  sea_lantern: SOLID(172, 199, 190),
  sponge: SOLID(196, 192, 75),
  wet_sponge: SOLID(171, 181, 70),
  bookshelf: SOLID(117, 95, 60),
  tinted_glass: SOLID(40, 38, 44),
  chest: SOLID(160, 110, 40),
  trapped_chest: SOLID(160, 110, 40),
  ender_chest: SOLID(20, 30, 30),
  barrel: SOLID(134, 100, 58),
  crafting_table: SOLID(122, 86, 50),
  furnace: SOLID(103, 103, 103),
  slime_block: SOLID(111, 192, 91),
  honey_block: SOLID(249, 167, 26),
  honeycomb_block: SOLID(229, 148, 29),
  sculk: SOLID(12, 35, 45),
  sculk_catalyst: SOLID(15, 44, 54),
  sculk_shrieker: SOLID(24, 55, 64),
  sculk_sensor: SOLID(7, 70, 84),
  cobweb: SOLID(228, 233, 234),
  torch: SOLID(255, 216, 128),
  lantern: SOLID(255, 200, 100),
  campfire: SOLID(210, 140, 60),
  soul_campfire: SOLID(80, 200, 220),
  beacon: SOLID(116, 220, 220),
  conduit: SOLID(160, 190, 190),
  cake: SOLID(240, 220, 200),
  spawner: SOLID(37, 53, 71),
  water: WATER,
  bubble_column: WATER,
  kelp: WATER,
  kelp_plant: WATER,
  seagrass: WATER,
  tall_seagrass: WATER,
};

const cache = new Map<string, BlockPaint>();

export function stripNamespace(id: string): string {
  const colon = id.indexOf(":");
  return colon === -1 ? id : id.slice(colon + 1);
}

function hashColor(name: string): BlockPaint {
  let hash = 2166136261;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  // A muted hue keeps unknown modded blocks from shouting on the map.
  const hue = (hash % 360) / 360;
  const saturation = 0.28;
  const lightness = 0.42 + ((hash >>> 9) % 20) / 100;
  return { kind: "solid", rgb: hslToRgb(hue, saturation, lightness) };
}

function hslToRgb(h: number, s: number, l: number): BlockRgb {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let k = t;
    if (k < 0) k += 1;
    if (k > 1) k -= 1;
    if (k < 1 / 6) return p + (q - p) * 6 * k;
    if (k < 1 / 2) return q;
    if (k < 2 / 3) return p + (q - p) * (2 / 3 - k) * 6;
    return p;
  };

  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

function mix(a: BlockRgb, b: BlockRgb, t: number): BlockRgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function dyePrefix(name: string): string | null {
  for (const dye of Object.keys(DYE_COLORS)) {
    if (name.startsWith(`${dye}_`)) return dye;
  }
  return null;
}

function woodPrefix(name: string): string | null {
  const base = name.startsWith("stripped_")
    ? name.slice("stripped_".length)
    : name;
  for (const wood of Object.keys(WOOD_COLORS)) {
    if (base.startsWith(`${wood}_`)) return wood;
  }
  return null;
}

function heuristicPaint(name: string): BlockPaint {
  if (
    TRANSPARENT_BLOCKS.has(name) ||
    name.endsWith("_stained_glass") ||
    name.endsWith("_stained_glass_pane")
  ) {
    return TRANSPARENT;
  }
  if (WATER_LIKE.has(name)) return WATER;

  const dye = dyePrefix(name);
  if (dye) {
    const rest = name.slice(dye.length + 1);
    const color = DYE_COLORS[dye];
    if (rest.includes("terracotta"))
      return { kind: "solid", rgb: mix(color, TERRACOTTA_BASE, 0.5) };
    if (rest.includes("concrete_powder"))
      return { kind: "solid", rgb: mix(color, [200, 200, 200], 0.25) };
    return { kind: "solid", rgb: color };
  }

  const wood = woodPrefix(name);
  if (wood) {
    const colors = WOOD_COLORS[wood];
    if (name.includes("leaves")) return FOLIAGE;
    if (name.includes("sapling") || name.includes("propagule")) return GRASS;
    if (
      name.includes("log") ||
      name.includes("wood") ||
      name.includes("stem") ||
      name.includes("hyphae")
    ) {
      return { kind: "solid", rgb: colors.log };
    }
    if (name.includes("roots") || name.includes("fungus"))
      return { kind: "solid", rgb: colors.log };
    return { kind: "solid", rgb: colors.planks };
  }

  if (name.endsWith("_leaves") || name === "vine" || name.includes("azalea"))
    return FOLIAGE;
  if (name.includes("coral")) {
    if (name.startsWith("dead_")) return SOLID(130, 123, 119);
    for (const [kind, rgb] of Object.entries(CORAL_COLORS)) {
      if (name.startsWith(`${kind}_`)) return { kind: "solid", rgb };
    }
  }
  if (
    name.endsWith("_grass") ||
    name === "grass" ||
    name.includes("fern") ||
    name.includes("sapling") ||
    name.includes("bush") ||
    name.includes("flower") ||
    name.includes("tulip") ||
    name.includes("orchid") ||
    name.includes("allium") ||
    name.includes("bluet") ||
    name.includes("daisy") ||
    name.includes("lilac") ||
    name.includes("peony") ||
    name.includes("rose") ||
    name.includes("dripleaf") ||
    name.includes("carrots") ||
    name.includes("potatoes") ||
    name.includes("beetroots") ||
    name.includes("sprouts") ||
    name.includes("pitcher") ||
    name.includes("spore") ||
    name.includes("cave_vines") ||
    name.includes("hanging_roots") ||
    name.includes("lichen")
  ) {
    return GRASS;
  }
  if (name.includes("mushroom")) return SOLID(153, 116, 89);
  if (name.includes("deepslate")) return EXACT.deepslate;
  if (name.includes("blackstone")) return EXACT.blackstone;
  if (name.includes("basalt")) return EXACT.basalt;
  if (name.includes("sandstone"))
    return name.startsWith("red_") ? EXACT.red_sandstone : EXACT.sandstone;
  if (name.includes("sand")) return EXACT.sand;
  if (name.includes("prismarine")) return EXACT.prismarine;
  if (name.includes("purpur")) return EXACT.purpur_block;
  if (name.includes("quartz")) return EXACT.quartz_block;
  if (name.includes("end_stone") || name.startsWith("end_"))
    return EXACT.end_stone;
  if (name.includes("nether_brick")) return EXACT.nether_bricks;
  if (name.includes("brick")) return EXACT.bricks;
  if (name.includes("copper")) return EXACT.copper_block;
  if (name.includes("iron")) return SOLID(167, 167, 167);
  if (name.includes("gold")) return EXACT.gold_block;
  if (name.includes("diamond")) return EXACT.diamond_block;
  if (name.includes("emerald")) return EXACT.emerald_block;
  if (name.includes("lapis")) return EXACT.lapis_block;
  if (name.includes("netherite")) return EXACT.netherite_block;
  if (name.includes("amethyst")) return EXACT.amethyst_block;
  if (name.includes("obsidian")) return EXACT.obsidian;
  if (name.includes("tuff")) return EXACT.tuff;
  if (name.includes("calcite")) return EXACT.calcite;
  if (name.includes("granite")) return EXACT.granite;
  if (name.includes("diorite")) return EXACT.diorite;
  if (name.includes("andesite")) return EXACT.andesite;
  if (name.includes("cobblestone")) return EXACT.cobblestone;
  if (name.includes("stone")) return EXACT.stone;
  if (name.includes("snow")) return EXACT.snow;
  if (name.includes("ice")) return EXACT.ice;
  if (name.includes("mud")) return EXACT.mud;
  if (name.includes("dirt")) return EXACT.dirt;
  if (name.includes("terracotta")) return EXACT.terracotta;
  if (name.includes("sculk")) return EXACT.sculk;
  if (name.includes("froglight")) return SOLID(250, 240, 230);
  if (name.includes("candle") || name.includes("torch")) return EXACT.torch;
  if (name.includes("lantern")) return EXACT.lantern;
  if (name.includes("rail") || name.includes("redstone"))
    return SOLID(153, 51, 51);
  if (name.includes("wool") || name.includes("carpet") || name.includes("bed"))
    return SOLID(199, 199, 199);
  if (name.includes("glass")) return TRANSPARENT;
  if (name.includes("nether") || name.includes("crimson"))
    return EXACT.netherrack;
  if (name.includes("warped")) return EXACT.warped_nylium;
  if (
    name.includes("planks") ||
    name.includes("wood") ||
    name.includes("log") ||
    name.includes("door") ||
    name.includes("fence") ||
    name.includes("sign")
  ) {
    return { kind: "solid", rgb: WOOD_COLORS.oak.planks };
  }

  return hashColor(name);
}

/** Resolves the paint for a block id such as `minecraft:grass_block`. */
export function paintForBlock(id: string): BlockPaint {
  const cached = cache.get(id);
  if (cached) return cached;

  const name = stripNamespace(id);
  const paint = EXACT[name] ?? heuristicPaint(name);
  cache.set(id, paint);
  return paint;
}

const BIOME_TINTS: Record<string, Partial<BiomeTint>> = {
  forest: { grass: [121, 192, 90], foliage: [89, 166, 55] },
  flower_forest: { grass: [121, 192, 90], foliage: [89, 166, 55] },
  birch_forest: { grass: [136, 197, 96], foliage: [110, 177, 63] },
  old_growth_birch_forest: { grass: [136, 197, 96], foliage: [110, 177, 63] },
  dark_forest: { grass: [80, 112, 50], foliage: [80, 112, 50] },
  taiga: { grass: [134, 183, 131], foliage: [104, 159, 104] },
  old_growth_pine_taiga: { grass: [134, 183, 131], foliage: [104, 159, 104] },
  old_growth_spruce_taiga: { grass: [134, 183, 131], foliage: [104, 159, 104] },
  snowy_taiga: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  snowy_plains: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  snowy_slopes: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  snowy_beach: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  frozen_peaks: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  jagged_peaks: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  ice_spikes: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  grove: {
    grass: [128, 180, 151],
    foliage: [96, 161, 123],
    water: [57, 56, 201],
  },
  frozen_river: { water: [57, 56, 201] },
  frozen_ocean: { water: [57, 56, 201] },
  deep_frozen_ocean: { water: [57, 56, 201] },
  jungle: { grass: [89, 201, 60], foliage: [48, 178, 30] },
  sparse_jungle: { grass: [89, 201, 60], foliage: [48, 178, 30] },
  bamboo_jungle: { grass: [89, 201, 60], foliage: [48, 178, 30] },
  swamp: {
    grass: [106, 112, 57],
    foliage: [106, 112, 57],
    water: [97, 123, 100],
  },
  mangrove_swamp: {
    grass: [106, 112, 57],
    foliage: [141, 177, 39],
    water: [58, 122, 106],
  },
  savanna: { grass: [191, 183, 85], foliage: [174, 164, 42] },
  savanna_plateau: { grass: [191, 183, 85], foliage: [174, 164, 42] },
  windswept_savanna: { grass: [191, 183, 85], foliage: [174, 164, 42] },
  desert: { grass: [191, 183, 85], foliage: [174, 164, 42] },
  badlands: { grass: [144, 129, 77], foliage: [158, 129, 77] },
  eroded_badlands: { grass: [144, 129, 77], foliage: [158, 129, 77] },
  wooded_badlands: { grass: [144, 129, 77], foliage: [158, 129, 77] },
  meadow: { grass: [131, 187, 109], foliage: [99, 165, 84] },
  cherry_grove: { grass: [182, 219, 97], foliage: [182, 219, 97] },
  mushroom_fields: { grass: [85, 201, 63], foliage: [43, 178, 30] },
  windswept_hills: { grass: [138, 182, 118], foliage: [106, 161, 93] },
  windswept_forest: { grass: [138, 182, 118], foliage: [106, 161, 93] },
  windswept_gravelly_hills: { grass: [138, 182, 118], foliage: [106, 161, 93] },
  stony_peaks: { grass: [138, 182, 118], foliage: [106, 161, 93] },
  lukewarm_ocean: { water: [69, 173, 242] },
  deep_lukewarm_ocean: { water: [69, 173, 242] },
  warm_ocean: { water: [67, 213, 238] },
  cold_ocean: { water: [61, 87, 214] },
  deep_cold_ocean: { water: [61, 87, 214] },
};

const tintCache = new Map<string, BiomeTint>();

export function biomeTint(biomeId: string | null): BiomeTint {
  if (!biomeId) return DEFAULT_TINT;

  const cached = tintCache.get(biomeId);
  if (cached) return cached;

  const partial = BIOME_TINTS[stripNamespace(biomeId)];
  const tint: BiomeTint = partial
    ? { ...DEFAULT_TINT, ...partial }
    : DEFAULT_TINT;
  tintCache.set(biomeId, tint);
  return tint;
}

/** Final colour of a paint under a biome tint; `null` means see-through. */
export function resolvePaint(
  paint: BlockPaint,
  tint: BiomeTint,
): BlockRgb | null {
  switch (paint.kind) {
    case "solid":
      return paint.rgb;
    case "grass":
      return tint.grass;
    case "foliage":
      return tint.foliage;
    case "water":
      return tint.water;
    default:
      return null;
  }
}

export function isWaterLike(id: string): boolean {
  return paintForBlock(id).kind === "water";
}

export function isTransparentBlock(id: string): boolean {
  return paintForBlock(id).kind === "transparent";
}
