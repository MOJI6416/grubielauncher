import {
  BACKDROP_FITS,
  MAX_USER_THEMES,
  THEME_ZONES,
  isHexColor,
  type BackdropFit,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeMode,
} from "./themes";

export interface RemoteThemeBackdrop {
  dim: number;
  blur: number;
  panelOpacity: number;
  fit: BackdropFit;
  focusX: number;
  focusY: number;
  hash: string | null;
}

export interface RemoteTheme {
  id: string;
  clientId: string | null;
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
  backdrop: RemoteThemeBackdrop | null;
  changedAt: number;
}

export interface ThemeLink {
  remoteId: string;
  syncedAt: number;
  contentKey: string;
  picturePath: string | null;
  pictureHash: string | null;
}

export type ThemeLinks = Record<string, ThemeLink>;

export type ThemeSyncAction =
  | { kind: "push"; localId: string; remoteId: string | null }
  | { kind: "pull"; remote: RemoteTheme; localId: string | null }
  | { kind: "link"; localId: string; remote: RemoteTheme }
  | { kind: "deleteLocal"; localId: string }
  | { kind: "deleteRemote"; localId: string; remoteId: string };

const REMOTE_ID = /^[a-f0-9]{24}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/;

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function colorsOf(value: unknown): ThemeColors | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isHexColor(raw.background) || !isHexColor(raw.surface) || !isHexColor(raw.foreground)) {
    return null;
  }
  const colors: ThemeColors = {
    background: raw.background.toLowerCase(),
    surface: raw.surface.toLowerCase(),
    foreground: raw.foreground.toLowerCase(),
    accent: isHexColor(raw.accent) ? raw.accent.toLowerCase() : null,
  };
  for (const zone of THEME_ZONES) {
    const color = raw[zone];
    if (isHexColor(color)) colors[zone] = color.toLowerCase();
  }
  return colors;
}

export function normalizeRemoteTheme(value: unknown): RemoteTheme | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const colors = colorsOf(raw.colors);
  if (typeof raw.id !== "string" || !REMOTE_ID.test(raw.id) || !colors) return null;
  const changedAt = number(raw.changedAt, 0);
  if (changedAt <= 0) return null;

  const backdrop = raw.backdrop as Record<string, unknown> | null | undefined;
  return {
    id: raw.id,
    clientId:
      typeof raw.clientId === "string" && CLIENT_ID.test(raw.clientId) ? raw.clientId : null,
    name: typeof raw.name === "string" ? raw.name.slice(0, 40) : "",
    mode: raw.mode === "light" ? "light" : "dark",
    colors,
    backdrop:
      backdrop && typeof backdrop === "object"
        ? {
            dim: number(backdrop.dim, 55),
            blur: number(backdrop.blur, 6),
            panelOpacity: number(backdrop.panelOpacity, 88),
            fit: BACKDROP_FITS.find((fit) => fit === backdrop.fit) ?? "cover",
            focusX: number(backdrop.focusX, 50),
            focusY: number(backdrop.focusY, 50),
            hash: typeof backdrop.hash === "string" ? backdrop.hash : null,
          }
        : null,
    changedAt,
  };
}

function sortedColors(colors: ThemeColors): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(colors)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function look(theme: Pick<ThemeDefinition, "name" | "mode" | "colors">) {
  return { name: theme.name, mode: theme.mode, colors: sortedColors(theme.colors) };
}

function frame(backdrop: Omit<RemoteThemeBackdrop, "hash">) {
  return {
    dim: backdrop.dim,
    blur: backdrop.blur,
    panelOpacity: backdrop.panelOpacity,
    fit: backdrop.fit,
    focusX: backdrop.focusX,
    focusY: backdrop.focusY,
  };
}

export function themeContentKey(theme: ThemeDefinition): string {
  return JSON.stringify({
    ...look(theme),
    backdrop: theme.backdrop ? { ...frame(theme.backdrop), path: theme.backdrop.path } : null,
  });
}

export function sameThemeLook(local: ThemeDefinition, remote: RemoteTheme): boolean {
  return (
    JSON.stringify(look(local)) === JSON.stringify(look(remote)) &&
    JSON.stringify(local.backdrop ? frame(local.backdrop) : null) ===
      JSON.stringify(remote.backdrop ? frame(remote.backdrop) : null)
  );
}

export function stampThemes(
  previous: ThemeDefinition[],
  next: ThemeDefinition[],
  at: number,
): ThemeDefinition[] {
  const before = new Map(previous.map((theme) => [theme.id, theme]));
  return next.map((theme) => {
    const old = before.get(theme.id);
    if (old && themeContentKey(old) === themeContentKey(theme)) {
      return old.updatedAt && !theme.updatedAt ? { ...theme, updatedAt: old.updatedAt } : theme;
    }
    return { ...theme, updatedAt: Math.max(at, (old?.updatedAt ?? 0) + 1) };
  });
}

function newer(local: ThemeDefinition, remote: RemoteTheme): boolean {
  return (local.updatedAt ?? 0) > remote.changedAt;
}

export function planThemeSync(
  local: ThemeDefinition[],
  links: ThemeLinks,
  remote: RemoteTheme[],
): ThemeSyncAction[] {
  const remoteById = new Map(remote.map((theme) => [theme.id, theme]));
  const localIds = new Set(local.map((theme) => theme.id));
  const claimed = new Set<string>();
  const actions: ThemeSyncAction[] = [];

  for (const [localId, link] of Object.entries(links)) {
    if (localIds.has(localId)) continue;
    claimed.add(link.remoteId);
    if (remoteById.has(link.remoteId)) {
      actions.push({ kind: "deleteRemote", localId, remoteId: link.remoteId });
    }
  }

  const unlinked: ThemeDefinition[] = [];
  for (const theme of local) {
    const link = links[theme.id];
    if (!link) {
      unlinked.push(theme);
      continue;
    }

    const dirty = themeContentKey(theme) !== link.contentKey;
    const found = remoteById.get(link.remoteId);
    if (!found) {
      claimed.add(link.remoteId);
      actions.push(
        dirty
          ? { kind: "push", localId: theme.id, remoteId: null }
          : { kind: "deleteLocal", localId: theme.id },
      );
      continue;
    }

    claimed.add(found.id);
    const changed = found.changedAt !== link.syncedAt;
    if (dirty && (!changed || newer(theme, found))) {
      actions.push({ kind: "push", localId: theme.id, remoteId: found.id });
    } else if (changed) {
      actions.push({ kind: "pull", remote: found, localId: theme.id });
    }
  }

  for (const theme of unlinked) {
    const match = remote.find(
      (candidate) => candidate.clientId === theme.id && !claimed.has(candidate.id),
    );
    if (!match) {
      actions.push({ kind: "push", localId: theme.id, remoteId: null });
      continue;
    }

    claimed.add(match.id);
    if (sameThemeLook(theme, match)) {
      actions.push({ kind: "link", localId: theme.id, remote: match });
    } else if (newer(theme, match)) {
      actions.push({ kind: "push", localId: theme.id, remoteId: match.id });
    } else {
      actions.push({ kind: "pull", remote: match, localId: theme.id });
    }
  }

  for (const theme of remote) {
    if (claimed.has(theme.id)) continue;
    const reuse = theme.clientId && !localIds.has(theme.clientId) ? theme.clientId : null;
    if (reuse) localIds.add(reuse);
    actions.push({ kind: "pull", remote: theme, localId: reuse });
  }

  return actions;
}

export function mergeSyncedThemes(
  snapshot: ThemeDefinition[],
  current: ThemeDefinition[],
  removed: Set<string>,
  upserted: Map<string, ThemeDefinition>,
): ThemeDefinition[] {
  const before = new Map(snapshot.map((theme) => [theme.id, themeContentKey(theme)]));
  const currentIds = new Set(current.map((theme) => theme.id));
  const result: ThemeDefinition[] = [];

  for (const theme of current) {
    const untouched = before.get(theme.id) === themeContentKey(theme);
    if (removed.has(theme.id) && untouched) continue;
    const replacement = upserted.get(theme.id);
    result.push(replacement && untouched ? replacement : theme);
  }
  for (const [id, theme] of upserted) {
    if (!before.has(id) && !currentIds.has(id)) result.push(theme);
  }
  return result.slice(0, MAX_USER_THEMES);
}
