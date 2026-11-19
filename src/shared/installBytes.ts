import type { ILocalProject, IModpackExtraFile } from "@/types/ModManager";

export function contentBytes(
  mods: ILocalProject[],
  extraFiles: IModpackExtraFile[] = [],
): number {
  let bytes = 0;

  for (const mod of mods) {
    for (const file of mod.version?.files ?? []) {
      if (file.localPath) continue;
      if (typeof file.size === "number" && file.size > 0) bytes += file.size;
    }
  }

  for (const extra of extraFiles) {
    const copies = (extra.isClient ? 1 : 0) + (extra.isServer ? 1 : 0);
    if (extra.size > 0) bytes += extra.size * copies;
  }

  return bytes;
}
