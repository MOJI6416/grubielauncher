export interface PixelSize {
  width: number;
  height: number;
}

export interface PixelImage extends PixelSize {
  data: Uint8ClampedArray;
}

export type SkinTextureProblem =
  | "empty"
  | "notPng"
  | "tooLarge"
  | "unsupportedSize";

export interface SkinTextureInfo extends PixelSize {
  scale: number;
  legacy: boolean;
}

export type SkinTextureCheck =
  | { ok: true; info: SkinTextureInfo }
  | { ok: false; problem: SkinTextureProblem };

export const MAX_SKIN_TEXTURE_BYTES = 512 * 1024;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readUInt32BE(bytes: ArrayLike<number>, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3]
  );
}

export function readPngSize(bytes: ArrayLike<number>): PixelSize | null {
  if (bytes.length < 24) return null;

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return null;
  }

  if (
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }

  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);
  if (width <= 0 || height <= 0) return null;

  return { width, height };
}

export function isSupportedSkinSize(size: PixelSize | null): boolean {
  if (!size) return false;
  if (size.width % 64 !== 0 || size.width > 1024) return false;

  return size.height === size.width || size.height * 2 === size.width;
}

export function computeCapeScale(size: PixelSize | null): number | null {
  if (!size || size.width <= 0 || size.height <= 0) return null;
  if (size.width === size.height * 2) return size.width / 64;
  if (size.width * 17 === size.height * 22) return size.width / 22;
  if (size.width * 11 === size.height * 23) return size.width / 46;

  return null;
}

export function isSupportedCapeSize(size: PixelSize | null): boolean {
  return computeCapeScale(size) !== null;
}

export function inspectSkinTexture(bytes: Uint8Array | null): SkinTextureCheck {
  if (!bytes || bytes.length === 0) return { ok: false, problem: "empty" };
  if (bytes.length > MAX_SKIN_TEXTURE_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }

  const size = readPngSize(bytes);
  if (!size) return { ok: false, problem: "notPng" };
  if (!isSupportedSkinSize(size)) {
    return { ok: false, problem: "unsupportedSize" };
  }

  return {
    ok: true,
    info: {
      width: size.width,
      height: size.height,
      scale: size.width / 64,
      legacy: size.height * 2 === size.width,
    },
  };
}

export function inspectCapeTexture(bytes: Uint8Array | null): SkinTextureCheck {
  if (!bytes || bytes.length === 0) return { ok: false, problem: "empty" };
  if (bytes.length > MAX_SKIN_TEXTURE_BYTES) {
    return { ok: false, problem: "tooLarge" };
  }

  const size = readPngSize(bytes);
  if (!size) return { ok: false, problem: "notPng" };

  const scale = computeCapeScale(size);
  if (scale === null) return { ok: false, problem: "unsupportedSize" };

  return {
    ok: true,
    info: {
      width: size.width,
      height: size.height,
      scale,
      legacy: size.width !== size.height * 2,
    },
  };
}

export function createPixelImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function pixelOffset(image: PixelImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

export function copyRegion(
  source: PixelImage,
  target: PixelImage,
  region: {
    sx: number;
    sy: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    flipX?: boolean;
  },
): void {
  const { sx, sy, width, height, dx, dy, flipX } = region;

  for (let row = 0; row < height; row += 1) {
    const sourceY = sy + row;
    const targetY = dy + row;
    if (sourceY < 0 || sourceY >= source.height) continue;
    if (targetY < 0 || targetY >= target.height) continue;

    for (let column = 0; column < width; column += 1) {
      const sourceX = sx + column;
      const targetX = dx + (flipX ? width - 1 - column : column);
      if (sourceX < 0 || sourceX >= source.width) continue;
      if (targetX < 0 || targetX >= target.width) continue;

      const from = pixelOffset(source, sourceX, sourceY);
      const to = pixelOffset(target, targetX, targetY);

      target.data[to] = source.data[from];
      target.data[to + 1] = source.data[from + 1];
      target.data[to + 2] = source.data[from + 2];
      target.data[to + 3] = source.data[from + 3];
    }
  }
}

const LEGACY_PARTS: [number, number, number, number, number, number][] = [
  [4, 16, 4, 4, 20, 48],
  [8, 16, 4, 4, 24, 48],
  [0, 20, 4, 12, 24, 52],
  [4, 20, 4, 12, 20, 52],
  [8, 20, 4, 12, 16, 52],
  [12, 20, 4, 12, 28, 52],
  [44, 16, 4, 4, 36, 48],
  [48, 16, 4, 4, 40, 48],
  [40, 20, 4, 12, 40, 52],
  [44, 20, 4, 12, 36, 52],
  [48, 20, 4, 12, 32, 52],
  [52, 20, 4, 12, 44, 52],
];

export function isLegacySkinImage(image: PixelSize): boolean {
  return image.height * 2 === image.width;
}

export function upgradeLegacySkin(image: PixelImage): PixelImage {
  if (!isLegacySkinImage(image)) return image;

  const scale = image.width / 64;
  const upgraded = createPixelImage(image.width, image.width);

  copyRegion(image, upgraded, {
    sx: 0,
    sy: 0,
    width: image.width,
    height: image.height,
    dx: 0,
    dy: 0,
  });

  for (const [sx, sy, width, height, dx, dy] of LEGACY_PARTS) {
    copyRegion(upgraded, upgraded, {
      sx: sx * scale,
      sy: sy * scale,
      width: width * scale,
      height: height * scale,
      dx: dx * scale,
      dy: dy * scale,
      flipX: true,
    });
  }

  return upgraded;
}

function regionMatches(
  image: PixelImage,
  scale: number,
  x: number,
  y: number,
  width: number,
  height: number,
  predicate: (r: number, g: number, b: number, a: number) => boolean,
): boolean {
  for (let row = 0; row < height * scale; row += 1) {
    for (let column = 0; column < width * scale; column += 1) {
      const pixelX = x * scale + column;
      const pixelY = y * scale + row;
      if (pixelX >= image.width || pixelY >= image.height) return false;

      const offset = pixelOffset(image, pixelX, pixelY);
      if (
        !predicate(
          image.data[offset],
          image.data[offset + 1],
          image.data[offset + 2],
          image.data[offset + 3],
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

function regionHasTransparency(
  image: PixelImage,
  scale: number,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  for (let row = 0; row < height * scale; row += 1) {
    for (let column = 0; column < width * scale; column += 1) {
      const pixelX = x * scale + column;
      const pixelY = y * scale + row;
      if (pixelX >= image.width || pixelY >= image.height) continue;

      const offset = pixelOffset(image, pixelX, pixelY);
      if (image.data[offset + 3] !== 255) return true;
    }
  }

  return false;
}

const SLIM_AREAS: [number, number, number, number][] = [
  [50, 16, 2, 4],
  [54, 20, 2, 12],
  [42, 48, 2, 4],
  [46, 52, 2, 12],
];

export function inferSkinModel(image: PixelImage): "slim" | "classic" {
  const modern = upgradeLegacySkin(image);
  const scale = modern.width / 64;
  if (scale <= 0) return "classic";

  const transparent = SLIM_AREAS.some(([x, y, width, height]) =>
    regionHasTransparency(modern, scale, x, y, width, height),
  );
  if (transparent) return "slim";

  const isBlack = SLIM_AREAS.every(([x, y, width, height]) =>
    regionMatches(
      modern,
      scale,
      x,
      y,
      width,
      height,
      (r, g, b, a) => r === 0 && g === 0 && b === 0 && a === 255,
    ),
  );
  if (isBlack) return "slim";

  const isWhite = SLIM_AREAS.every(([x, y, width, height]) =>
    regionMatches(
      modern,
      scale,
      x,
      y,
      width,
      height,
      (r, g, b, a) => r === 255 && g === 255 && b === 255 && a === 255,
    ),
  );

  return isWhite ? "slim" : "classic";
}

function blendOver(target: PixelImage, source: PixelImage): void {
  for (let offset = 0; offset < target.data.length; offset += 4) {
    const alpha = source.data[offset + 3] / 255;
    if (alpha <= 0) continue;

    target.data[offset] =
      source.data[offset] * alpha + target.data[offset] * (1 - alpha);
    target.data[offset + 1] =
      source.data[offset + 1] * alpha + target.data[offset + 1] * (1 - alpha);
    target.data[offset + 2] =
      source.data[offset + 2] * alpha + target.data[offset + 2] * (1 - alpha);
    target.data[offset + 3] = Math.max(target.data[offset + 3], source.data[offset + 3]);
  }
}

export function cropSkinHead(
  image: PixelImage,
  options: { overlay?: boolean } = {},
): PixelImage {
  const modern = upgradeLegacySkin(image);
  const scale = Math.max(1, Math.floor(modern.width / 64));
  const size = 8 * scale;

  const head = createPixelImage(size, size);
  copyRegion(modern, head, {
    sx: 8 * scale,
    sy: 8 * scale,
    width: size,
    height: size,
    dx: 0,
    dy: 0,
  });

  if (options.overlay !== false) {
    const hat = createPixelImage(size, size);
    copyRegion(modern, hat, {
      sx: 40 * scale,
      sy: 8 * scale,
      width: size,
      height: size,
      dx: 0,
      dy: 0,
    });
    blendOver(head, hat);
  }

  return head;
}
