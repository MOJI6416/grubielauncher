import fs from "fs-extra";
import path from "path";
import pLimit from "p-limit";
import type { ModIdConflict } from "@/types/ModBisect";
import type { LocalModDependencies } from "@/types/ModManager";
import { readLocalModDependencies } from "./localModDependencies";
import { checkLocalMod } from "./modManager";

export function ownModIds(info: LocalModDependencies): string[] {
  const embedded = new Set(info.embedded ?? []);
  return info.provides.filter((id) => !embedded.has(id));
}

export function groupModIdConflicts(
  files: readonly { fileName: string; ids: readonly string[] }[],
): { modId: string; files: string[] }[] {
  const byId = new Map<string, string[]>();
  for (const file of files) {
    for (const id of new Set(file.ids)) {
      const list = byId.get(id) ?? [];
      list.push(file.fileName);
      byId.set(id, list);
    }
  }
  const groups: { modId: string; files: string[] }[] = [];
  const seen = new Set<string>();
  for (const [modId, names] of byId) {
    if (names.length < 2) continue;
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const key = sorted.join("\n");
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ modId, files: sorted });
  }
  return groups.sort((a, b) => a.modId.localeCompare(b.modId));
}

export async function findModIdConflicts(
  versionPath: string,
): Promise<ModIdConflict[]> {
  const folder = path.join(versionPath, "mods");
  const names = (await fs.readdir(folder).catch(() => [] as string[])).filter(
    (name) => /\.jar$/i.test(name),
  );
  const limit = pLimit(4);
  const files = (
    await Promise.all(
      names.map((fileName) =>
        limit(async () => {
          const info = await readLocalModDependencies(
            path.join(folder, fileName),
          ).catch(() => null);
          return info ? { fileName, ids: ownModIds(info) } : null;
        }),
      ),
    )
  ).filter((file): file is { fileName: string; ids: string[] } => !!file);

  const groups = groupModIdConflicts(files);
  return Promise.all(
    groups.map(async (group) => ({
      modId: group.modId,
      files: await Promise.all(
        group.files.map(async (fileName) => {
          const filePath = path.join(folder, fileName);
          const [info, stats] = await Promise.all([
            checkLocalMod(filePath),
            fs.stat(filePath).catch(() => null),
          ]);
          return {
            fileName,
            title: info?.name || fileName,
            version: info?.version || "",
            size: stats?.size ?? 0,
            modifiedAt: stats?.mtimeMs ?? 0,
          };
        }),
      ),
    })),
  );
}
