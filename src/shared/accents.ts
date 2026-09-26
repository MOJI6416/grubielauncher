export type AccentId = "violet" | "blue" | "cyan" | "pink" | "graphite";

export interface AccentColors {
  primary: string;
  foreground: string;
}

export const DEFAULT_ACCENT: AccentId = "violet";

export const ACCENTS: Record<AccentId, AccentColors> = {
  violet: { primary: "#7c5cff", foreground: "#fcfcfc" },
  blue: { primary: "#3d6eff", foreground: "#fcfcfc" },
  cyan: { primary: "#22b8cf", foreground: "#111316" },
  pink: { primary: "#d13d8a", foreground: "#fcfcfc" },
  graphite: { primary: "#e4e4e7", foreground: "#111316" },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as AccentId[];

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && value in ACCENTS;
}

export function accentVariables(id: AccentId): Record<string, string> {
  const { primary, foreground } = ACCENTS[id];
  return {
    "--primary": primary,
    "--ring": primary,
    "--primary-foreground": foreground,
    "--chart-1": primary,
  };
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
}
