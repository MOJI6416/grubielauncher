import { contrastRatio, relativeLuminance } from "./accents";
import { TITLEBAR_OVERLAY } from "./titlebar";

export type ThemeMode = "dark" | "light";

export type ThemeZone = "sidebar" | "topbar";

export const THEME_ZONES: ThemeZone[] = ["sidebar", "topbar"];

export interface ThemeColors {
  background: string;
  surface: string;
  foreground: string;
  accent: string | null;
  sidebar?: string;
  topbar?: string;
}

export type BackdropFit = "cover" | "contain" | "stretch";

export const BACKDROP_FITS: BackdropFit[] = ["cover", "contain", "stretch"];

export interface BackdropFrame {
  fit: BackdropFit;
  focusX: number;
  focusY: number;
}

export interface ThemeBackdrop extends BackdropFrame {
  path: string;
  dim: number;
  blur: number;
  panelOpacity: number;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  backdrop: ThemeBackdrop | null;
  galleryId?: string;
}

export interface ThemesFile {
  version: 1;
  themes: ThemeDefinition[];
}

export const DEFAULT_THEME_ID = "grubie";
export const MAX_USER_THEMES = 30;
export const MAX_THEME_NAME = 40;

export const BACKDROP_LIMITS = {
  dim: { min: 0, max: 90, initial: 55 },
  blur: { min: 0, max: 24, initial: 6 },
  panelOpacity: { min: 70, max: 100, initial: 88 },
} as const;

export const DEFAULT_BACKDROP_FRAME: BackdropFrame = { fit: "cover", focusX: 50, focusY: 50 };

export const GRUBIE_COLORS: ThemeColors = {
  background: "#0b0c0d",
  surface: "#19191b",
  foreground: "#f3f3f5",
  accent: null,
};

export const BUILT_IN_THEMES: ThemeDefinition[] = [
  {
    id: DEFAULT_THEME_ID,
    name: "Grubie",
    mode: "dark",
    colors: GRUBIE_COLORS,
    backdrop: null,
  },
  {
    id: "oled",
    name: "OLED",
    mode: "dark",
    colors: {
      background: "#000000",
      surface: "#0e0e10",
      foreground: "#f4f4f5",
      accent: null,
    },
    backdrop: null,
  },
  {
    id: "light",
    name: "Light",
    mode: "light",
    colors: {
      background: "#eceef2",
      surface: "#ffffff",
      foreground: "#15161a",
      accent: null,
    },
    backdrop: null,
  },
];

export const EMPTY_THEMES_FILE: ThemesFile = { version: 1, themes: [] };

const HEX = /^#[0-9a-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value.toLowerCase());
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function normalizeBackdropFrame(raw: Record<string, unknown>): BackdropFrame {
  const fit = BACKDROP_FITS.find((value) => value === raw.fit) ?? DEFAULT_BACKDROP_FRAME.fit;
  return {
    fit,
    focusX: clamp(raw.focusX, 0, 100, DEFAULT_BACKDROP_FRAME.focusX),
    focusY: clamp(raw.focusY, 0, 100, DEFAULT_BACKDROP_FRAME.focusY),
  };
}

function normalizeZoneColors(raw: Record<string, unknown>): Pick<ThemeColors, ThemeZone> {
  const zones: Pick<ThemeColors, ThemeZone> = {};
  for (const zone of THEME_ZONES) {
    const value = raw[zone];
    if (isHexColor(value)) zones[zone] = value.toLowerCase();
  }
  return zones;
}

function normalizeBackdrop(value: unknown): ThemeBackdrop | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.path !== "string" || !raw.path) return null;
  const { dim, blur, panelOpacity } = BACKDROP_LIMITS;

  return {
    path: raw.path,
    ...normalizeBackdropFrame(raw),
    dim: clamp(raw.dim, dim.min, dim.max, dim.initial),
    blur: clamp(raw.blur, blur.min, blur.max, blur.initial),
    panelOpacity: clamp(
      raw.panelOpacity,
      panelOpacity.min,
      panelOpacity.max,
      panelOpacity.initial,
    ),
  };
}

export function normalizeTheme(value: unknown): ThemeDefinition | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const colors = (raw.colors ?? {}) as Record<string, unknown>;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!id || BUILT_IN_THEMES.some((theme) => theme.id === id)) return null;
  if (
    !isHexColor(colors.background) ||
    !isHexColor(colors.surface) ||
    !isHexColor(colors.foreground)
  ) {
    return null;
  }

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const galleryId =
    typeof raw.galleryId === "string" && /^[a-f0-9]{24}$/.test(raw.galleryId)
      ? raw.galleryId
      : undefined;

  return {
    id,
    name: (name || id).slice(0, MAX_THEME_NAME),
    mode: raw.mode === "light" ? "light" : "dark",
    colors: {
      background: colors.background.toLowerCase(),
      surface: colors.surface.toLowerCase(),
      foreground: colors.foreground.toLowerCase(),
      accent: isHexColor(colors.accent) ? colors.accent.toLowerCase() : null,
      ...normalizeZoneColors(colors),
    },
    backdrop: normalizeBackdrop(raw.backdrop),
    ...(galleryId ? { galleryId } : {}),
  };
}

export function normalizeThemesFile(value: unknown): ThemesFile {
  if (!value || typeof value !== "object") return EMPTY_THEMES_FILE;
  const list = (value as { themes?: unknown }).themes;
  if (!Array.isArray(list)) return EMPTY_THEMES_FILE;

  const seen = new Set<string>();
  const themes: ThemeDefinition[] = [];
  for (const item of list) {
    const theme = normalizeTheme(item);
    if (!theme || seen.has(theme.id)) continue;
    seen.add(theme.id);
    themes.push(theme);
    if (themes.length >= MAX_USER_THEMES) break;
  }

  return { version: 1, themes };
}

export function findTheme(
  id: string,
  userThemes: ThemeDefinition[],
): ThemeDefinition {
  return (
    BUILT_IN_THEMES.find((theme) => theme.id === id) ??
    userThemes.find((theme) => theme.id === id) ??
    BUILT_IN_THEMES[0]
  );
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((part) => Math.round(Math.min(255, Math.max(0, part))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function mixHex(from: string, to: string, amount: number): string {
  const a = rgb(from);
  const b = rgb(to);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}

function alpha(hex: string, percent: number): string {
  const [r, g, b] = rgb(hex);
  return `rgb(${r} ${g} ${b} / ${percent}%)`;
}

const LIGHT_TEXT = "#fcfcfc";
const DARK_TEXT = "#111316";

export function textOn(hex: string): string {
  return contrastRatio(LIGHT_TEXT, hex) >= contrastRatio(DARK_TEXT, hex)
    ? LIGHT_TEXT
    : DARK_TEXT;
}

export function visibleAccent(
  accent: string,
  colors: ThemeColors,
  mode: ThemeMode,
): string {
  if (contrastRatio(accent, colors.surface) >= 2) return accent;
  return mixHex(accent, mode === "light" ? "#000000" : "#ffffff", 0.45);
}

export interface ThemePalette {
  surface1: string;
  surface2: string;
  surface3: string;
  muted: string;
  faint: string;
  primary: string;
  primaryText: string;
}

export function themePalette(
  theme: ThemeDefinition,
  accent: string,
  highContrast = false,
): ThemePalette {
  const { background, surface, foreground } = theme.colors;
  const primary = visibleAccent(theme.colors.accent ?? accent, theme.colors, theme.mode);

  return {
    surface1: mixHex(background, surface, theme.mode === "light" ? 0.6 : 0.45),
    surface2: surface,
    surface3: mixHex(surface, foreground, 0.06),
    muted: mixHex(surface, foreground, highContrast ? 0.82 : 0.68),
    faint: mixHex(surface, foreground, highContrast ? 0.74 : 0.57),
    primary,
    primaryText: textOn(primary),
  };
}

const LIGHT_SEMANTIC: Record<string, string> = {
  "--destructive": "oklch(0.55 0.2 25)",
  "--destructive-foreground": "oklch(0.99 0 0)",
  "--success": "oklch(0.52 0.13 158)",
  "--success-foreground": "oklch(0.99 0 0)",
  "--warning": "oklch(0.6 0.14 70)",
  "--warning-foreground": "oklch(0.99 0 0)",
  "--loader-forge": "oklch(0.55 0.075 72)",
  "--loader-fabric": "oklch(0.58 0.09 88)",
  "--loader-quilt": "oklch(0.55 0.17 310)",
  "--loader-neoforge": "oklch(0.56 0.16 45)",
  "--loader-vanilla": "oklch(0.55 0.14 148)",
  "--loader-legacy-fabric": "oklch(0.55 0.07 60)",
  "--loader-babric": "oklch(0.55 0.11 255)",
  "--loader-ornithe": "oklch(0.56 0.11 205)",
  "--loader-bta": "oklch(0.55 0.13 28)",
  "--loader-foxloader": "oklch(0.56 0.16 55)",
};

export function themeVariables(
  theme: ThemeDefinition,
  accent: string,
  highContrast = false,
): Record<string, string> {
  if (theme.id === DEFAULT_THEME_ID) return {};

  const { background, foreground } = theme.colors;
  const palette = themePalette(theme, accent, highContrast);
  const light = theme.mode === "light";
  const opacity = theme.backdrop?.panelOpacity ?? 100;
  const panel = (hex: string) => (opacity < 100 ? alpha(hex, opacity) : hex);

  return {
    "--background": background,
    "--surface-1": panel(palette.surface1),
    "--surface-2": panel(palette.surface2),
    "--surface-3": palette.surface3,
    "--foreground": foreground,
    "--muted-foreground": palette.muted,
    "--faint": palette.faint,
    "--card": panel(palette.surface2),
    "--popover": palette.surface3,
    "--secondary": panel(mixHex(palette.surface2, foreground, 0.04)),
    "--muted": panel(mixHex(palette.surface2, foreground, 0.03)),
    "--accent": mixHex(palette.surface2, foreground, 0.1),
    "--sidebar": panel(palette.surface1),
    "--sidebar-accent": mixHex(palette.surface2, foreground, 0.04),
    "--border": alpha(foreground, highContrast ? 18 : light ? 12 : 9),
    "--input": alpha(foreground, highContrast ? 26 : light ? 18 : 14),
    "--sidebar-border": alpha(foreground, highContrast ? 16 : light ? 11 : 8),
    "--lit-edge": alpha(foreground, 6),
    "--spot-light": alpha(foreground, light ? 6 : 9),
    "--sheen-light": alpha(foreground, 22),
    "--lit-shadow-near": light ? "rgb(0 0 0 / 10%)" : "rgb(0 0 0 / 35%)",
    "--lit-shadow-far": light ? "rgb(0 0 0 / 16%)" : "rgb(0 0 0 / 55%)",
    "--grain-opacity": light ? "0.025" : "0.035",
    "--primary": palette.primary,
    "--ring": palette.primary,
    "--chart-1": palette.primary,
    "--primary-foreground": palette.primaryText,
    ...(light ? LIGHT_SEMANTIC : {}),
  };
}

export function zoneForeground(color: string, foreground: string): string {
  return contrastRatio(foreground, color) >= 4.5 ? foreground : textOn(color);
}

function zoneColor(theme: ThemeDefinition, zone: ThemeZone): string | undefined {
  return theme.id === DEFAULT_THEME_ID ? undefined : theme.colors[zone];
}

function zoneTheme(theme: ThemeDefinition, color: string): ThemeDefinition {
  const foreground = zoneForeground(color, theme.colors.foreground);
  return {
    ...theme,
    mode: relativeLuminance(foreground) < relativeLuminance(color) ? "light" : "dark",
    colors: {
      background: color,
      surface: mixHex(color, foreground, 0.05),
      foreground,
      accent: theme.colors.accent,
    },
  };
}

export interface ZonePalette extends ThemePalette {
  color: string;
  foreground: string;
}

export function zonePalette(
  theme: ThemeDefinition,
  zone: ThemeZone,
  accent: string,
  highContrast = false,
): ZonePalette | null {
  const color = zoneColor(theme, zone);
  if (!color) return null;
  const local = zoneTheme(theme, color);
  return {
    ...themePalette(local, accent, highContrast),
    color,
    foreground: local.colors.foreground,
  };
}

const ZONE_DERIVED: Record<string, string> = {
  "--card-foreground": "var(--foreground)",
  "--popover-foreground": "var(--foreground)",
  "--secondary-foreground": "var(--foreground)",
  "--accent-foreground": "var(--foreground)",
  "--sidebar-foreground": "var(--foreground)",
  "--sidebar-accent-foreground": "var(--foreground)",
  "--sidebar-primary": "var(--primary)",
  "--sidebar-primary-foreground": "var(--primary-foreground)",
  "--sidebar-ring": "var(--primary)",
  "--primary-soft": "color-mix(in oklab, var(--primary) 22%, var(--surface-2))",
  "--primary-soft-raised": "color-mix(in oklab, var(--primary) 22%, var(--surface-3))",
  "--primary-veil": "color-mix(in oklab, var(--primary) 16%, transparent)",
};

export function zoneVariables(
  theme: ThemeDefinition,
  zone: ThemeZone,
  accent: string,
  highContrast = false,
): Record<string, string> | null {
  const color = zoneColor(theme, zone);
  if (!color) return null;
  const opacity = theme.backdrop?.panelOpacity ?? 100;

  return {
    ...themeVariables(zoneTheme(theme, color), accent, highContrast),
    ...ZONE_DERIVED,
    "--background": color,
    "--sidebar": zone === "sidebar" && opacity < 100 ? alpha(color, opacity) : color,
  };
}

export function titleBarColors(theme: ThemeDefinition): { color: string; symbolColor: string } {
  if (theme.id === DEFAULT_THEME_ID) {
    return { color: TITLEBAR_OVERLAY.color, symbolColor: TITLEBAR_OVERLAY.symbolColor };
  }
  const color = zoneColor(theme, "topbar") ?? theme.colors.background;
  const foreground = zoneForeground(color, theme.colors.foreground);
  return { color, symbolColor: mixHex(color, foreground, 0.65) };
}

export type ContrastLevel = "ok" | "warn" | "fail";

type BaseCheckId = "text" | "background" | "muted" | "faint" | "accent" | "accentText";

export interface ContrastCheck {
  id: BaseCheckId | ThemeZone;
  ratio: number;
  level: ContrastLevel;
}

const CONTRAST_RULES: Record<BaseCheckId, { fail: number; warn: number }> = {
  text: { fail: 4.5, warn: 7 },
  background: { fail: 4.5, warn: 7 },
  muted: { fail: 3, warn: 4.5 },
  faint: { fail: 2, warn: 3 },
  accent: { fail: 1.5, warn: 2.5 },
  accentText: { fail: 3, warn: 4.5 },
};

export function contrastReport(
  theme: ThemeDefinition,
  accent: string,
): ContrastCheck[] {
  const palette = themePalette(theme, accent);
  const { background, surface, foreground } = theme.colors;
  const ratios: Record<BaseCheckId, number> = {
    text: contrastRatio(foreground, surface),
    background: contrastRatio(foreground, background),
    muted: contrastRatio(palette.muted, surface),
    faint: contrastRatio(palette.faint, surface),
    accent: contrastRatio(palette.primary, surface),
    accentText: contrastRatio(palette.primaryText, palette.primary),
  };

  const check = (id: ContrastCheck["id"], ratio: number, rule: { fail: number; warn: number }): ContrastCheck => ({
    id,
    ratio: Math.round(ratio * 10) / 10,
    level: ratio < rule.fail ? "fail" : ratio < rule.warn ? "warn" : "ok",
  });

  const base = (Object.keys(CONTRAST_RULES) as BaseCheckId[]).map((id) =>
    check(id, ratios[id], CONTRAST_RULES[id]),
  );
  const zones = THEME_ZONES.flatMap((zone) => {
    const zoned = zonePalette(theme, zone, accent);
    return zoned ? [check(zone, contrastRatio(zoned.muted, zoned.color), CONTRAST_RULES.muted)] : [];
  });
  return [...base, ...zones];
}

export function isThemeReadable(theme: ThemeDefinition, accent: string): boolean {
  return contrastReport(theme, accent).every((check) => check.level !== "fail");
}
