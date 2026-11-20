export type IsoRgb = readonly [number, number, number];

export interface IsoTexture {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface CubeFaces {
  top: IsoTexture;
  front: IsoTexture;
  side: IsoTexture;
  tall?: number;
}

export interface Raster {
  size: number;
  pixels: Uint8ClampedArray;
}

const FACE_LIGHT = { top: 1, front: 0.8, side: 0.62 };
const CUBE_DEPTH = 0.56;
const SAMPLES = 3;

export function createRaster(size: number): Raster {
  return { size, pixels: new Uint8ClampedArray(size * size * 4) };
}

export function blend(
  raster: Raster,
  x: number,
  y: number,
  color: IsoRgb,
  alpha: number,
) {
  if (x < 0 || y < 0 || x >= raster.size || y >= raster.size || alpha <= 0)
    return;
  const pixels = raster.pixels;
  const index = (y * raster.size + x) * 4;
  const below = pixels[index + 3] / 255;
  const out = alpha + below * (1 - alpha);
  pixels[index] =
    (color[0] * alpha + pixels[index] * below * (1 - alpha)) / out;
  pixels[index + 1] =
    (color[1] * alpha + pixels[index + 1] * below * (1 - alpha)) / out;
  pixels[index + 2] =
    (color[2] * alpha + pixels[index + 2] * below * (1 - alpha)) / out;
  pixels[index + 3] = out * 255;
}

function faceTexel(
  texture: IsoTexture,
  s: number,
  t: number,
  light: number,
): IsoRgb | null {
  const x = Math.min(texture.width - 1, Math.floor(s * texture.width));
  const y = Math.min(texture.height - 1, Math.floor(t * texture.height));
  const index = (y * texture.width + x) * 4;
  if (texture.pixels[index + 3] < 128) return null;
  return [
    texture.pixels[index] * light,
    texture.pixels[index + 1] * light,
    texture.pixels[index + 2] * light,
  ];
}

function sampleCube(
  faces: CubeFaces,
  x: number,
  y: number,
  half: number,
  quarter: number,
  depth: number,
) {
  const u = x / half;
  const v = y / quarter;
  let s = (u + v) / 2;
  let t = (v - u) / 2;
  if (s >= 0 && s < 1 && t >= 0 && t < 1)
    return faceTexel(faces.top, s, t, FACE_LIGHT.top);

  s = (x + half) / half;
  t = (y - quarter - s * quarter) / depth;
  if (s >= 0 && s < 1 && t >= 0 && t < 1)
    return faceTexel(faces.front, s, t, FACE_LIGHT.front);

  s = x / half;
  t = (y - 2 * quarter + s * quarter) / depth;
  if (s >= 0 && s < 1 && t >= 0 && t < 1)
    return faceTexel(faces.side, s, t, FACE_LIGHT.side);

  return null;
}

function drawShadow(
  raster: Raster,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const distance = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (distance >= 1) continue;
      const alpha = 0.38 * Math.min(1, (1 - distance) / 0.45);
      blend(raster, x, y, [0, 0, 0], alpha);
    }
  }
}

export function drawCube(
  raster: Raster,
  faces: CubeFaces,
  widthRatio: number,
  shadow: boolean,
) {
  const width = raster.size * widthRatio;
  const half = width / 2;
  const quarter = width / 4;
  const depth = width * CUBE_DEPTH * (faces.tall ?? 1);
  const height = quarter * 2 + depth;
  const cx = raster.size / 2;
  const top = (raster.size - height) / 2;

  if (shadow) {
    drawShadow(
      raster,
      cx,
      top + quarter + depth + quarter * 0.3,
      half * 1.12,
      quarter * 1.25,
    );
  }

  for (let py = Math.floor(top); py < Math.ceil(top + height); py++) {
    for (let px = Math.floor(cx - half); px < Math.ceil(cx + half); px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = sampleCube(
            faces,
            px + (sx + 0.5) / SAMPLES - cx,
            py + (sy + 0.5) / SAMPLES - top,
            half,
            quarter,
            depth,
          );
          if (!color) continue;
          red += color[0];
          green += color[1];
          blue += color[2];
          hits++;
        }
      }
      if (hits === 0) continue;
      blend(
        raster,
        px,
        py,
        [red / hits, green / hits, blue / hits],
        hits / (SAMPLES * SAMPLES),
      );
    }
  }
}

function opaqueBounds(texture: IsoTexture) {
  const { width, height } = texture;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (texture.pixels[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right < 0
    ? null
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function drawSprite(
  raster: Raster,
  texture: IsoTexture,
  shadow: boolean,
) {
  const bounds = opaqueBounds(texture);
  if (!bounds) return;
  const span = Math.max(bounds.width, bounds.height, 12);
  const unit = Math.max(1, Math.floor((raster.size * 0.78) / span));
  const originX =
    Math.floor((raster.size - unit * bounds.width) / 2) - bounds.left * unit;
  const originY =
    Math.floor((raster.size - unit * bounds.height) / 2) - bounds.top * unit;
  const offset = Math.max(1, Math.round(unit * 0.5));

  const paintPass = (
    dx: number,
    dy: number,
    tint: IsoRgb | null,
    alpha: number,
  ) => {
    for (let ty = 0; ty < texture.height; ty++) {
      for (let tx = 0; tx < texture.width; tx++) {
        const index = (ty * texture.width + tx) * 4;
        const coverage = texture.pixels[index + 3] / 255;
        if (coverage === 0) continue;
        const color: IsoRgb = tint ?? [
          texture.pixels[index],
          texture.pixels[index + 1],
          texture.pixels[index + 2],
        ];
        for (let y = 0; y < unit; y++) {
          for (let x = 0; x < unit; x++) {
            blend(
              raster,
              originX + tx * unit + x + dx,
              originY + ty * unit + y + dy,
              color,
              alpha * coverage,
            );
          }
        }
      }
    }
  };

  if (shadow) paintPass(offset, offset, [0, 0, 0], 0.35);
  paintPass(0, 0, null, 1);
}
