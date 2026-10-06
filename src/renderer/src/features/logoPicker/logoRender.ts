import {
  mix,
  randomFrom,
  seedOf,
  shades,
  type Palette,
  type Rgb,
  type Texture,
} from "./pixelArt";

export interface CubeFaces {
  top: Texture;
  front: Texture;
  side: Texture;
  tall?: number;
}

export interface Backdrop {
  id: string;
  stops: Palette;
  sparkle?: { colors: Palette; density: number };
}

export interface Raster {
  size: number;
  pixels: Uint8ClampedArray;
}

export type LogoSubject =
  | { kind: "cube"; faces: CubeFaces; scale: number }
  | { kind: "sprite"; texture: Texture };

export const LOGO_BACKDROPS: Backdrop[] = [
  { id: "none", stops: [] },
  { id: "grubie", stops: shades("#120c2e", "#33246f", "#7c5cff") },
  { id: "sky", stops: shades("#4f82e0", "#86aef2", "#c9ddff") },
  { id: "sunset", stops: shades("#2f2160", "#a8456a", "#f5a05a") },
  {
    id: "night",
    stops: shades("#060a1c", "#111a40", "#22306a"),
    sparkle: {
      colors: shades("#ffffff", "#fff1a8", "#c8d8ff"),
      density: 0.035,
    },
  },
  { id: "forest", stops: shades("#0c2111", "#1b4122", "#2f6a35") },
  { id: "ocean", stops: shades("#051c33", "#0b4466", "#1a7894") },
  {
    id: "cave",
    stops: shades("#0f0f13", "#222229", "#3a3a44"),
    sparkle: { colors: shades("#4a4a55", "#2fb3ad"), density: 0.03 },
  },
  {
    id: "nether",
    stops: shades("#1a0404", "#460e09", "#8a2412"),
    sparkle: { colors: shades("#ff8a2a", "#ffc44d"), density: 0.03 },
  },
  {
    id: "end",
    stops: shades("#06030d", "#190e30", "#382063"),
    sparkle: { colors: shades("#c9a6ff", "#f0e6ff"), density: 0.03 },
  },
];

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const BACKDROP_GRID = 32;
const BACKDROP_LEVELS = 7;
const FACE_LIGHT = { top: 1, front: 0.8, side: 0.62 };
const CUBE_DEPTH = 0.56;
const SAMPLES = 3;

function createRaster(size: number): Raster {
  return { size, pixels: new Uint8ClampedArray(size * size * 4) };
}

function blend(
  raster: Raster,
  x: number,
  y: number,
  color: Rgb,
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

function gradient(stops: Palette, t: number): Rgb {
  const position = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  return mix(stops[index], stops[index + 1], position - index);
}

function drawBackdrop(raster: Raster, backdrop: Backdrop) {
  if (backdrop.stops.length < 2) return;
  const random = randomFrom(seedOf(backdrop.id));
  const cellsColor: Rgb[] = [];

  for (let gy = 0; gy < BACKDROP_GRID; gy++) {
    for (let gx = 0; gx < BACKDROP_GRID; gx++) {
      const cx = (gx + 0.5) / BACKDROP_GRID - 0.5;
      const cy = (gy + 0.5) / BACKDROP_GRID - 0.52;
      const glow = Math.max(0, 1 - Math.hypot(cx, cy) * 2.2) * 0.22;
      const t = Math.min(1, (gy + 0.5) / BACKDROP_GRID + glow);
      const level = t * (BACKDROP_LEVELS - 1);
      const base = Math.floor(level);
      const threshold = (BAYER[(gy % 4) * 4 + (gx % 4)] + 0.5) / 16;
      const step = level - base > threshold ? base + 1 : base;
      let color = gradient(backdrop.stops, step / (BACKDROP_LEVELS - 1));
      if (backdrop.sparkle && random() < backdrop.sparkle.density) {
        const colors = backdrop.sparkle.colors;
        color = colors[Math.floor(random() * colors.length)];
      }
      cellsColor.push(color);
    }
  }

  for (let y = 0; y < raster.size; y++) {
    const gy = Math.floor((y * BACKDROP_GRID) / raster.size);
    for (let x = 0; x < raster.size; x++) {
      const gx = Math.floor((x * BACKDROP_GRID) / raster.size);
      blend(raster, x, y, cellsColor[gy * BACKDROP_GRID + gx], 1);
    }
  }
}

function faceTexel(
  texture: Texture,
  s: number,
  t: number,
  light: number,
): Rgb | null {
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

function drawCube(
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

function opaqueBounds(texture: Texture) {
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

function drawSprite(raster: Raster, texture: Texture, shadow: boolean) {
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
    tint: Rgb | null,
    alpha: number,
  ) => {
    for (let ty = 0; ty < texture.height; ty++) {
      for (let tx = 0; tx < texture.width; tx++) {
        const index = (ty * texture.width + tx) * 4;
        const coverage = texture.pixels[index + 3] / 255;
        if (coverage === 0) continue;
        const color: Rgb = tint ?? [
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

export function findBackdrop(id: string): Backdrop {
  return (
    LOGO_BACKDROPS.find((backdrop) => backdrop.id === id) ?? LOGO_BACKDROPS[0]
  );
}

export function renderLogo(
  subject: LogoSubject | null,
  backdropId: string,
  size: number,
): Raster {
  const raster = createRaster(size);
  const backdrop = findBackdrop(backdropId);
  const hasBackdrop = backdrop.stops.length >= 2;
  drawBackdrop(raster, backdrop);

  if (subject?.kind === "cube") {
    drawCube(raster, subject.faces, subject.scale, hasBackdrop);
  } else if (subject?.kind === "sprite") {
    drawSprite(raster, subject.texture, hasBackdrop);
  }

  return raster;
}

export function renderBackdropSwatch(backdropId: string, size: number): Raster {
  const raster = createRaster(size);
  drawBackdrop(raster, findBackdrop(backdropId));
  return raster;
}
