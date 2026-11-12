import {
  BACKDROP_LIMITS,
  THEME_ZONES,
  isHexColor,
  normalizeBackdropFrame,
  normalizeTheme,
  type BackdropFrame,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeMode,
} from "./themes";

export type GallerySort = "new" | "downloads";
export type PublishedStatus = "pending" | "approved" | "rejected";

export interface GalleryBackdrop extends BackdropFrame {
  dim: number;
  blur: number;
  panelOpacity: number;
  url: string;
  thumbUrl: string;
}

export interface GalleryTheme {
  id: string;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  backdrop: GalleryBackdrop | null;
  authorName: string | null;
  downloads: number;
}

export interface PublishedTheme extends GalleryTheme {
  status: PublishedStatus;
  rejectionReason: string | null;
}

export interface GalleryPage {
  items: GalleryTheme[];
  total: number;
}

export interface GalleryQuery {
  search?: string;
  mode?: ThemeMode;
  sort?: GallerySort;
  page?: number;
}

export interface PublishPayload {
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  backdrop: ({ dim: number; blur: number; panelOpacity: number } & BackdropFrame) | null;
}

export interface PublishImages {
  backdrop: Uint8Array;
  thumb: Uint8Array;
}

export type PublishError =
  | "publish_banned"
  | "unreadable"
  | "pending_limit"
  | "duplicate"
  | "bad_picture"
  | "name_required"
  | "offline"
  | "failed";

export type PublishResult =
  | { ok: true; theme: PublishedTheme }
  | { ok: false; error: PublishError; dupStatus?: PublishedStatus; reason?: string | null };

export const GALLERY_PAGE_SIZE = 24;
export const GALLERY_ID = /^[a-f0-9]{24}$/;

export const GALLERY_BACKDROP = { width: 1920, height: 1080, maxBytes: 3 * 1024 * 1024 };
export const GALLERY_THUMB = { width: 480, height: 270, maxBytes: 256 * 1024 };

function percent(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function normalizeGalleryTheme(value: unknown): GalleryTheme | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const colors = (raw.colors ?? {}) as Record<string, unknown>;
  if (typeof raw.id !== "string" || !GALLERY_ID.test(raw.id)) return null;
  if (
    !isHexColor(colors.background) ||
    !isHexColor(colors.surface) ||
    !isHexColor(colors.foreground)
  ) {
    return null;
  }

  const backdrop = raw.backdrop as Record<string, unknown> | null | undefined;
  const url = backdrop ? httpsUrl(backdrop.url) : null;
  const { dim, blur, panelOpacity } = BACKDROP_LIMITS;

  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    mode: raw.mode === "light" ? "light" : "dark",
    colors: {
      background: colors.background.toLowerCase(),
      surface: colors.surface.toLowerCase(),
      foreground: colors.foreground.toLowerCase(),
      accent: isHexColor(colors.accent) ? colors.accent.toLowerCase() : null,
      ...Object.fromEntries(
        THEME_ZONES.flatMap((zone) => {
          const value = colors[zone];
          return isHexColor(value) ? [[zone, value.toLowerCase()]] : [];
        }),
      ),
    },
    backdrop:
      backdrop && url
        ? {
            ...normalizeBackdropFrame(backdrop),
            dim: percent(backdrop.dim, dim.min, dim.max, dim.initial),
            blur: percent(backdrop.blur, blur.min, blur.max, blur.initial),
            panelOpacity: percent(
              backdrop.panelOpacity,
              panelOpacity.min,
              panelOpacity.max,
              panelOpacity.initial,
            ),
            url,
            thumbUrl: httpsUrl(backdrop.thumbUrl) ?? url,
          }
        : null,
    authorName: typeof raw.authorName === "string" && raw.authorName ? raw.authorName : null,
    downloads: typeof raw.downloads === "number" ? raw.downloads : 0,
  };
}

export function normalizePublishedTheme(value: unknown): PublishedTheme | null {
  const theme = normalizeGalleryTheme(value);
  if (!theme) return null;
  const raw = value as Record<string, unknown>;
  const status: PublishedStatus =
    raw.status === "approved" || raw.status === "rejected" ? raw.status : "pending";

  return {
    ...theme,
    status,
    rejectionReason:
      typeof raw.rejectionReason === "string" && raw.rejectionReason ? raw.rejectionReason : null,
  };
}

export function galleryThemeToDefinition(
  item: GalleryTheme,
  id: string,
  backdropPath: string | null,
): ThemeDefinition | null {
  return normalizeTheme({
    id,
    name: item.name,
    mode: item.mode,
    colors: item.colors,
    backdrop:
      backdropPath && item.backdrop
        ? {
            path: backdropPath,
            dim: item.backdrop.dim,
            blur: item.backdrop.blur,
            panelOpacity: item.backdrop.panelOpacity,
            fit: item.backdrop.fit,
            focusX: item.backdrop.focusX,
            focusY: item.backdrop.focusY,
          }
        : null,
    galleryId: item.id,
  });
}

export function publishPayload(theme: ThemeDefinition): PublishPayload {
  return {
    name: theme.name.trim(),
    mode: theme.mode,
    colors: { ...theme.colors },
    backdrop: theme.backdrop
      ? {
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
