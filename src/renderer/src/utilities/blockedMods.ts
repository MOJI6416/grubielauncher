import { ILocalProject, ProjectType, Provider } from "@/types/ModManager";

export interface IBlockedMod {
  projectId: string;
  fileName: string;
  hash: string;
  url: string;
  filePath?: string;
}

type BlockedModFileLike = {
  url?: string;
  localPath?: string;
  sha1?: string;
};

export function isBlockedModFile(file: BlockedModFileLike) {
  return file.url?.startsWith("blocked::") === true;
}

export function isResolvedBlockedModFile(
  file: BlockedModFileLike,
  localFileExists: boolean,
  localSha1?: string,
) {
  if (!isBlockedModFile(file)) return true;
  if (!file.localPath || !localFileExists) return false;
  if (!file.sha1) return true;

  return localSha1 === file.sha1;
}

export function applyBlockedModFilePaths(
  mods: ILocalProject[],
  blockedMods: IBlockedMod[],
) {
  let changed = false;

  for (const blockedMod of blockedMods) {
    if (!blockedMod.filePath) continue;

    const mod = mods.find((m) => m.id === blockedMod.projectId);
    const files = mod?.version?.files ?? [];
    const blockedFiles = files.filter(isBlockedModFile);

    const file =
      blockedFiles.find(
        (f) =>
          f.filename === blockedMod.fileName &&
          (!blockedMod.hash || f.sha1 === blockedMod.hash),
      ) || (blockedFiles.length === 1 ? blockedFiles[0] : undefined);

    if (!file || file.localPath === blockedMod.filePath) continue;

    file.localPath = blockedMod.filePath;
    changed = true;
  }

  return changed;
}

export async function checkBlockedMods(
  mods: ILocalProject[],
  versionPath?: string,
) {
  if (mods.length === 0) return [];

  const api = window.api;
  const blockedMods: IBlockedMod[] = [];

  for (const mod of mods) {
    if (mod.provider !== Provider.CURSEFORGE) continue;
    const files = mod.version?.files ?? [];

    for (const file of files) {
      if (!file?.url) continue;
      if (!isBlockedModFile(file)) continue;

      if (file.localPath && (await api.fs.pathExists(file.localPath))) {
        try {
          const hash = await api.fs.sha1(file.localPath);
          if (isResolvedBlockedModFile(file, true, hash)) continue;
        } catch {}
      }

      if (versionPath) {
        let folderName = await api.modManager.ptToFolder(mod.projectType);
        if (mod.projectType === ProjectType.WORLD) {
          folderName = await api.path.join("storage", "worlds");
        }
        const filePath = await api.path.join(
          versionPath,
          folderName,
          file.filename,
        );
        const isExists = await api.fs.pathExists(filePath);
        if (isExists) {
          try {
            const hash = await api.fs.sha1(filePath);
            if (!file.sha1 || hash === file.sha1) continue;
          } catch {
            continue;
          }
        }
      }

      blockedMods.push({
        fileName: file.filename,
        hash: file.sha1,
        url: file.url.replace("blocked::", ""),
        projectId: mod.id,
      });
    }
  }

  return blockedMods;
}
