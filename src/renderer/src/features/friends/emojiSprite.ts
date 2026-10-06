import EmojiSpriteWorker from "./emojiSpriteWorker?worker";
import { EMOJI_FONT_FAMILY } from "./chatEmoji";

export const EMOJI_SPRITE_CELL = 24;
const SPRITE_COLUMNS = 16;
const GLYPH_SIZE = 20;

export interface EmojiSpriteRequest {
  emoji: string[];
  columns: number;
  cell: number;
  glyph: number;
  scale: number;
  font: string;
}

export interface EmojiSprite {
  url: string;
  columns: number;
  rows: number;
  positions: Map<string, number>;
}

let pending: Promise<EmojiSprite | null> | null = null;
let ready: EmojiSprite | null = null;

export function currentEmojiSprite(): EmojiSprite | null {
  return ready;
}

export function loadEmojiSprite(emoji: string[]): Promise<EmojiSprite | null> {
  pending ??= new Promise((resolve) => {
    const unique = [...new Set(emoji)];
    let worker: Worker;
    try {
      worker = new EmojiSpriteWorker();
    } catch {
      resolve(null);
      return;
    }

    worker.addEventListener("message", (event: MessageEvent<Blob | null>) => {
      worker.terminate();
      if (!event.data) {
        resolve(null);
        return;
      }
      ready = {
        url: URL.createObjectURL(event.data),
        columns: SPRITE_COLUMNS,
        rows: Math.ceil(unique.length / SPRITE_COLUMNS),
        positions: new Map(unique.map((item, index) => [item, index])),
      };
      resolve(ready);
    });
    worker.addEventListener("error", () => {
      worker.terminate();
      resolve(null);
    });

    const request: EmojiSpriteRequest = {
      emoji: unique,
      columns: SPRITE_COLUMNS,
      cell: EMOJI_SPRITE_CELL,
      glyph: GLYPH_SIZE,
      scale: Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio || 1))),
      font: EMOJI_FONT_FAMILY,
    };
    worker.postMessage(request);
  });
  return pending;
}
