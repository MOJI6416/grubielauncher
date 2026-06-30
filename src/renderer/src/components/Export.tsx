import {
  CheckCircle2,
  FolderArchive,
  FolderSearch2,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import type { IVersionConf } from "@/types/IVersion";
import { ProjectType, type ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  EXPORT_EXCLUDED_TOP_LEVEL,
  getLocalPathFromFileUrl,
  sanitizeExportVersion,
} from "@renderer/utilities/exportVersion";

const api = window.api;

async function getProjectFileFolder(mod: ILocalProject) {
  if (mod.projectType === ProjectType.WORLD) {
    return api.path.join("storage", "worlds");
  }

  if (mod.projectType === ProjectType.PLUGIN) {
    return api.path.join(
      "server",
      await api.modManager.ptToFolder(mod.projectType),
    );
  }

  return api.modManager.ptToFolder(mod.projectType);
}

async function copyPortableLocalFiles(
  mods: ILocalProject[],
  exportTempPath: string,
) {
  for (const mod of mods) {
    if (!mod.version?.files.length) continue;

    const folder = await getProjectFileFolder(mod);

    for (const file of mod.version.files) {
      const sourcePath = file.localPath || getLocalPathFromFileUrl(file.url);
      if (!sourcePath) continue;
      if (!(await api.fs.pathExists(sourcePath))) continue;

      const destinationFolder = await api.path.join(exportTempPath, folder);
      const destinationPath = await api.path.join(
        destinationFolder,
        file.filename,
      );

      if (await api.fs.pathExists(destinationPath)) continue;

      await api.fs.ensure(destinationFolder);
      await api.fs.copy(sourcePath, destinationPath);
    }
  }
}

async function ensurePortableLogo(
  version: IVersionConf,
  exportTempPath: string,
) {
  const logoSourcePath = getLocalPathFromFileUrl(version.image);
  if (!logoSourcePath || !(await api.fs.pathExists(logoSourcePath))) return;

  const logoPath = await api.path.join(exportTempPath, "logo.png");
  if (await api.fs.pathExists(logoPath)) return;

  await api.fs.copy(logoSourcePath, logoPath);
}

export function Export({
  versionPath,
  onClose,
}: {
  versionPath: string;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [folderPath, setPath] = useState<string>("");
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const { t } = useTranslation();

  const chooseFolder = async () => {
    const folders = await api.other.openFileDialog(true);
    const picked = folders?.[0] || "";
    if (!picked) return;
    setPath(picked);
  };

  const handleExport = async () => {
    if (!selectedVersion || !folderPath) return;
    const exportTempPath = await api.path.join(
      folderPath,
      `.grubie-export-${Date.now()}`,
    );

    try {
      setIsLoading(true);

      const dir = await api.fs.readdir(versionPath);

      await api.fs.ensure(exportTempPath);

      for (const file of dir) {
        if (EXPORT_EXCLUDED_TOP_LEVEL.has(file)) continue;

        const source = await api.path.join(versionPath, file);
        const destination = await api.path.join(exportTempPath, file);
        await api.fs.copy(source, destination);
      }

      await copyPortableLocalFiles(
        selectedVersion.version.loader.mods,
        exportTempPath,
      );
      await ensurePortableLogo(selectedVersion.version, exportTempPath);

      const exportVersion = sanitizeExportVersion(selectedVersion.version);
      await api.fs.writeJSON(
        await api.path.join(exportTempPath, "version.json"),
        exportVersion,
      );

      const exportDir = await api.fs.readdir(exportTempPath);
      const files: string[] = [];
      for (const file of exportDir) {
        files.push(await api.path.join(exportTempPath, file));
      }

      const zipPath = await api.path.join(
        folderPath,
        `${selectedVersion.version.name}.zip`,
      );

      await api.file.archiveFiles(files, zipPath, exportTempPath);

      onClose();
      toast.success(t("export.success"));
    } catch (err) {
      toast.error(t("export.error"));
    } finally {
      await api.fs.rimraf(exportTempPath);

      setIsLoading(false);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <FolderArchive className="size-5" />
            {t("export.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-5 pb-5">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-card p-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {folderPath ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <FolderSearch2 className="size-4" />
              )}
            </div>

            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {folderPath || t("export.selectFolder")}
            </p>

            <Button
              type="button"
              size="sm"
              disabled={isLoading}
              variant="secondary"
              onClick={chooseFolder}
            >
              {t("common.choose")}
            </Button>
          </div>
        </div>

        <DialogFooter className="m-0 rounded-none border-t bg-muted/25 px-5 py-4">
          <Button disabled={!folderPath || isLoading} onClick={handleExport}>
            {isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <FolderArchive className="size-5" />
            )}
            {t("export.btn")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
