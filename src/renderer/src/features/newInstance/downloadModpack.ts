import { getDefaultStore } from "jotai";
import type {
  IModpack as IImportedModpack,
  IProject,
  IVersion as IProjectVersion,
} from "@/types/ModManager";
import { pathsAtom, settingsAtom } from "@renderer/stores/atoms";
import type { IBlockedMod } from "@renderer/utilities/blockedMods";

const api = window.api;

export type ModpackDownloadStage = "download" | "extract" | null;

export type ModpackDownloadResult =
  | { status: "ok"; modpack: IImportedModpack }
  | { status: "blocked"; blocked: IBlockedMod }
  | { status: "failed"; error?: unknown };

async function readModpackFolder(
  archivePath: string,
  project: IProject,
  version: IProjectVersion,
  onStage: (stage: ModpackDownloadStage) => void,
): Promise<IImportedModpack | null> {
  const paths = getDefaultStore().get(pathsAtom);
  const temp = await api.path.join(paths.launcher, "temp");
  const fileName = await api.path.basename(archivePath);
  const targetPath = await api.path.join(
    temp,
    await api.path.basename(fileName, await api.path.extname(fileName)),
  );

  onStage("extract");
  await api.fs.extractZip(archivePath, targetPath);

  return api.modManager.checkModpack(targetPath, project, version);
}

export async function downloadModpack(
  project: IProject,
  version: IProjectVersion,
  onStage: (stage: ModpackDownloadStage) => void,
): Promise<ModpackDownloadResult> {
  const file = version.files[0];
  if (!file) return { status: "failed" };

  const store = getDefaultStore();
  const paths = store.get(pathsAtom);
  const settings = store.get(settingsAtom);

  if (file.url.startsWith("blocked::")) {
    return {
      status: "blocked",
      blocked: {
        fileName: file.filename,
        hash: file.sha1,
        url: file.url.replace("blocked::", ""),
        projectId: project.id,
        fileId: Number(version.id) || 0,
        modTitle: project.title,
      },
    };
  }

  try {
    const temp = await api.path.join(paths.launcher, "temp");
    const archivePath = await api.path.join(temp, file.filename);

    onStage("download");
    await api.file.download(
      [
        {
          destination: archivePath,
          group: "mods",
          url: file.url,
          sha1: file.sha1,
          size: file.size,
        },
      ],
      settings.downloadLimit,
    );

    const modpack = await readModpackFolder(
      archivePath,
      project,
      version,
      onStage,
    );
    await api.fs.rimraf(archivePath).catch(() => undefined);

    if (!modpack) return { status: "failed" };

    return { status: "ok", modpack };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    onStage(null);
  }
}

export async function readBlockedModpack(
  filePath: string,
  project: IProject,
  version: IProjectVersion,
  onStage: (stage: ModpackDownloadStage) => void,
): Promise<ModpackDownloadResult> {
  try {
    const modpack = await readModpackFolder(
      filePath,
      project,
      version,
      onStage,
    );

    if (!modpack) return { status: "failed" };

    return { status: "ok", modpack };
  } catch (error) {
    return { status: "failed", error };
  } finally {
    onStage(null);
  }
}
