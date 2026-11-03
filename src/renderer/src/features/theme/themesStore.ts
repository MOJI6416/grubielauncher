import { atom, getDefaultStore, useAtomValue } from "jotai";
import {
  findTheme,
  normalizeThemesFile,
  type ThemeDefinition,
} from "@/shared/themes";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

const api = window.api;

const BACKDROP_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];
const BACKDROP_MAX = { width: 2560, height: 1440, bytes: 3 * 1024 * 1024 };

export const userThemesAtom = atom<ThemeDefinition[]>([]);
export const themeDraftAtom = atom<ThemeDefinition | null>(null);

export const activeThemeAtom = atom((get) => {
  const draft = get(themeDraftAtom);
  if (draft) return draft;
  return findTheme(get(settingsAtom).themeId, get(userThemesAtom));
});

export function useActiveTheme(): ThemeDefinition {
  return useAtomValue(activeThemeAtom);
}

async function themesDir(launcher: string): Promise<string> {
  return await api.path.join(launcher, "themes");
}

export async function hydrateUserThemes(launcher: string): Promise<void> {
  try {
    const file = await api.path.join(await themesDir(launcher), "themes.json");
    if (!(await api.fs.pathExists(file))) return;
    const raw = await api.fs.readJSON<unknown>(file, "utf-8");
    getDefaultStore().set(userThemesAtom, normalizeThemesFile(raw).themes);
  } catch {
    getDefaultStore().set(userThemesAtom, []);
  }
}

export async function saveUserThemes(themes: ThemeDefinition[]): Promise<boolean> {
  const store = getDefaultStore();
  const { launcher } = store.get(pathsAtom);
  if (!launcher) return false;

  const dir = await themesDir(launcher);
  const normalized = normalizeThemesFile({ themes }).themes;
  if (!(await api.fs.ensure(dir))) return false;
  const saved = await api.fs.writeJSON(await api.path.join(dir, "themes.json"), {
    version: 1,
    themes: normalized,
  });
  if (saved) store.set(userThemesAtom, normalized);
  return saved;
}

export function newThemeId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function fitBackdrop(data: Uint8Array): Promise<Uint8Array | null> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));
  try {
    const scale = Math.min(
      1,
      Math.max(BACKDROP_MAX.width / bitmap.width, BACKDROP_MAX.height / bitmap.height),
    );
    if (scale === 1 && data.length <= BACKDROP_MAX.bytes) return null;

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.9 });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

export async function pickBackdrop(): Promise<string | null> {
  const [source] = await api.other.openFileDialog(false, [
    { name: "Image", extensions: BACKDROP_EXTENSIONS },
  ]);
  if (!source) return null;

  const { launcher } = getDefaultStore().get(pathsAtom);
  if (!launcher) return null;

  const extension = source.split(".").pop()?.toLowerCase() ?? "";
  if (!BACKDROP_EXTENSIONS.includes(extension)) return null;

  const dir = await api.path.join(await themesDir(launcher), "backdrops");
  if (!(await api.fs.ensure(dir))) return null;

  const data = await api.fs.readFileBuffer(source);
  const fitted = data ? await fitBackdrop(data).catch(() => null) : null;
  if (fitted) {
    const target = await api.path.join(dir, `${newThemeId()}.webp`);
    return (await api.fs.writeFile(target, fitted)) ? target : null;
  }

  const target = await api.path.join(dir, `${newThemeId()}.${extension}`);
  return (await api.fs.copy(source, target)) ? target : null;
}

export function backdropUrl(path: string): string {
  return resolveLocalImage(toFileUrl(path).split("?")[0]);
}
