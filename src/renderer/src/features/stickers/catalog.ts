export interface StickerItem {
  pack: string;
  id: string;
  emoji: string;
  rest: number;
}

export interface StickerPack {
  id: string;
  items: StickerItem[];
}

const NOTO_IDS = [
  "1f600", "1f601", "1f602", "1f923", "1f60a", "1f607", "1f642", "1f609",
  "1f60d", "1f970", "1f618", "1f60b", "1f61c", "1f92a", "1f60e", "1f929",
  "1f973", "1f60f", "1f914", "1f928", "1f610", "1f644", "1f62c", "1f634",
  "1f971", "1f62e", "1f631", "1f633", "1f97a", "1f622", "1f62d", "1f624",
  "1f621", "1f92c", "1f92f", "1f976", "1f975", "1f922", "1f92e", "1f921",
  "1f480", "1f47b", "1f47d", "1f916", "1f4a9", "1f648", "1f44d", "1f44e",
  "1f44f", "1f64f", "1f44b", "1f91d", "1f4aa", "1f64c", "1fae1", "2764_fe0f",
  "1f494", "1f525", "2728", "1f389", "1f4af", "1f440", "1f680", "1f3c6",
  "26a1", "1f48e", "1f308", "1f4a5", "1f37f",
];

const DEFAULT_REST = 0.5;
const NOTO_REST: Record<string, number> = {
  "1f923": 0,
  "1f480": 0,
  "26a1": 0,
  "1f440": 0,
  "2728": 0,
  "1f494": 0.25,
  "1f644": 0.25,
  "1f92f": 0.25,
  "1f4a5": 0.25,
};

export const STICKER_VALUE_PATTERN = /^[a-z0-9-]{1,32}\/[a-z0-9_-]{1,64}$/;

function emojiOf(id: string): string {
  return String.fromCodePoint(
    ...id.split("_").map((part) => Number.parseInt(part, 16)),
  );
}

export const STICKER_PACKS: StickerPack[] = [
  {
    id: "noto",
    items: NOTO_IDS.map((id) => ({
      pack: "noto",
      id,
      emoji: emojiOf(id),
      rest: NOTO_REST[id] ?? DEFAULT_REST,
    })),
  },
];

export function stickerValue(item: Pick<StickerItem, "pack" | "id">): string {
  return `${item.pack}/${item.id}`;
}

const BY_VALUE = new Map(
  STICKER_PACKS.flatMap((pack) =>
    pack.items.map((item) => [stickerValue(item), item] as const),
  ),
);

export function findSticker(value: string): StickerItem | null {
  return BY_VALUE.get(value) ?? null;
}
