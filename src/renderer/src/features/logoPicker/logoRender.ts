import {
  blend,
  createRaster,
  drawCube,
  drawSprite,
  type CubeFaces,
  type Raster,
} from "@/shared/isometricBlock";
import {
  mix,
  randomFrom,
  seedOf,
  shades,
  type Palette,
  type Rgb,
  type Texture,
} from "./pixelArt";

export type { CubeFaces, Raster };

export interface Backdrop {
  id: string;
  stops: Palette;
  sparkle?: { colors: Palette; density: number };
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
