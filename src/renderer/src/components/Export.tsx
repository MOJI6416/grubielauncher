import {
  Boxes,
  FolderArchive,
  FolderSearch2,
  HardDrive,
  Loader2,
  Package,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import type { IVersionConf } from "@/types/IVersion";
import { ProjectType, type ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  hasNestedInstanceExclusions,
  isExcludedInstancePath,
} from "@/shared/instancePrivacy";
import {
  getLocalPathFromFileUrl,
  sanitizeExportVersion,
} from "@renderer/utilities/exportVersion";
import { formatBytes } from "@renderer/utilities/file";
import { useInstanceDiskUsage } from "@renderer/features/instances/useInstanceInsights";

const api = window.api;

type ExportStage = "copying" | "archiving";

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

      if (!(await api.fs.ensure(destinationFolder))) {
        throw new Error(`export failed to create ${folder}`);
      }
      if (!(await api.fs.copy(sourcePath, destinationPath))) {
        throw new Error(`export failed to copy ${file.filename}`);
      }
    }
  }
}

async function collectExportableEntries(versionPath: string) {
  const entries: string[] = [];

  for (const name of await api.fs.readdir(versionPath)) {
    if (isExcludedInstancePath(name)) continue;

    if (!hasNestedInstanceExclusions(name)) {
      entries.push(name);
      continue;
    }

    const nestedPath = await api.path.join(versionPath, name);
    for (const child of await api.fs.readdir(nestedPath)) {
      const relative = `${name}/${child}`;
      if (isExcludedInstancePath(relative)) continue;
      entries.push(relative);
    }
  }

  return entries;
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

async function copyExportEntries(
  versionPath: string,
  exportTempPath: string,
  entries: string[],
  onProgress: (done: number, current: string) => void,
) {
  let done = 0;
  for (const entry of entries) {
    onProgress(done, entry);
    const segments = entry.split("/");
    const source = await api.path.join(versionPath, ...segments);
    const destination = await api.path.join(exportTempPath, ...segments);

    if (!(await api.fs.copy(source, destination))) {
      throw new Error(`export failed to copy ${entry}`);
    }

    done += 1;
    onProgress(done, "");
  }
}

export function Export({
  versionPath,
  onClose,
}: {
  versionPath: string;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<ExportStage | null>(null);
  const [copied, setCopied] = useState<[number, number, string] | null>(null);
  const [folderPath, setPath] = useState<string>("");
  const [isNameTaken, setNameTaken] = useState(false);
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const { size, isUnknown: isSizeUnknown } = useInstanceDiskUsage(versionPath);
  const { t } = useTranslation();

  const isLoading = stage !== null;

  const sizeLabels = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  const modsCount = (selectedVersion?.version.loader.mods ?? []).filter(
    (mod) => mod.projectType === ProjectType.MOD,
  ).length;
  const archiveName = selectedVersion
    ? `${selectedVersion.version.name}.zip`
    : "";

  const chooseFolder = async () => {
    const folders = await api.other.openFileDialog(true);
    const picked = folders?.[0] || "";
    if (!picked) return;

    setPath(picked);
    setNameTaken(
      archiveName
        ? await api.fs.pathExists(await api.path.join(picked, archiveName))
        : false,
    );
  };

  const handleExport = async () => {
    if (!selectedVersion || !folderPath) return;
    const exportTempPath = await api.path.join(
      folderPath,
      `.grubie-export-${Date.now()}`,
    );

    try {
      setStage("copying");
      setCopied(null);

      const entries = await collectExportableEntries(versionPath);
      if (entries.length === 0) {
        throw new Error("export found nothing to copy");
      }

      setCopied([0, entries.length, ""]);

      if (!(await api.fs.ensure(exportTempPath))) {
        throw new Error("export failed to create the temporary folder");
      }

      await copyExportEntries(
        versionPath,
        exportTempPath,
        entries,
        (done, current) => setCopied([done, entries.length, current]),
      );

      await copyPortableLocalFiles(
        selectedVersion.version.loader.mods,
        exportTempPath,
      );
      await ensurePortableLogo(selectedVersion.version, exportTempPath);

      const exportVersion = sanitizeExportVersion(selectedVersion.version);
      if (
        !(await api.fs.writeJSON(
          await api.path.join(exportTempPath, "version.json"),
          exportVersion,
        ))
      ) {
        throw new Error("export failed to write version.json");
      }

      const exportDir = await api.fs.readdir(exportTempPath);
      const files: string[] = [];
      for (const file of exportDir) {
        files.push(await api.path.join(exportTempPath, file));
      }

      let zipPath = await api.path.join(
        folderPath,
        `${selectedVersion.version.name}.zip`,
      );

      if (await api.fs.pathExists(zipPath)) {
        const stamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, 19);
        zipPath = await api.path.join(
          folderPath,
          `${selectedVersion.version.name}_${stamp}.zip`,
        );
      }

      setStage("archiving");
      if (!(await api.file.archiveFiles(files, zipPath, exportTempPath))) {
        throw new Error("export archive failed");
      }

      onClose();
      toast.success(t("export.success"), {
        action: {
          label: t("common.openFolder"),
          onClick: () => void api.shell.openPath(folderPath),
        },
      });
    } catch (err) {
      showFailureToast(t("export.error"), err, {
        channels: ["file:archiveFiles", "fs:"],
      });
    } finally {
      await api.fs.rimraf(exportTempPath);

      setStage(null);
      setCopied(null);
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={!isLoading}
        className="gap-0 overflow-hidden p-0 sm:max-w-md"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3 pr-12">
          <FolderArchive className="size-4 shrink-0 text-faint" />
          <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
            {t("export.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 px-4 py-3">
          <p className="text-xs leading-4 text-muted-foreground">
            {t("export.contents")}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-[0.65rem] tracking-[0.09em] text-faint uppercase">
                <HardDrive className="size-3" />
                {t("versions.facts.diskUsage")}
              </span>
              <span className="font-mono text-sm tabular-nums">
                {isSizeUnknown
                  ? "?"
                  : size === null
                    ? "…"
                    : formatBytes(size, sizeLabels, 1)}
              </span>
            </div>

            <div className="grid gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-2">
              <span className="flex items-center gap-1.5 text-[0.65rem] tracking-[0.09em] text-faint uppercase">
                <Boxes className="size-3" />
                {t("modManager.projectTypes.mod")}
              </span>
              <span className="font-mono text-sm tabular-nums">
                {modsCount}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={isLoading}
            onClick={chooseFolder}
            className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 p-2 text-left transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-3 text-faint">
              {folderPath ? (
                <Package className="size-4" />
              ) : (
                <FolderSearch2 className="size-4" />
              )}
            </span>

            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm">
                {folderPath || t("export.selectFolder")}
              </span>
              {folderPath && archiveName && (
                <span className="truncate font-mono text-[0.7rem] text-faint">
                  {archiveName}
                </span>
              )}
              {folderPath && isNameTaken && (
                <span className="truncate text-[0.7rem] text-warning">
                  {t("export.nameTaken")}
                </span>
              )}
            </span>

            <span className="shrink-0 text-xs text-muted-foreground">
              {t("common.choose")}
            </span>
          </button>
        </div>

        <div className="grid gap-2 border-t border-border bg-surface-2 px-4 py-3">
          {stage && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {stage === "copying"
                ? copied
                  ? [
                      `${t("export.stageCopying")} — ${copied[0]}/${copied[1]}`,
                      copied[2],
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("export.stageCopying")
                : t("export.stageArchiving")}
            </p>
          )}
          <Button
            className="h-10 w-full"
            disabled={!folderPath || isLoading}
            onClick={() => void handleExport()}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FolderArchive />
            )}
            {t("export.btn")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
