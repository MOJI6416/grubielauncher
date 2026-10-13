export interface Sprite {
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
}

const BAT_PALETTE = { B: "#6a5590", b: "#45375f", E: "#ffb347" };

export const BAT_UP: Sprite = {
  rows: [
    "b.............b",
    "bb...B...B...bb",
    "bBb..BBBBB..bBb",
    ".bBb.BEBEB.bBb.",
    "..bBBBBBBBBBb..",
    "...bb.BBB.bb...",
    ".......B.......",
  ],
  palette: BAT_PALETTE,
};

export const BAT_DOWN: Sprite = {
  rows: [
    "...............",
    ".....B...B.....",
    ".....BBBBB.....",
    "..bBBBEBEBBBb..",
    ".bBBBBBBBBBBBb.",
    "bBb...BBB...bBb",
    "b......B......b",
  ],
  palette: BAT_PALETTE,
};

export const PUMPKIN: Sprite = {
  rows: [
    "......S......",
    ".....SS......",
    "...oOOoOOo...",
    ".oOOOOoOOOOo.",
    "oOOYOOOOOYOOo",
    "oOYYYOOOYYYOo",
    "oOOOOOYOOOOOo",
    "oYOOOOOOOOOYo",
    "oYYYOYYYOYYYo",
    "oOYYYYYYYYYOo",
    ".oOOOOOOOOOo.",
    "...ooooooo...",
  ],
  palette: { S: "#6b8f3a", O: "#ec7a1e", o: "#a04614", Y: "#ffe08a" },
};

interface Run {
  x: number;
  y: number;
  width: number;
  fill: string;
}

export function spriteRuns(sprite: Sprite): Run[] {
  const runs: Run[] = [];

  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = sprite.palette[row[x]];
      if (!fill) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < row.length && row[end] === row[x]) end += 1;
      runs.push({ x, y, width: end - x, fill });
      x = end;
    }
  });

  return runs;
}

export function spriteSize(sprite: Sprite): { width: number; height: number } {
  return {
    width: Math.max(...sprite.rows.map((row) => row.length)),
    height: sprite.rows.length,
  };
}

const WEB_SPOKES = [0, 17, 36, 55, 73, 90];
const WEB_RINGS = [0.2, 0.4, 0.62, 0.86];
const WEB_RADIUS = 100;
const WEB_SAG = 0.8;

function polar(radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = radius * Math.cos(radians);
  const y = radius * Math.sin(radians);
  return `${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function cobwebPath(): string {
  const spokes = WEB_SPOKES.map(
    (angle) => `M0 0L${polar(WEB_RADIUS, angle)}`,
  );

  const rings = WEB_RINGS.map((ring) => {
    const radius = ring * WEB_RADIUS;
    const segments = WEB_SPOKES.slice(1).map((angle, index) => {
      const middle = (angle + WEB_SPOKES[index]) / 2;
      return `Q${polar(radius * WEB_SAG, middle)} ${polar(radius, angle)}`;
    });
    return `M${polar(radius, WEB_SPOKES[0])}${segments.join("")}`;
  });

  return [...spokes, ...rings].join("");
}
