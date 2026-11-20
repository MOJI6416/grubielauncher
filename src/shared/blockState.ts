export type BlockProps = Record<string, string>;

export interface ParsedBlockState {
  name: string;
  props: BlockProps;
}

export const AIR_BLOCKS: ReadonlySet<string> = new Set([
  "minecraft:air",
  "minecraft:cave_air",
  "minecraft:void_air",
  "minecraft:structure_void",
]);

export function blockBaseId(state: string): string {
  const trimmed = state.trim();
  const cut = trimmed.search(/[[{]/);
  const id = (cut === -1 ? trimmed : trimmed.slice(0, cut)).trim();
  return id.includes(":") ? id : `minecraft:${id}`;
}

export function parseBlockState(state: string): ParsedBlockState {
  const name = blockBaseId(state);
  const props: BlockProps = {};
  const open = state.indexOf("[");
  const close = state.lastIndexOf("]");
  if (open !== -1 && close > open) {
    for (const pair of state.slice(open + 1, close).split(",")) {
      const at = pair.indexOf("=");
      if (at <= 0) continue;
      props[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
    }
  }
  return { name, props };
}

export function formatBlockState(name: string, props: BlockProps): string {
  const keys = Object.keys(props);
  if (!keys.length) return name;
  return `${name}[${keys.map((key) => `${key}=${props[key]}`).join(",")}]`;
}

export function isAirBlock(id: string): boolean {
  return AIR_BLOCKS.has(blockBaseId(id));
}

const WALL_ITEMS: [RegExp, string][] = [
  [/^(.*)wall_torch$/, "$1torch"],
  [/^(.*)_wall_hanging_sign$/, "$1_hanging_sign"],
  [/^(.*)_wall_sign$/, "$1_sign"],
  [/^(.*)_wall_banner$/, "$1_banner"],
  [/^(.*)_wall_head$/, "$1_head"],
  [/^(.*)_wall_skull$/, "$1_skull"],
  [/^(.*)_wall_fan$/, "$1_fan"],
];

const NOT_ITEMS = new Set([
  "minecraft:piston_head",
  "minecraft:moving_piston",
]);

export function materialOf(state: string): { id: string; factor: number } {
  const { name, props } = parseBlockState(state);
  if (NOT_ITEMS.has(name)) return { id: name, factor: 0 };
  if (props.half === "upper") return { id: name, factor: 0 };
  if (props.part === "head" && name.endsWith("_bed")) {
    return { id: name, factor: 0 };
  }
  if (name.endsWith("_slab") && props.type === "double") {
    return { id: name, factor: 2 };
  }

  const colon = name.indexOf(":");
  const namespace = name.slice(0, colon);
  const path = name.slice(colon + 1);
  for (const [pattern, replacement] of WALL_ITEMS) {
    if (pattern.test(path)) {
      return {
        id: `${namespace}:${path.replace(pattern, replacement)}`,
        factor: 1,
      };
    }
  }
  return { id: name, factor: 1 };
}

export function stackSizeOf(id: string): number {
  const path = id.slice(id.indexOf(":") + 1);
  if (/(^|_)bed$|shulker_box$|^cake$/.test(path)) return 1;
  if (/_sign$|_banner$|^armor_stand$/.test(path)) return 16;
  return 64;
}

export function readableBlockId(id: string): string {
  const path = id.slice(id.indexOf(":") + 1).split("/").pop() ?? id;
  const words = path.split(/[_\s]+/).filter(Boolean);
  if (!words.length) return id;
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const MINECRAFT_LOCALES: Record<string, string> = {
  en: "en_us",
  ru: "ru_ru",
  uk: "uk_ua",
  de: "de_de",
  es: "es_es",
  fr: "fr_fr",
  pl: "pl_pl",
  pt: "pt_br",
  tr: "tr_tr",
};

export function minecraftLocale(locale: string): string {
  const short = locale.toLowerCase().split(/[-_]/)[0];
  return MINECRAFT_LOCALES[short] ?? "en_us";
}
