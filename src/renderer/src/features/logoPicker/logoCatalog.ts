import {
  buildSubject,
  texturePath,
  type Face,
  type Layer,
  type Rect,
  type TexturePack,
  type TextureSpec,
} from "./gameTextures";
import type { LogoSubject } from "./logoRender";

export type LogoCategory = "blocks" | "mobs" | "items";

export interface LogoPreset {
  id: string;
  category: LogoCategory;
  spec: TextureSpec;
}

export const LOGO_CATEGORIES: LogoCategory[] = ["blocks", "mobs", "items"];

const BLOCK_SCALE = 0.74;
const ENTITY_GRID = 64;
const HEAD_SCALE = 0.7;
const POTION_RED: readonly [number, number, number] = [248, 36, 35];

const layer = (
  names: string | readonly string[],
  extra: Omit<Layer, "from"> = {},
): Layer => ({
  from: (typeof names === "string" ? [names] : names).map((name) => ({
    path: texturePath(name),
  })),
  ...extra,
});

const block = (name: string): Face => [layer(`block/${name}`)];

const cube = (
  top: Face,
  front: Face = top,
  side: Face = front,
): TextureSpec => ({
  kind: "cube",
  top,
  front,
  side,
  scale: BLOCK_SCALE,
});

const item = (...names: string[]): TextureSpec => ({
  kind: "sprite",
  layers: [layer(names.map((name) => `item/${name}`))],
});

interface Box {
  u: number;
  v: number;
  width: number;
  height: number;
  depth: number;
}

const box = (
  u: number,
  v: number,
  width: number,
  height = width,
  depth = width,
): Box => ({
  u,
  v,
  width,
  height,
  depth,
});

const faceRects = ({
  u,
  v,
  width,
  height,
  depth,
}: Box): Record<"top" | "front" | "side", Rect> => ({
  top: [u + depth, v, width, depth],
  front: [u + depth, v + depth, width, height],
  side: [u + depth + width, v + depth, depth, height],
});

const region = (
  names: readonly string[],
  rect: Rect,
  extra: Omit<Layer, "from"> = {},
): Layer => ({
  from: names.map((name) => ({
    path: texturePath(name),
    crop: rect,
    gridWidth: ENTITY_GRID,
  })),
  ...extra,
});

function head(
  names: readonly string[],
  shape: Box,
  options: {
    hat?: boolean;
    eyes?: readonly string[];
    front?: readonly Layer[];
  } = {},
): TextureSpec {
  const rects = faceRects(shape);
  const hat = options.hat ? faceRects({ ...shape, u: shape.u + 32 }) : null;
  const eyes = options.eyes ? faceRects(shape) : null;
  const face = (part: "top" | "front" | "side"): Face => [
    region(names, rects[part]),
    ...(eyes && options.eyes ? [region(options.eyes, eyes[part])] : []),
    ...(part === "front" ? (options.front ?? []) : []),
    ...(hat ? [region(names, hat[part])] : []),
  ];

  return {
    kind: "cube",
    top: face("top"),
    front: face("front"),
    side: face("side"),
    tall: shape.height / shape.width,
    scale: HEAD_SCALE,
  };
}

const PLAYER_HEAD = box(0, 0, 8);
const SHEEP_FACE = faceRects(box(0, 0, 6, 6, 8));
const WOOL = faceRects(box(0, 0, 6));
const WOOL_TEXTURES = ["entity/sheep/sheep_wool", "entity/sheep/sheep_fur"];

const CATALOG: Record<LogoCategory, Record<string, TextureSpec>> = {
  blocks: {
    grass: cube(
      [layer("block/grass_block_top", { tint: "grass" })],
      [
        layer("block/grass_block_side"),
        layer("block/grass_block_side_overlay", { tint: "grass" }),
      ],
    ),
    dirt: cube(block("dirt")),
    stone: cube(block("stone")),
    cobblestone: cube(block("cobblestone")),
    mossyCobblestone: cube(block("mossy_cobblestone")),
    oakLog: cube(block("oak_log_top"), block("oak_log")),
    oakPlanks: cube(block("oak_planks")),
    craftingTable: cube(
      block("crafting_table_top"),
      block("crafting_table_front"),
      block("crafting_table_side"),
    ),
    bookshelf: cube(block("oak_planks"), block("bookshelf")),
    furnace: cube(
      block("furnace_top"),
      block("furnace_front_on"),
      block("furnace_side"),
    ),
    barrel: cube(block("barrel_top"), block("barrel_side")),
    tnt: cube(block("tnt_top"), block("tnt_side")),
    jackOLantern: cube(
      block("pumpkin_top"),
      block("jack_o_lantern"),
      block("pumpkin_side"),
    ),
    melon: cube(block("melon_top"), block("melon_side")),
    hayBale: cube(block("hay_block_top"), block("hay_block_side")),
    leaves: cube([layer("block/oak_leaves", { tint: "foliage" })]),
    sand: cube(block("sand")),
    gravel: cube(block("gravel")),
    bricks: cube(block("bricks")),
    ice: cube(block("ice")),
    coalOre: cube(block("coal_ore")),
    ironOre: cube(block("iron_ore")),
    goldOre: cube(block("gold_ore")),
    redstoneOre: cube(block("redstone_ore")),
    lapisOre: cube(block("lapis_ore")),
    diamondOre: cube(block("diamond_ore")),
    emeraldOre: cube(block("emerald_ore")),
    ironBlock: cube(block("iron_block")),
    goldBlock: cube(block("gold_block")),
    diamondBlock: cube(block("diamond_block")),
    emeraldBlock: cube(block("emerald_block")),
    netheriteBlock: cube(block("netherite_block")),
    copper: cube(block("copper_block")),
    quartz: cube(block("quartz_block_top"), block("quartz_block_side")),
    amethyst: cube(block("amethyst_block")),
    deepslate: cube(block("deepslate_top"), block("deepslate")),
    sculk: cube(block("sculk")),
    obsidian: cube(block("obsidian")),
    cryingObsidian: cube(block("crying_obsidian")),
    netherrack: cube(block("netherrack")),
    ancientDebris: cube(
      block("ancient_debris_top"),
      block("ancient_debris_side"),
    ),
    magma: cube(block("magma")),
    glowstone: cube(block("glowstone")),
    endStone: cube(block("end_stone")),
    prismarine: cube(block("prismarine")),
    seaLantern: cube(block("sea_lantern")),
    sponge: cube(block("sponge")),
    jukebox: cube(block("jukebox_top"), block("jukebox_side")),
  },
  mobs: {
    steve: head(["entity/player/wide/steve", "entity/steve"], PLAYER_HEAD, {
      hat: true,
    }),
    alex: head(["entity/player/slim/alex", "entity/alex"], PLAYER_HEAD, {
      hat: true,
    }),
    creeper: head(["entity/creeper/creeper"], PLAYER_HEAD),
    zombie: head(["entity/zombie/zombie"], PLAYER_HEAD, { hat: true }),
    husk: head(["entity/zombie/husk"], PLAYER_HEAD, { hat: true }),
    drowned: head(["entity/zombie/drowned"], PLAYER_HEAD, { hat: true }),
    skeleton: head(["entity/skeleton/skeleton"], PLAYER_HEAD),
    stray: head(["entity/skeleton/stray"], PLAYER_HEAD),
    witherSkeleton: head(["entity/skeleton/wither_skeleton"], PLAYER_HEAD),
    enderman: head(["entity/enderman/enderman"], PLAYER_HEAD, {
      eyes: ["entity/enderman/enderman_eyes"],
    }),
    spider: head(["entity/spider/spider"], box(32, 4, 8), {
      eyes: ["entity/spider/spider_eyes", "entity/spider_eyes"],
    }),
    blaze: head(["entity/blaze"], PLAYER_HEAD),
    ghast: head(["entity/ghast/ghast"], box(0, 0, 16)),
    pig: head(["entity/pig/pig_temperate", "entity/pig/pig"], PLAYER_HEAD, {
      front: [
        region(["entity/pig/pig_temperate", "entity/pig/pig"], [17, 17, 4, 3], {
          at: [2, 4],
        }),
      ],
    }),
    cow: head(
      ["entity/cow/cow_temperate", "entity/cow/cow"],
      box(0, 0, 8, 8, 6),
    ),
    sheep: {
      kind: "cube",
      top: [region(WOOL_TEXTURES, WOOL.top)],
      front: [region(["entity/sheep/sheep"], SHEEP_FACE.front)],
      side: [region(WOOL_TEXTURES, WOOL.side)],
      scale: HEAD_SCALE,
    },
    villager: head(["entity/villager/villager"], box(0, 0, 8, 10, 8), {
      front: [
        region(["entity/villager/villager"], [26, 2, 2, 4], { at: [3, 6] }),
      ],
    }),
  },
  items: {
    sword: item("diamond_sword"),
    netheriteSword: item("netherite_sword"),
    pickaxe: item("diamond_pickaxe"),
    axe: item("iron_axe"),
    bow: item("bow"),
    trident: item("trident"),
    apple: item("apple"),
    goldenApple: item("golden_apple"),
    cake: item("cake"),
    diamond: item("diamond"),
    emerald: item("emerald"),
    goldIngot: item("gold_ingot"),
    enderPearl: item("ender_pearl"),
    enderEye: item("ender_eye"),
    netherStar: item("nether_star"),
    totem: item("totem_of_undying"),
    elytra: item("elytra"),
    heart: {
      kind: "sprite",
      layers: [
        {
          from: [
            { path: texturePath("gui/sprites/hud/heart/full") },
            {
              path: texturePath("gui/icons"),
              crop: [52, 0, 9, 9],
              gridWidth: 256,
            },
          ],
        },
      ],
    },
    potion: {
      kind: "sprite",
      layers: [
        layer("item/potion_overlay", { tint: POTION_RED }),
        layer("item/potion"),
      ],
    },
    experienceBottle: item("experience_bottle"),
    torch: { kind: "sprite", layers: block("torch") },
    book: item("enchanted_book"),
    compass: item("compass_16", "compass"),
    clock: item("clock_00", "clock"),
  },
};

export const LOGO_PRESETS: LogoPreset[] = LOGO_CATEGORIES.flatMap((category) =>
  Object.entries(CATALOG[category]).map(([id, spec]) => ({
    id,
    category,
    spec,
  })),
);

export function findPreset(id: string): LogoPreset | undefined {
  return LOGO_PRESETS.find((preset) => preset.id === id);
}

const subjects = new Map<string, LogoSubject | null>();

export function resolveSubject(
  preset: LogoPreset,
  pack: TexturePack | null,
): LogoSubject | null {
  if (!pack) return null;
  const key = `${pack.id}|${preset.id}`;
  if (subjects.has(key)) return subjects.get(key) ?? null;
  const subject = buildSubject(preset.spec, pack);
  subjects.set(key, subject);
  return subject;
}
