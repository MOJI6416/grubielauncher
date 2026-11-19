import type { ILocalProject } from "@/types/ModManager";
import { toFileUrl } from "@renderer/utilities/exportVersion";

export function rebaseLocalPaths(
  mods: ILocalProject[],
  sourceRoot: string,
  versionPath: string,
): void {
  const from = `${sourceRoot.replace(/\\/g, "/").replace(/\/+$/, "")}/`;
  const target = versionPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const lowerFrom = from.toLowerCase();

  for (const mod of mods) {
    for (const file of mod.version?.files ?? []) {
      if (!file.localPath) continue;

      const normalized = file.localPath.replace(/\\/g, "/");
      if (!normalized.toLowerCase().startsWith(lowerFrom)) continue;

      file.localPath = `${target}/${normalized.slice(from.length)}`;
      if (file.url?.startsWith("file:")) {
        file.url = toFileUrl(file.localPath).replace(/\?t=\d+$/, "");
      }
    }
  }
}
