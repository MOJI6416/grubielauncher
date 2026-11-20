export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_RECT = 8;
const MIN_BLOCK = 6;
const MAX_BLOCK = 96;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function rectFromPoints(a: Point, b: Point, bounds: Size): Rect {
  const x1 = clamp(Math.round(Math.min(a.x, b.x)), 0, bounds.width);
  const y1 = clamp(Math.round(Math.min(a.y, b.y)), 0, bounds.height);
  const x2 = clamp(Math.round(Math.max(a.x, b.x)), 0, bounds.width);
  const y2 = clamp(Math.round(Math.max(a.y, b.y)), 0, bounds.height);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function isUsableRect(rect: Rect | null | undefined): rect is Rect {
  return !!rect && rect.w >= MIN_RECT && rect.h >= MIN_RECT;
}

export function clipRect(rect: Rect, bounds: Size): Rect | null {
  const x1 = clamp(rect.x, 0, bounds.width);
  const y1 = clamp(rect.y, 0, bounds.height);
  const x2 = clamp(rect.x + rect.w, 0, bounds.width);
  const y2 = clamp(rect.y + rect.h, 0, bounds.height);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intoCrop(rect: Rect, crop: Rect | null): Rect | null {
  if (!crop) return rect;
  return clipRect(
    { x: rect.x - crop.x, y: rect.y - crop.y, w: rect.w, h: rect.h },
    { width: crop.w, height: crop.h },
  );
}

export function outputSize(image: Size, crop: Rect | null): Size {
  return crop && isUsableRect(crop)
    ? { width: crop.w, height: crop.h }
    : { width: image.width, height: image.height };
}

export function blurBlock(rect: Rect, imageWidth: number): number {
  const byImage = Math.round(imageWidth / 120);
  const byRegion = Math.round(Math.min(rect.w, rect.h) / 3);
  return clamp(Math.max(byImage, byRegion), MIN_BLOCK, MAX_BLOCK);
}

export function debugScreenRect(image: Size): Rect {
  return {
    x: 0,
    y: 0,
    w: Math.round(image.width * 0.42),
    h: Math.round(image.height * 0.5),
  };
}

export function pixelate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  region: Rect,
  block: number,
): void {
  const area = clipRect(region, { width, height });
  if (!area || block < 1) return;

  const step = Math.max(1, Math.round(block));
  const right = area.x + area.w;
  const bottom = area.y + area.h;

  for (let top = area.y; top < bottom; top += step) {
    const rowEnd = Math.min(top + step, bottom);
    for (let left = area.x; left < right; left += step) {
      const colEnd = Math.min(left + step, right);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;

      for (let y = top; y < rowEnd; y += 1) {
        let offset = (y * width + left) * 4;
        for (let x = left; x < colEnd; x += 1) {
          r += data[offset];
          g += data[offset + 1];
          b += data[offset + 2];
          a += data[offset + 3];
          count += 1;
          offset += 4;
        }
      }

      const avgR = Math.round(r / count);
      const avgG = Math.round(g / count);
      const avgB = Math.round(b / count);
      const avgA = Math.round(a / count);

      for (let y = top; y < rowEnd; y += 1) {
        let offset = (y * width + left) * 4;
        for (let x = left; x < colEnd; x += 1) {
          data[offset] = avgR;
          data[offset + 1] = avgG;
          data[offset + 2] = avgB;
          data[offset + 3] = avgA;
          offset += 4;
        }
      }
    }
  }
}

export function editedName(name: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((entry) => entry.toLowerCase()));
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;

  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}_edit${index === 1 ? "" : index}.png`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base}_edit_${Date.now()}.png`;
}
