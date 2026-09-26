const MIN_SATURATION = 0.12;

function toHue(r: number, g: number, b: number, max: number, delta: number) {
  if (delta === 0) return 0;
  if (max === r) return 60 * (((g - b) / delta) % 6);
  if (max === g) return 60 * ((b - r) / delta + 2);
  return 60 * ((r - g) / delta + 4);
}

export function pickArtTint(pixels: ArrayLike<number>): string | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    if (pixels[index + 3] < 128) continue;

    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const pixelWeight = 0.04 + saturation * saturation;

    red += r * pixelWeight;
    green += g * pixelWeight;
    blue += b * pixelWeight;
    weight += pixelWeight;
  }

  if (weight === 0) return null;

  const r = red / weight / 255;
  const g = green / weight / 255;
  const b = blue / weight / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  if (saturation < MIN_SATURATION) return null;

  const hue = Math.round((toHue(r, g, b, max, delta) + 360) % 360);
  const clamped = Math.round(Math.min(0.8, Math.max(0.45, saturation)) * 100);

  return `hsl(${hue} ${clamped}% 60%)`;
}
