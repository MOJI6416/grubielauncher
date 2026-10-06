import type { LottiePlayer } from "lottie-web";
import type { StickerItem } from "./catalog";

type StickerData = Record<string, unknown>;
type Loader = () => Promise<StickerData>;

const NOTO = import.meta.glob<StickerData>("../../assets/stickers/noto/*.json", {
  import: "default",
});

const NOTO_POSTERS = import.meta.glob<string>("../../assets/stickers/noto/*.webp", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});

function byId<T>(modules: Record<string, T>, extension: string): Record<string, T> {
  return Object.fromEntries(
    Object.entries(modules).map(([file, value]) => [
      file.slice(file.lastIndexOf("/") + 1, -extension.length),
      value,
    ]),
  );
}

const LOADERS: Record<string, Record<string, Loader>> = {
  noto: byId(NOTO, ".json"),
};

const POSTERS: Record<string, Record<string, string>> = {
  noto: byId(NOTO_POSTERS, ".webp"),
};

let player: Promise<LottiePlayer> | null = null;

export function loadLottie(): Promise<LottiePlayer> {
  player ??= import("lottie-web/build/player/lottie_light").then(
    (module) => module.default,
  );
  return player;
}

export function loadStickerData(item: StickerItem): Promise<StickerData> {
  const load = LOADERS[item.pack]?.[item.id];
  return load ? load() : Promise.reject(new Error("unknown_sticker"));
}

export function hasStickerData(item: StickerItem): boolean {
  return Boolean(LOADERS[item.pack]?.[item.id]);
}

export function stickerPoster(item: StickerItem): string | undefined {
  return POSTERS[item.pack]?.[item.id];
}
