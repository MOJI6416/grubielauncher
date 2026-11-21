import { FolderArchive, FolderSearch2, Loader2, Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { selectedVersionAtom } from "@renderer/stores/atoms";
import type { IVersionConf } from "@/types/IVersion";
import { ProjectType, type ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import {
  hasNestedInstanceExclusions,
  isExcludedInstancePath,
} from "@/shared/instancePrivacy";
import {
  WORLDS_FOLDER,
  isExportEntryShown,
  isTechnicalExportEntry,
  keepSelectedProjects,
  mrpackDependencies,
  mrpackLinks,
  type ExportFormat,
} from "@/shared/instanceExport";
import {
  getLocalPathFromFileUrl,
  sanitizeExportVersion,
} from "@renderer/utilities/exportVersion";
import {
  initialSelection,
  isWorldKey,
  loadExportPrefs,
  saveExportPrefs,
  selectedTopFolders,
  sortExportNames,
  worldKey,
} from "@renderer/utilities/exportSelection";
import { formatBytes } from "@renderer/utilities/file";
import { useRedact } from "@renderer/features/streamer/streamerMode";
import { Hint } from "@renderer/components/Hint";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { formatNumber } from "@renderer/utilities/numbers";
import { countFeature } from "@renderer/features/usage/usage";
import { cn } from "@/lib/utils";

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

async function freeArchivePath(folder: string, name: string, extension: string) {
  const path = await api.path.join(folder, `${name}.${extension}`);
  if (!(await api.fs.pathExists(path))) return path;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return api.path.join(folder, `${name}_${stamp}.${extension}`);
}

interface ExportItem {
  key: string;
  name: string;
  size: number | null;
}

async function sizeOf(path: string): Promise<number | null> {
  return (await api.file.getTotalSizes([path]).catch(ignoreFailure)) ?? null;
}

async function loadExportItems(
  versionPath: string,
): Promise<{ items: ExportItem[]; worlds: ExportItem[] }> {
  const names = sortExportNames(
    (await api.fs.readdir(versionPath)).filter(
      (name) => !isExcludedInstancePath(name) && !isTechnicalExportEntry(name),
    ),
  );

  const worldNames = names.includes(WORLDS_FOLDER)
    ? (await api.fs.readdir(await api.path.join(versionPath, WORLDS_FOLDER))).sort(
        (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
      )
    : [];

  const items = await Promise.all(
    names
      .filter((name) => name !== WORLDS_FOLDER || worldNames.length > 0)
      .map(async (name) => ({
        key: name,
        name,
        size: await sizeOf(await api.path.join(versionPath, name)),
      })),
  );
  const worlds = await Promise.all(
    worldNames.map(async (name) => ({
      key: worldKey(name),
      name,
      size: await sizeOf(await api.path.join(versionPath, WORLDS_FOLDER, name)),
    })),
  );

  return { items, worlds };
}

const ITEM_LABELS: Record<string, string> = {
  mods: "modManager.projectTypes.mod",
  resourcepacks: "modManager.projectTypes.resourcepack",
  shaderpacks: "modManager.projectTypes.shader",
  [WORLDS_FOLDER]: "modManager.projectTypes.world",
  config: "export.items.config",
  defaultconfigs: "export.items.defaultconfigs",
  kubejs: "export.items.kubejs",
  schematics: "export.items.schematics",
  "options.txt": "export.items.options",
  server: "export.items.server",
};

function ExportRow({
  label,
  name,
  size,
  checked,
  disabled,
  nested,
  sizeLabels,
  onToggle,
}: {
  label: string | null;
  name: string;
  size: number | null;
  checked: boolean | "indeterminate";
  disabled: boolean;
  nested?: boolean;
  sizeLabels: string[];
  onToggle: (next: boolean) => void;
}) {
  const title = label ?? name;

  return (
    <div
      className={cn(
        "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2",
        nested && "pl-8",
        !disabled && "cursor-pointer hover:bg-row-hover",
      )}
      onClick={disabled ? undefined : () => onToggle(checked !== true)}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        onCheckedChange={(value) => onToggle(value === true)}
      />
      <Hint content={label ? `${label} · ${name}` : name} variant="text" truncatedOnly>
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 truncate text-sm">
          <span className={cn("truncate", !label && !nested && "font-mono text-xs")}>
            {title}
          </span>
          {label && (
            <span className="truncate font-mono text-2xs text-faint">{name}</span>
          )}
        </span>
      </Hint>
      <span className="shrink-0 font-mono text-2xs whitespace-nowrap text-faint tabular-nums">
        {size === null ? "" : formatBytes(size, sizeLabels, 1)}
      </span>
    </div>
  );
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
  const [items, setItems] = useState<ExportItem[] | null>(null);
  const [worlds, setWorlds] = useState<ExportItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<ExportFormat>("grubie");
  const { t } = useTranslation();
  const redact = useRedact();

  const isLoading = stage !== null;
  const conf = selectedVersion?.version;
  const mrpackSupported = conf ? mrpackDependencies(conf) !== null : false;

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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await loadExportItems(versionPath).catch(ignoreFailure);
      if (cancelled) return;

      const next = loaded ?? { items: [], worlds: [] };
      const prefs = loadExportPrefs(versionPath);
      const keys = [
        ...next.items.filter((item) => item.key !== WORLDS_FOLDER).map((item) => item.key),
        ...next.worlds.map((world) => world.key),
      ];

      setItems(next.items);
      setWorlds(next.worlds);
      setSelected(initialSelection(keys, prefs));
      if (prefs?.format === "mrpack" && mrpackSupported) setFormat("mrpack");
    })();

    return () => {
      cancelled = true;
    };
  }, [versionPath, mrpackSupported]);

  const visibleItems = useMemo(
    () => (items ?? []).filter((item) => isExportEntryShown(item.key, format)),
    [items, format],
  );

  const chosen = useMemo(
    () =>
      [...selected].filter((key) =>
        isWorldKey(key) ? true : visibleItems.some((item) => item.key === key),
      ),
    [selected, visibleItems],
  );
  const chosenFolders = useMemo(() => selectedTopFolders(new Set(chosen)), [chosen]);

  const links = useMemo(
    () =>
      format === "mrpack"
        ? (conf?.loader.mods ?? [])
            .flatMap(mrpackLinks)
            .filter((link) => chosenFolders.has(link.path.split("/")[0]))
        : [],
    [conf, format, chosenFolders],
  );

  const chosenSize = useMemo(() => {
    const sizes = [
      ...visibleItems.filter((item) => item.key !== WORLDS_FOLDER && selected.has(item.key)),
      ...worlds.filter((world) => selected.has(world.key)),
    ].map((item) => item.size ?? 0);
    const linked = links.reduce((sum, link) => sum + link.size, 0);
    return Math.max(0, sizes.reduce((sum, size) => sum + size, 0) - linked);
  }, [visibleItems, worlds, selected, links]);

  const extension = format === "mrpack" ? "mrpack" : "zip";
  const archiveName = conf ? `${conf.name}.${extension}` : "";

  useEffect(() => {
    if (!folderPath || !archiveName) {
      setNameTaken(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const taken = await api.fs
        .pathExists(await api.path.join(folderPath, archiveName))
        .catch(ignoreFailure);
      if (!cancelled) setNameTaken(Boolean(taken));
    })();

    return () => {
      cancelled = true;
    };
  }, [folderPath, archiveName]);

  const toggle = (keys: string[], next: boolean) => {
    setSelected((current) => {
      const updated = new Set(current);
      for (const key of keys) {
        if (next) updated.add(key);
        else updated.delete(key);
      }
      return updated;
    });
  };

  const chooseFolder = async () => {
    const folders = await api.other.openFileDialog(true);
    const picked = folders?.[0] || "";
    if (picked) setPath(picked);
  };

  const openFolderAction = {
    label: t("common.openFolder"),
    onClick: () => void api.shell.openPath(folderPath),
  };

  const exportGrubie = async (version: IVersionConf) => {
    const exportTempPath = await api.path.join(
      folderPath,
      `.grubie-export-${Date.now()}`,
    );

    try {
      setStage("copying");
      setCopied(null);

      const entries = (await collectExportableEntries(versionPath)).filter((entry) => {
        const top = entry.split("/")[0];
        if (isTechnicalExportEntry(top)) return true;
        if (top === WORLDS_FOLDER) return false;
        return chosenFolders.has(top);
      });
      entries.push(...chosen.filter(isWorldKey));

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

      const mods = keepSelectedProjects(version.loader.mods, chosenFolders);
      await copyPortableLocalFiles(mods, exportTempPath);
      await ensurePortableLogo(version, exportTempPath);

      const exportVersion = sanitizeExportVersion({
        ...version,
        loader: { ...version.loader, mods },
      });
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

      const zipPath = await freeArchivePath(folderPath, version.name, "zip");

      setStage("archiving");
      if (!(await api.file.archiveFiles(files, zipPath, exportTempPath))) {
        throw new Error("export archive failed");
      }

      onClose();
      countFeature("modpack.export");
      toast.success(t("export.success"), { action: openFolderAction });
    } catch (err) {
      showFailureToast(t("export.error"), err, {
        channels: ["file:archiveFiles", "fs:"],
      });
    } finally {
      await api.fs.rimraf(exportTempPath);
    }
  };

  const exportMrpack = async (version: IVersionConf) => {
    try {
      setStage("archiving");
      const zipPath = await freeArchivePath(folderPath, version.name, "mrpack");
      const result = await api.modpack.exportMrpack(versionPath, chosen, zipPath);
      if (!result) throw new Error("mrpack export failed");

      onClose();
      countFeature("modpack.exportMrpack");
      toast.success(
        t("export.successMrpack", {
          linked: formatNumber(result.linked),
          packed: formatNumber(result.packed),
        }),
        { action: openFolderAction },
      );
    } catch (err) {
      showFailureToast(t("export.error"), err, {
        channels: ["modpack:exportMrpack"],
      });
    }
  };

  const handleExport = async () => {
    if (!conf || !folderPath || !items) return;

    saveExportPrefs(versionPath, {
      format,
      selected: [...selected],
      known: [
        ...items.filter((item) => item.key !== WORLDS_FOLDER).map((item) => item.key),
        ...worlds.map((world) => world.key),
      ],
    });

    try {
      if (format === "mrpack") await exportMrpack(conf);
      else await exportGrubie(conf);
    } finally {
      setStage(null);
      setCopied(null);
    }
  };

  const worldsChecked = (() => {
    const count = worlds.filter((world) => selected.has(world.key)).length;
    if (count === 0) return false;
    return count === worlds.length ? true : ("indeterminate" as const);
  })();

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
          <Hint content={t("export.title")} variant="text" truncatedOnly>
            <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
              {t("export.title")}
            </DialogTitle>
          </Hint>
        </DialogHeader>

        <div className="grid gap-3 px-4 py-3">
          <SegmentedControl<ExportFormat>
            value={format}
            onChange={setFormat}
            ariaLabel={t("export.formatLabel")}
            stretch
            options={[
              { value: "grubie", label: t("export.formats.grubie"), disabled: isLoading },
              {
                value: "mrpack",
                label: t("export.formats.mrpack"),
                disabled: isLoading || !mrpackSupported,
                hint: mrpackSupported
                  ? undefined
                  : t("export.mrpackUnsupported", { loader: conf?.loader.name ?? "" }),
              },
            ]}
          />

          <p className="text-xs leading-4 text-muted-foreground">
            {format === "mrpack" ? t("export.mrpackNote") : t("export.contents")}
          </p>

          <div className="grid gap-1.5">
            <div className="flex max-h-64 min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-surface-2 p-1">
              {items === null ? (
                <ListSkeleton rows={5} rowClassName="h-8" iconClassName="size-4 rounded-[4px]" />
              ) : visibleItems.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted-foreground">
                  {t("export.nothingToPick")}
                </p>
              ) : (
                visibleItems.map((item) => {
                  const label = ITEM_LABELS[item.key.toLowerCase()];
                  if (item.key !== WORLDS_FOLDER) {
                    return (
                      <ExportRow
                        key={item.key}
                        label={label ? t(label) : null}
                        name={item.name}
                        size={item.size}
                        checked={selected.has(item.key)}
                        disabled={isLoading}
                        sizeLabels={sizeLabels}
                        onToggle={(next) => toggle([item.key], next)}
                      />
                    );
                  }

                  return (
                    <div key={item.key} className="flex flex-col">
                      <ExportRow
                        label={label ? t(label) : null}
                        name={item.name}
                        size={item.size}
                        checked={worldsChecked}
                        disabled={isLoading}
                        sizeLabels={sizeLabels}
                        onToggle={(next) =>
                          toggle(
                            worlds.map((world) => world.key),
                            next,
                          )
                        }
                      />
                      {worlds.map((world) => (
                        <ExportRow
                          key={world.key}
                          label={null}
                          name={world.name}
                          size={world.size}
                          checked={selected.has(world.key)}
                          disabled={isLoading}
                          nested
                          sizeLabels={sizeLabels}
                          onToggle={(next) => toggle([world.key], next)}
                        />
                      ))}
                    </div>
                  );
                })
              )}
            </div>

            {items !== null && (
              <p className="px-1 text-2xs text-faint tabular-nums">
                {[
                  t("export.selectedSize", { size: formatBytes(chosenSize, sizeLabels, 1) }),
                  format === "mrpack"
                    ? t("export.mrpackLinks", { total: formatNumber(links.length) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
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

            <Hint
              variant="text"
              truncatedOnly
              content={
                <span className="flex flex-col gap-0.5">
                  <span>
                    {redact.path(folderPath) || t("export.selectFolder")}
                  </span>
                  {folderPath && archiveName && (
                    <span className="font-mono">{archiveName}</span>
                  )}
                  {folderPath && isNameTaken && (
                    <span>{t("export.nameTaken")}</span>
                  )}
                </span>
              }
            >
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm">
                  {redact.path(folderPath) || t("export.selectFolder")}
                </span>
                {folderPath && archiveName && (
                  <span className="truncate font-mono text-2xs text-faint">
                    {archiveName}
                  </span>
                )}
                {folderPath && isNameTaken && (
                  <span className="truncate text-2xs text-warning">
                    {t("export.nameTaken")}
                  </span>
                )}
              </span>
            </Hint>

            <span className="shrink-0 text-xs text-muted-foreground">
              {t("common.choose")}
            </span>
          </button>
        </div>

        <DialogFooter className="m-0 gap-2 rounded-b-none px-4 py-3 sm:flex-col sm:items-stretch sm:justify-start">
          {!stage && !folderPath && (
            <p className="text-xs text-muted-foreground">
              {t("export.selectFolder")}
            </p>
          )}
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
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={isLoading} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="secondary"
              disabled={!folderPath || isLoading || items === null}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
