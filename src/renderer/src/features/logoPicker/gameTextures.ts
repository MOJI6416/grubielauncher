import type { CubeFaces, LogoSubject } from "./logoRender";
import type { Rgb, Texture } from "./pixelArt";

export type Rect = readonly [number, number, number, number];

export interface Source {
  path: string;
  crop?: Rect;
  gridWidth?: number;
}

export type Tint = "grass" | "foliage" | Rgb;

export interface Layer {
  from: readonly Source[];
  tint?: Tint;
  at?: readonly [number, number];
}

export type Face = readonly Layer[];

export type TextureSpec =
  | {
      kind: "cube";
      top: Face;
      front: Face;
      side: Face;
      tall?: number;
      scale: number;
    }
  | { kind: "sprite"; layers: Face };

export interface TexturePack {
  id: string;
  textures: ReadonlyMap<string, Texture>;
}

const TEXTURE_ROOT = "assets/minecraft/textures/";
const GRASS: Rgb = [145, 189, 89];
const FOLIAGE: Rgb = [72, 181, 24];

export function texturePath(name: string): string {
  return `${TEXTURE_ROOT}${name}.png`;
}

export function firstFrame(texture: Texture): Texture {
  const { width, height } = texture;
  if (height <= width || height % width !== 0) return texture;
  return {
    width,
    height: width,
    pixels: texture.pixels.slice(0, width * width * 4),
  };
}

export function crop(
  texture: Texture,
  [x, y, width, height]: Rect,
): Texture | null {
  if (
    x < 0 ||
    y < 0 ||
    x + width > texture.width ||
    y + height > texture.height
  ) {
    return null;
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * texture.width + x) * 4;
    pixels.set(
      texture.pixels.subarray(from, from + width * 4),
      row * width * 4,
    );
  }
  return { width, height, pixels };
}

function tinted(texture: Texture, color: Rgb): Texture {
  const pixels = new Uint8ClampedArray(texture.pixels);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = (pixels[index] * color[0]) / 255;
    pixels[index + 1] = (pixels[index + 1] * color[1]) / 255;
    pixels[index + 2] = (pixels[index + 2] * color[2]) / 255;
  }
  return { ...texture, pixels };
}

function over(
  base: Texture,
  top: Texture,
  [left, upper]: readonly [number, number],
): Texture {
  const pixels = new Uint8ClampedArray(base.pixels);
  for (let y = 0; y < top.height; y++) {
    for (let x = 0; x < top.width; x++) {
      const tx = left + x;
      const ty = upper + y;
      if (tx < 0 || ty < 0 || tx >= base.width || ty >= base.height) continue;
      const from = (y * top.width + x) * 4;
      const alpha = top.pixels[from + 3] / 255;
      if (alpha === 0) continue;
      const to = (ty * base.width + tx) * 4;
      const below = pixels[to + 3] / 255;
      const out = alpha + below * (1 - alpha);
      for (let channel = 0; channel < 3; channel++) {
        pixels[to + channel] =
          (top.pixels[from + channel] * alpha +
            pixels[to + channel] * below * (1 - alpha)) /
          out;
      }
      pixels[to + 3] = out * 255;
    }
  }
  return { ...base, pixels };
}

function enlarged(texture: Texture, factor: number): Texture {
  if (factor === 1) return texture;
  const width = Math.round(texture.width * factor);
  const height = Math.round(texture.height * factor);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from =
        (Math.floor(y / factor) * texture.width + Math.floor(x / factor)) * 4;
      pixels.set(texture.pixels.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return { width, height, pixels };
}

function resolveTint(tint: Tint): Rgb {
  if (tint === "grass") return GRASS;
  if (tint === "foliage") return FOLIAGE;
  return tint;
}

function readSource(
  source: Source,
  pack: TexturePack,
): { texture: Texture; scale: number } | null {
  const found = pack.textures.get(source.path);
  if (!found) return null;
  const frame = firstFrame(found);
  if (!source.crop) return { texture: frame, scale: 1 };

  const scale = source.gridWidth ? frame.width / source.gridWidth : 1;
  if (!Number.isInteger(scale) || scale < 1) return null;
  const [x, y, width, height] = source.crop;
  const texture = crop(frame, [
    x * scale,
    y * scale,
    width * scale,
    height * scale,
  ]);
  return texture ? { texture, scale } : null;
}

export function buildFace(face: Face, pack: TexturePack): Texture | null {
  let result: Texture | null = null;
  let resultScale = 1;

  for (const layer of face) {
    let read: { texture: Texture; scale: number } | null = null;
    for (const source of layer.from) {
      read = readSource(source, pack);
      if (read) break;
    }

    if (!read) {
      if (!result) return null;
      continue;
    }

    let texture = layer.tint
      ? tinted(read.texture, resolveTint(layer.tint))
      : read.texture;
    if (!result) {
      result = texture;
      resultScale = read.scale;
      continue;
    }

    texture = enlarged(texture, resultScale / read.scale);
    const [left, upper] = layer.at ?? [0, 0];
    result = over(result, texture, [left * resultScale, upper * resultScale]);
  }

  return result;
}

export function buildSubject(
  spec: TextureSpec,
  pack: TexturePack,
): LogoSubject | null {
  if (spec.kind === "sprite") {
    const texture = buildFace(spec.layers, pack);
    return texture ? { kind: "sprite", texture } : null;
  }

  const top = buildFace(spec.top, pack);
  const front = buildFace(spec.front, pack);
  const side = buildFace(spec.side, pack);
  if (!top || !front || !side) return null;

  const faces: CubeFaces = { top, front, side, tall: spec.tall };
  return { kind: "cube", faces, scale: spec.scale };
}

export function specPaths(spec: TextureSpec): string[] {
  const faces =
    spec.kind === "sprite" ? [spec.layers] : [spec.top, spec.front, spec.side];
  return faces.flatMap((face) =>
    face.flatMap((layer) => layer.from.map((source) => source.path)),
  );
}
