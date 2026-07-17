import { getLocalPathFromFileUrl } from "./exportVersion";

export function resolveLocalImage(url?: string | null): string {
  if (!url) return "";
  if (!url.startsWith("file://")) return url;
  if (window.location.protocol !== "app:") return url;

  const localPath = getLocalPathFromFileUrl(url);
  if (!localPath) return url;

  const cacheKey = url.split("?")[1] || "";

  return `app://media/?p=${encodeURIComponent(localPath)}${
    cacheKey ? `&${cacheKey}` : ""
  }`;
}
