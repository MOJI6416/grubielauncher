import { resolveLocalImage } from "@renderer/utilities/localMedia";
import { getLocalPathFromFileUrl } from "@renderer/utilities/exportVersion";
import {
  cropSkinHead,
  inferSkinModel,
  inspectSkinTexture,
  PixelImage,
  SkinTextureInfo,
  SkinTextureProblem,
} from "./skinTexture";

const api = window.api;

export interface LoadedTexture {
  bytes: Uint8Array;
  image: PixelImage;
  info: SkinTextureInfo;
}

export type LoadedTextureResult =
  | { ok: true; texture: LoadedTexture }
  | { ok: false; problem: SkinTextureProblem | "unreadable" };

export async function fetchTextureBytes(
  url: string,
): Promise<Uint8Array | null> {
  if (!url) return null;

  if (url.startsWith("file://")) {
    const localPath = getLocalPathFromFileUrl(url);
    if (!localPath) return null;

    return await api.fs.readFileBuffer(localPath);
  }

  if (url.startsWith("data:")) {
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  }

  try {
    const response = await fetch(resolveLocalImage(url));
    if (!response.ok) return null;

    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function decodeToPixels(
  bytes: Uint8Array,
): Promise<PixelImage | null> {
  try {
    const blob = new Blob([bytes as BlobPart], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);

    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return null;
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const data = context.getImageData(0, 0, canvas.width, canvas.height);

    return { width: canvas.width, height: canvas.height, data: data.data };
  } catch {
    return null;
  }
}

export async function loadSkinTexture(
  url: string,
): Promise<LoadedTextureResult> {
  const bytes = await fetchTextureBytes(url).catch(() => null);
  const check = inspectSkinTexture(bytes);
  if (!check.ok) return { ok: false, problem: check.problem };

  const image = await decodeToPixels(bytes as Uint8Array);
  if (!image) return { ok: false, problem: "unreadable" };

  return { ok: true, texture: { bytes: bytes as Uint8Array, image, info: check.info } };
}

export function pixelsToDataUrl(image: PixelImage, scale = 1): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width * scale;
  canvas.height = image.height * scale;

  const context = canvas.getContext("2d");
  if (!context) return "";

  if (scale === 1) {
    context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
    return canvas.toDataURL("image/png");
  }

  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  source
    .getContext("2d")
    ?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);

  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/png");
}

const headCache = new Map<string, string>();
const HEAD_CACHE_LIMIT = 120;

export async function renderSkinHead(url: string): Promise<string> {
  if (!url) return "";

  const cached = headCache.get(url);
  if (cached !== undefined) return cached;

  const result = await loadSkinTexture(url);
  const value = result.ok
    ? pixelsToDataUrl(cropSkinHead(result.texture.image))
    : "";

  if (headCache.size >= HEAD_CACHE_LIMIT) {
    const oldest = headCache.keys().next().value;
    if (oldest !== undefined) headCache.delete(oldest);
  }
  headCache.set(url, value);

  return value;
}

export async function detectModelFromUrl(
  url: string,
): Promise<"slim" | "classic" | null> {
  const result = await loadSkinTexture(url);
  if (!result.ok) return null;

  return inferSkinModel(result.texture.image);
}
