import { atom, getDefaultStore } from "jotai";
import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { accountAtom } from "@renderer/stores/atoms";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { showFailureToast } from "@renderer/utilities/failures";
import type { ThemeDefinition } from "@/shared/themes";
import {
  GALLERY_BACKDROP,
  GALLERY_THUMB,
  galleryThemeToDefinition,
  publishPayload,
  type GalleryTheme,
  type PublishImages,
} from "@/shared/themeGallery";
import { addTheme } from "./themeTransfer";
import { newThemeId, userThemesAtom } from "./themesStore";

const api = window.api;

const MIN_SIDE = 360;
const MAX_SIDE = 3840;
const QUALITIES = [0.86, 0.76, 0.64];

export const galleryFocusAtom = atom<string | null>(null);
export const myPublicationsVersionAtom = atom(0);

export function galleryToken(): string | null {
  return getDefaultStore().get(accountAtom)?.accessToken || null;
}

async function encodeWebp(
  bitmap: ImageBitmap,
  source: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);

  for (const quality of QUALITIES) {
    const blob = await canvas.convertToBlob({ type: "image/webp", quality });
    if (blob.size <= maxBytes) return new Uint8Array(await blob.arrayBuffer());
  }
  return null;
}

export async function prepareGalleryImages(path: string): Promise<PublishImages | null> {
  const data = await api.fs.readFileBuffer(path);
  if (!data) return null;
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)]));

  try {
    const { width, height } = bitmap;
    const cover = Math.max(GALLERY_BACKDROP.width / width, GALLERY_BACKDROP.height / height);
    const scale = Math.min(
      Math.max(Math.min(1, cover), MIN_SIDE / Math.min(width, height)),
      MAX_SIDE / Math.max(width, height),
    );
    const backdrop = await encodeWebp(
      bitmap,
      { x: 0, y: 0, width, height },
      Math.round(width * scale),
      Math.round(height * scale),
      GALLERY_BACKDROP.maxBytes,
    );

    const ratio = GALLERY_THUMB.width / GALLERY_THUMB.height;
    const cropWidth = Math.min(width, height * ratio);
    const cropHeight = cropWidth / ratio;
    const thumb = await encodeWebp(
      bitmap,
      { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight },
      GALLERY_THUMB.width,
      GALLERY_THUMB.height,
      GALLERY_THUMB.maxBytes,
    );

    return backdrop && thumb ? { backdrop, thumb } : null;
  } finally {
    bitmap.close();
  }
}

export async function publishTheme(theme: ThemeDefinition): Promise<boolean> {
  const token = galleryToken();
  if (!token) {
    toast.info(i18n.t("theme.gallery.signIn"));
    return false;
  }

  try {
    const images = theme.backdrop
      ? await prepareGalleryImages(theme.backdrop.path).catch(() => null)
      : null;
    if (theme.backdrop && !images) {
      toast.error(i18n.t("theme.gallery.errors.bad_picture"));
      return false;
    }

    const result = await api.theme.publish(token, publishPayload(theme), images);
    if (result.ok) {
      getDefaultStore().set(myPublicationsVersionAtom, (value) => value + 1);
      toast.success(i18n.t("theme.gallery.published", { name: theme.name }), {
        description: i18n.t("theme.gallery.publishedHint"),
      });
      return true;
    }

    if (result.error === "duplicate") {
      toast.error(
        result.dupStatus === "rejected"
          ? i18n.t("theme.gallery.errors.duplicateRejected")
          : i18n.t("theme.gallery.errors.duplicate"),
        { description: result.reason ?? undefined },
      );
      return false;
    }
    toast.error(i18n.t(`theme.gallery.errors.${result.error}`));
    return false;
  } catch (error) {
    showFailureToast(i18n.t("theme.gallery.errors.failed"), error, {
      channels: ["theme:publish"],
    });
    return false;
  }
}

export async function installGalleryTheme(item: GalleryTheme): Promise<boolean> {
  const installed = getDefaultStore()
    .get(userThemesAtom)
    .find((theme) => theme.galleryId === item.id);
  if (installed) {
    await patchSettings({ themeId: installed.id }).catch(() => undefined);
    return true;
  }

  try {
    const result = await api.theme.galleryInstall(item.id);
    const theme = result
      ? galleryThemeToDefinition(result.theme, newThemeId(), result.backdropPath)
      : null;
    if (!theme) {
      toast.error(i18n.t("theme.gallery.errors.install"));
      return false;
    }
    return await addTheme(theme);
  } catch (error) {
    showFailureToast(i18n.t("theme.gallery.errors.install"), error, {
      channels: ["theme:galleryInstall"],
    });
    return false;
  }
}
