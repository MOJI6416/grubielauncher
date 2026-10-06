import { toast } from "sonner";
import i18n from "@renderer/i18n";
import { captureCopyAnchor, flashCopied } from "./copyFeedback";

const api = window.api;
const CLIPBOARD_TYPES = new Set(["image/png", "image/jpeg"]);

async function toPng(bytes: Uint8Array, type: string): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(
      new Blob([new Uint8Array(bytes)], { type }),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await canvas.convertToBlob({ type: "image/png" });
    return new Uint8Array(await png.arrayBuffer());
  } catch {
    return null;
  }
}

export async function copyRemoteImage(url: string): Promise<boolean> {
  const anchor = captureCopyAnchor();
  const image = await api.media.fetchImage(url).catch(() => null);
  const data = image
    ? CLIPBOARD_TYPES.has(image.type)
      ? image.bytes
      : await toPng(image.bytes, image.type)
    : null;
  const copied = data
    ? await api.clipboard.writeImageData(data).catch(() => false)
    : false;

  if (copied) flashCopied(anchor);
  else toast.error(i18n.t("common.copyFailed"));
  return copied;
}

export async function saveRemoteImage(url: string, name: string): Promise<void> {
  const result = await api.media
    .saveImage(url, name)
    .catch(() => "failed" as const);

  if (result === "saved") {
    toast.success(i18n.t("mediaViewer.saved"), {
      action: {
        label: i18n.t("mediaViewer.showInFolder"),
        onClick: () => void api.media.showSaved(),
      },
    });
  } else if (result === "failed") {
    toast.error(i18n.t("mediaViewer.saveFailed"));
  }
}

export function remoteImageName(url: string, fallback: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last) || fallback;
  } catch {
    return fallback;
  }
}
