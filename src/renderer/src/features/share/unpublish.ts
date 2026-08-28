import type { IVersionConf } from "@/types/IVersion";

export function unpublishedImage(
  image: string | undefined,
  shareCode: string,
): string {
  if (!image) return "";
  if (!shareCode) return image;
  return image.includes(shareCode) ? "" : image;
}

export function applyUnpublish(conf: IVersionConf, shareCode: string): void {
  conf.shareCode = undefined;
  conf.build = 0;
  conf.image = unpublishedImage(conf.image, shareCode);
}
