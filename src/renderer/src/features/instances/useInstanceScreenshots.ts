import { useEffect, useState } from "react";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { resolveLocalImage } from "@renderer/utilities/localMedia";

const api = window.api;
const SCREENSHOT_FILE = /\.(png|jpe?g)$/i;

export function pickRecentScreenshots(names: string[], limit: number): string[] {
  return names
    .filter((name) => SCREENSHOT_FILE.test(name))
    .sort()
    .reverse()
    .slice(0, limit);
}

export function useInstanceScreenshots(
  versionPath: string,
  enabled: boolean,
  limit = 6,
): string[] {
  const [screenshots, setScreenshots] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void (async () => {
      const folder = await api.path.join(versionPath, "screenshots");
      if (!(await api.fs.pathExists(folder))) return;

      const entries = await api.fs.readdirWithTypes(folder);
      const names = pickRecentScreenshots(
        entries.filter((entry) => entry.type === "file").map((entry) => entry.path),
        limit,
      );
      const urls = await Promise.all(
        names.map(async (name) =>
          resolveLocalImage(toFileUrl(await api.path.join(folder, name))),
        ),
      );

      if (!cancelled) setScreenshots(urls);
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, enabled, limit]);

  return screenshots;
}
