import {
  THEME_ZONES,
  isHexColor,
  normalizeTheme,
  type BackdropFrame,
  type ThemeDefinition,
  type ThemeMode,
} from "./themes";

export const THEME_FILE_EXTENSION = "grubietheme";
export const THEME_FILE_FORMAT = "grubie-theme";
export const THEME_CODE_PREFIX = "grubie-theme:";
export const BACKDROP_ENTRY = /^backdrop\.(png|jpg|jpeg|webp)$/;

export interface ThemeFileManifest {
  format: typeof THEME_FILE_FORMAT;
  version: 1;
  name: string;
  mode: ThemeMode;
  colors: ThemeDefinition["colors"];
  backdrop:
    | ({ file: string; dim: number; blur: number; panelOpacity: number } & BackdropFrame)
    | null;
}

export function backdropEntryName(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "png";
  return `backdrop.${extension === "jpeg" ? "jpg" : extension}`;
}

export function themeManifest(theme: ThemeDefinition): ThemeFileManifest {
  return {
    format: THEME_FILE_FORMAT,
    version: 1,
    name: theme.name,
    mode: theme.mode,
    colors: { ...theme.colors },
    backdrop: theme.backdrop
      ? {
          file: backdropEntryName(theme.backdrop.path),
          dim: theme.backdrop.dim,
          blur: theme.backdrop.blur,
          panelOpacity: theme.backdrop.panelOpacity,
          fit: theme.backdrop.fit,
          focusX: theme.backdrop.focusX,
          focusY: theme.backdrop.focusY,
        }
      : null,
  };
}

export function themeFromManifest(
  raw: unknown,
  id: string,
  backdropPath: string | null,
): ThemeDefinition | null {
  if (!raw || typeof raw !== "object") return null;
  const manifest = raw as Partial<ThemeFileManifest>;
  if (manifest.format !== THEME_FILE_FORMAT) return null;

  return normalizeTheme({
    id,
    name: manifest.name,
    mode: manifest.mode,
    colors: manifest.colors,
    backdrop:
      backdropPath && manifest.backdrop ? { ...manifest.backdrop, path: backdropPath } : null,
  });
}

function toBase64Url(text: string): string {
  let binary = "";
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const base64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeThemeCode(theme: ThemeDefinition): string {
  const { background, surface, foreground, accent } = theme.colors;
  const zones = THEME_ZONES.map((zone) => theme.colors[zone] ?? "");
  const colors = [background, surface, foreground, accent ?? "", ...zones];
  while (colors.length > 4 && !colors[colors.length - 1]) colors.pop();
  const payload = {
    n: theme.name,
    m: theme.mode === "light" ? "l" : "d",
    c: colors.map((color) => color.replace("#", "")),
  };
  return `${THEME_CODE_PREFIX}${toBase64Url(JSON.stringify(payload))}`;
}

export function decodeThemeCode(text: string, id: string): ThemeDefinition | null {
  const match = text.match(/grubie-theme:([A-Za-z0-9_-]+)/);
  if (!match) return null;

  try {
    const payload = JSON.parse(fromBase64Url(match[1])) as {
      n?: unknown;
      m?: unknown;
      c?: unknown;
    };
    if (!Array.isArray(payload.c) || payload.c.length < 3) return null;
    const [background, surface, foreground, accent, ...zones] = payload.c.map((value) =>
      typeof value === "string" ? `#${value}` : "",
    );

    return normalizeTheme({
      id,
      name: typeof payload.n === "string" ? payload.n : "",
      mode: payload.m === "l" ? "light" : "dark",
      colors: {
        background,
        surface,
        foreground,
        accent: isHexColor(accent) ? accent : null,
        ...Object.fromEntries(THEME_ZONES.map((zone, index) => [zone, zones[index]])),
      },
      backdrop: null,
    });
  } catch {
    return null;
  }
}
