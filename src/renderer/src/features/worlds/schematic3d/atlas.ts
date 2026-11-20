import type { BlockTexture } from "@/types/Schematic";

export type TextureAlpha = "opaque" | "cutout" | "translucent";

export interface Atlas {
  canvas: HTMLCanvasElement;
  rects: [number, number, number, number][];
  alpha: TextureAlpha[];
}

const MAX_ATLAS = 4096;
const PADDING = 1;

async function decode(texture: BlockTexture): Promise<ImageBitmap | null> {
  if (!texture.png) return null;
  try {
    const blob = new Blob([texture.png as Uint8Array<ArrayBuffer>], { type: "image/png" });
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export function classifyAlpha(pixels: Uint8ClampedArray): TextureAlpha {
  let clear = 0;
  let partial = 0;
  const total = pixels.length / 4;
  for (let index = 3; index < pixels.length; index += 4) {
    const alpha = pixels[index];
    if (alpha < 16) clear += 1;
    else if (alpha < 235) partial += 1;
  }
  if (partial > total * 0.02) return "translucent";
  if (clear > 0) return "cutout";
  return "opaque";
}

export async function buildAtlas(textures: BlockTexture[]): Promise<Atlas> {
  const images = await Promise.all(textures.map(decode));
  const widest = images.reduce((size, image) => Math.max(size, image?.width ?? 16), 16);
  const count = Math.max(1, textures.length);
  const columns = Math.ceil(Math.sqrt(count));
  let tile = Math.min(128, widest);
  while (tile > 8 && columns * (tile + PADDING * 2) > MAX_ATLAS) tile = Math.floor(tile / 2);
  const slot = tile + PADDING * 2;
  const rows = Math.ceil(count / columns);
  const width = columns * slot;
  const height = rows * slot;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingEnabled = false;

  const rects: Atlas["rects"] = [];
  const alpha: TextureAlpha[] = [];

  textures.forEach((texture, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = column * slot + PADDING;
    const top = row * slot + PADDING;
    const image = images[index];

    if (image) {
      const animated = image.height > image.width && image.height % image.width === 0;
      const frameWidth = image.width;
      const frameHeight = animated ? image.width : image.height;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        context.drawImage(image, 0, 0, frameWidth, frameHeight, left + dx, top + dy, tile, tile);
      }
      context.clearRect(left, top, tile, tile);
      context.drawImage(image, 0, 0, frameWidth, frameHeight, left, top, tile, tile);
      image.close();
    } else {
      const [r, g, b] = texture.color ?? [255, 0, 255];
      context.fillStyle = `rgb(${r}, ${g}, ${b})`;
      context.fillRect(left - PADDING, top - PADDING, slot, slot);
    }

    alpha.push(classifyAlpha(context.getImageData(left, top, tile, tile).data));
    rects.push([left / width, top / height, tile / width, tile / height]);
  });

  return { canvas, rects, alpha };
}
