import { getDefaultStore } from "jotai";
import { pathsAtom } from "@renderer/stores/atoms";
import {
  newThemeId,
  saveUserThemes,
  userThemesAtom,
} from "@renderer/features/theme/themesStore";
import { MAX_USER_THEMES, normalizeTheme, type ThemeDefinition } from "@/shared/themes";
import {
  mergeSyncedThemes,
  planThemeSync,
  themeContentKey,
  type RemoteTheme,
  type ThemeLink,
  type ThemeLinks,
} from "@/shared/themeSync";
import type { AccountSyncFailure, ThemePushPayload } from "@/types/AccountSync";

const api = window.api;

const PICTURE = { width: 2560, height: 1440, minSide: 360, maxSide: 3840, maxBytes: 3 * 1024 * 1024 };
const QUALITIES = [0.9, 0.8, 0.7];
const FATAL: AccountSyncFailure[] = ["offline", "unauthorized"];

type LinksFile = { version: 1; accounts: Record<string, ThemeLinks> };

function linksFile(): string | null {
  const { launcher } = getDefaultStore().get(pathsAtom);
  return launcher ? api.path.join(launcher, "sync", "themes.json") : null;
}

async function readLinksFile(): Promise<LinksFile> {
  const file = linksFile();
  if (!file || !(await api.fs.pathExists(file))) return { version: 1, accounts: {} };
  const data = await api.fs.readJSON<LinksFile>(file, "utf-8").catch(() => null);
  return data?.accounts && typeof data.accounts === "object"
    ? { version: 1, accounts: data.accounts }
    : { version: 1, accounts: {} };
}

async function writeLinks(userId: string, links: ThemeLinks): Promise<void> {
  const file = linksFile();
  const { launcher } = getDefaultStore().get(pathsAtom);
  if (!file || !launcher || !(await api.fs.ensure(api.path.join(launcher, "sync")))) return;
  const current = await readLinksFile();
  current.accounts[userId] = links;
  await api.fs.writeJSON(file, current);
}

async function encodePicture(path: string): Promise<Uint8Array | null> {
  const data = await api.fs.readFileBuffer(path);
  if (!data) return null;
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
  try {
    const { width, height } = bitmap;
    const cover = Math.max(PICTURE.width / width, PICTURE.height / height);
    const scale = Math.min(
      Math.max(Math.min(1, cover), PICTURE.minSide / Math.min(width, height)),
      PICTURE.maxSide / Math.max(width, height),
    );
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale)),
    );
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (blob.size <= PICTURE.maxBytes) return new Uint8Array(await blob.arrayBuffer());
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function pushPayload(theme: ThemeDefinition): ThemePushPayload {
  return {
    name: theme.name,
    mode: theme.mode,
    colors: theme.colors,
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
    changedAt: theme.updatedAt || Date.now(),
    clientId: theme.id,
  };
}

function linkFor(theme: ThemeDefinition, remote: RemoteTheme): ThemeLink {
  return {
    remoteId: remote.id,
    syncedAt: remote.changedAt,
    contentKey: themeContentKey(theme),
    picturePath: theme.backdrop?.path ?? null,
    pictureHash: remote.backdrop?.hash ?? null,
  };
}

function fromRemote(
  remote: RemoteTheme,
  id: string,
  picturePath: string | null,
  previous: ThemeDefinition | undefined,
): ThemeDefinition | null {
  const { hash: _hash, ...frame } = remote.backdrop ?? { hash: null };
  return normalizeTheme({
    id,
    name: remote.name,
    mode: remote.mode,
    colors: remote.colors,
    backdrop: remote.backdrop && picturePath ? { ...frame, path: picturePath } : null,
    galleryId: previous?.galleryId,
    updatedAt: remote.changedAt,
  });
}

export async function syncThemes(
  token: string,
  userId: string,
): Promise<AccountSyncFailure | null> {
  const listed = await api.sync.themes.list(token);
  if (!listed.ok) return listed.reason;

  const remote = listed.data;
  const remoteById = new Map(remote.map((theme) => [theme.id, theme]));
  const links: ThemeLinks = { ...((await readLinksFile()).accounts[userId] ?? {}) };
  const store = getDefaultStore();
  const snapshot = store.get(userThemesAtom);
  const working = new Map(snapshot.map((theme) => [theme.id, theme]));
  const removed = new Set<string>();
  const upserted = new Map<string, ThemeDefinition>();
  let failure: AccountSyncFailure | null = null;

  const put = (theme: ThemeDefinition) => {
    working.set(theme.id, theme);
    upserted.set(theme.id, theme);
  };

  for (const action of planThemeSync(snapshot, links, remote)) {
    if (failure) break;

    if (action.kind === "deleteRemote") {
      const result = await api.sync.themes.remove(token, action.remoteId);
      if (result.ok) delete links[action.localId];
      else if (FATAL.includes(result.reason)) failure = result.reason;
      continue;
    }

    if (action.kind === "deleteLocal") {
      working.delete(action.localId);
      removed.add(action.localId);
      delete links[action.localId];
      continue;
    }

    if (action.kind === "link") {
      const theme = working.get(action.localId);
      if (theme) links[theme.id] = linkFor(theme, action.remote);
      continue;
    }

    if (action.kind === "pull") {
      const current = action.localId ? working.get(action.localId) : undefined;
      if (!current && working.size >= MAX_USER_THEMES) continue;
      const link = current ? links[current.id] : undefined;

      let picturePath: string | null = null;
      if (action.remote.backdrop) {
        const reuse =
          current?.backdrop &&
          link?.pictureHash &&
          link.pictureHash === action.remote.backdrop.hash &&
          link.picturePath === current.backdrop.path;
        picturePath = reuse
          ? current.backdrop!.path
          : await api.sync.themes.picture(token, action.remote.id);
        if (!picturePath) continue;
      }

      const theme = fromRemote(
        action.remote,
        current?.id ?? action.localId ?? newThemeId(),
        picturePath,
        current,
      );
      if (!theme) continue;
      put(theme);
      links[theme.id] = linkFor(theme, action.remote);
      continue;
    }

    const theme = working.get(action.localId);
    if (!theme) continue;
    const link = links[theme.id];
    const target = action.remoteId ? remoteById.get(action.remoteId) : undefined;
    const keepPicture = Boolean(
      theme.backdrop &&
        target?.backdrop?.hash &&
        link?.pictureHash === target.backdrop.hash &&
        link.picturePath === theme.backdrop.path,
    );
    const picture =
      theme.backdrop && !keepPicture
        ? await encodePicture(theme.backdrop.path).catch(() => null)
        : null;
    if (theme.backdrop && !keepPicture && !picture) continue;

    const payload = pushPayload(theme);
    const sent = await api.sync.themes.push(token, action.remoteId, payload, picture, keepPicture);
    if (!sent.ok) {
      const taken = new Set(Object.values(links).map((item) => item.remoteId));
      if (sent.reason === "duplicate" && sent.id && !taken.has(sent.id)) {
        const existing = remoteById.get(sent.id);
        links[theme.id] = existing
          ? linkFor(theme, existing)
          : { remoteId: sent.id, syncedAt: 0, contentKey: "", picturePath: null, pictureHash: null };
      } else if (FATAL.includes(sent.reason)) {
        failure = sent.reason;
      }
      continue;
    }

    const stored = sent.data;
    if (stored.changedAt > payload.changedAt) {
      links[theme.id] = { ...linkFor(theme, stored), syncedAt: 0 };
      continue;
    }
    const synced = { ...theme, updatedAt: stored.changedAt };
    if (synced.updatedAt !== theme.updatedAt) put(synced);
    links[theme.id] = linkFor(synced, stored);
  }

  if (removed.size > 0 || upserted.size > 0) {
    const merged = mergeSyncedThemes(snapshot, store.get(userThemesAtom), removed, upserted);
    await saveUserThemes(merged, { synced: true });
  }
  await writeLinks(userId, links);
  return failure;
}
