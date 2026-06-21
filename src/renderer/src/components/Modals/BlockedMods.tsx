import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  FolderPlus,
  Folder,
  Lock,
  ShieldAlert,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  areBlockedModsReady,
  applyBlockedModFilePaths,
  areSameFolder,
  checkBlockedMods,
  dedupeFolders,
  loadWatchedFolders,
  saveWatchedFolders,
  type IBlockedMod,
} from "@renderer/utilities/blockedMods";

export { applyBlockedModFilePaths, areBlockedModsReady, checkBlockedMods };
export type { IBlockedMod };

const api = window.api;

interface IWatchedFolder {
  path: string;
  removable: boolean;
}

export function BlockedMods({
  onClose,
  mods,
}: {
  onClose: (mods: IBlockedMod[]) => void;
  mods: IBlockedMod[];
}) {
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>(mods);
  const [viewMode, setViewMode] = useState<"all" | "notInstalled">(
    "notInstalled",
  );
  const [downloadsPath, setDownloadsPath] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>(() =>
    loadWatchedFolders(),
  );
  const [isDragOver, setIsDragOver] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const blockedModsRef = useRef(blockedMods);
  const dragCounterRef = useRef(0);

  const { t } = useTranslation();

  const watchedFolders = useMemo<IWatchedFolder[]>(() => {
    const folders: IWatchedFolder[] = [];
    if (downloadsPath) folders.push({ path: downloadsPath, removable: false });
    for (const folder of extraFolders) {
      if (downloadsPath && areSameFolder(folder, downloadsPath)) continue;
      folders.push({ path: folder, removable: true });
    }
    return folders;
  }, [downloadsPath, extraFolders]);

  const watchedFoldersRef = useRef(watchedFolders);

  useEffect(() => {
    blockedModsRef.current = blockedMods;
  }, [blockedMods]);

  useEffect(() => {
    watchedFoldersRef.current = watchedFolders;
  }, [watchedFolders]);

  useEffect(() => {
    saveWatchedFolders(extraFolders);
  }, [extraFolders]);

  const scanFolders = useCallback(async () => {
    const folders = watchedFoldersRef.current;
    const currentMods = blockedModsRef.current;
    if (folders.length === 0 || currentMods.length === 0) return;

    const folderFiles = await Promise.all(
      folders.map(async ({ path }) => {
        try {
          return { path, files: new Set(await api.fs.readdir(path)) };
        } catch {
          return { path, files: new Set<string>() };
        }
      }),
    );

    const nextMods = await Promise.all(
      currentMods.map(async (mod) => {
        if (mod.filePath) {
          const stillExists = await api.fs.pathExists(mod.filePath);
          if (stillExists) return mod;
        }

        for (const { path, files } of folderFiles) {
          if (!files.has(mod.fileName)) continue;
          const filePath = await api.path.join(path, mod.fileName);

          try {
            const hash = await api.fs.sha1(filePath);
            if (!mod.hash || hash === mod.hash) {
              return mod.filePath === filePath ? mod : { ...mod, filePath };
            }
          } catch {}
        }

        return mod.filePath ? { ...mod, filePath: undefined } : mod;
      }),
    );

    const hasChanges = nextMods.some(
      (mod, index) => mod.filePath !== currentMods[index].filePath,
    );

    if (hasChanges && isMountedRef.current) {
      setBlockedMods(nextMods);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    api.other.getPath("downloads").then((path: string) => {
      if (!isMountedRef.current) return;
      setDownloadsPath(path);
    });

    intervalRef.current = setInterval(() => {
      void scanFolders();
    }, 1000);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [scanFolders]);

  useEffect(() => {
    void scanFolders();
  }, [watchedFolders, scanFolders]);

  useEffect(() => {
    const notInstalledMods = blockedMods.filter((mod) => !mod.filePath);
    if (notInstalledMods.length === 0) {
      onClose(blockedMods);
    }
  }, [blockedMods, onClose]);

  const filteredMods = useMemo(() => {
    return blockedMods.filter((mod) => {
      if (viewMode === "all") return true;
      return !mod.filePath;
    });
  }, [blockedMods, viewMode]);

  const installedCount = useMemo(() => {
    return blockedMods.filter((mod) => !!mod.filePath).length;
  }, [blockedMods]);

  const missingCount = blockedMods.length - installedCount;

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => (prev === "all" ? "notInstalled" : "all"));
  }, []);

  const handleOpenAll = useCallback(async () => {
    const modsToOpen = blockedMods.filter((mod) => !mod.filePath);
    for (const mod of modsToOpen) {
      try {
        await api.shell.openExternal(mod.url);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error("Error opening URL:", error);
      }
    }
  }, [blockedMods]);

  const handleAddFolder = useCallback(async () => {
    try {
      const picked = await api.other.openFileDialog(true, undefined, true);
      if (!picked || picked.length === 0) return;

      setExtraFolders((prev) => {
        const next = dedupeFolders([...prev, ...picked]).filter(
          (folder) => !(downloadsPath && areSameFolder(folder, downloadsPath)),
        );
        return next;
      });
    } catch (error) {
      console.error("Error selecting folder:", error);
    }
  }, [downloadsPath]);

  const handleRemoveFolder = useCallback((folder: string) => {
    setExtraFolders((prev) =>
      prev.filter((item) => !areSameFolder(item, folder)),
    );
  }, []);

  const assignDroppedFiles = useCallback(
    async (files: { name: string; path: string }[]) => {
      const currentMods = blockedModsRef.current;
      const updates = new Map<number, string>();

      for (const file of files) {
        let hash: string | undefined;
        try {
          hash = await api.fs.sha1(file.path);
        } catch {}

        let index = currentMods.findIndex(
          (mod, i) =>
            !updates.has(i) &&
            !mod.filePath &&
            !!mod.hash &&
            !!hash &&
            mod.hash === hash,
        );

        if (index === -1) {
          index = currentMods.findIndex(
            (mod, i) =>
              !updates.has(i) &&
              !mod.filePath &&
              mod.fileName === file.name &&
              (!mod.hash || !hash || mod.hash === hash),
          );
        }

        if (index !== -1) updates.set(index, file.path);
      }

      if (updates.size === 0) {
        toast.warning(t("blockedMods.dropNoMatch"));
        return;
      }

      setBlockedMods((prev) =>
        prev.map((mod, i) =>
          updates.has(i) ? { ...mod, filePath: updates.get(i)! } : mod,
        ),
      );

      if (updates.size < files.length) {
        toast.warning(t("blockedMods.dropPartial"));
      }
    },
    [t],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(event.dataTransfer.files)
        .map((file) => ({
          name: file.name,
          path: api.other.getPathForFile(file),
        }))
        .filter((file) => !!file.path);

      if (files.length === 0) return;
      void assignDroppedFiles(files);
    },
    [assignDroppedFiles],
  );

  const handleClose = useCallback(() => {
    onClose([]);
  }, [onClose]);

  return (
    <Dialog open>
      <DialogContent aria-describedby={undefined}
        className="grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        onClick={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onDragEnter={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          dragCounterRef.current += 1;
          setIsDragOver(true);
        }}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer.types).includes("Files")) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
          if (dragCounterRef.current === 0) setIsDragOver(false);
        }}
        onDrop={handleDrop}
      >
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>{t("blockedMods.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto px-5 pb-5">
          <Alert variant="info">
            <ShieldAlert />
            <AlertDescription>{t("blockedMods.description")}</AlertDescription>
          </Alert>

          <section className="grid gap-3 rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-sm font-medium leading-none">
                  {t("blockedMods.files")}
                </p>
                <Badge variant="outline" className="tabular-nums">
                  {installedCount}/{blockedMods.length}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={installedCount === 0}
                  onClick={handleToggleView}
                >
                  <Eye />
                  {viewMode === "all"
                    ? t("blockedMods.showMissing")
                    : t("blockedMods.showAll")}
                </Button>
              </div>
            </div>

            <ScrollArea className="max-h-[14rem] rounded-xl border bg-background/40">
              <div className="grid gap-2 p-2">
                {filteredMods.map((mod) => (
                  <Card
                    key={`${mod.projectId}-${mod.fileName}`}
                    className="gap-0 py-0 shadow-none"
                  >
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="grid min-w-0 flex-1 gap-1">
                        <div className="flex min-w-0 items-center gap-2">
                          {mod.filePath ? (
                            <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <TriangleAlert className="size-4 shrink-0 text-destructive" />
                          )}
                          <p
                            className="min-w-0 truncate text-sm font-medium"
                            title={mod.fileName}
                          >
                            {mod.fileName}
                          </p>
                          {mod.filePath ? (
                            <span
                              className="size-2.5 shrink-0 rounded-full bg-emerald-500"
                              aria-label={t("blockedMods.ready")}
                              title={t("blockedMods.ready")}
                            />
                          ) : (
                            <span
                              className="size-2.5 shrink-0 rounded-full bg-destructive"
                              aria-label={t("blockedMods.missing")}
                              title={t("blockedMods.missing")}
                            />
                          )}
                        </div>
                      </div>

                      {!mod.filePath && (
                        <Button
                          size="icon-sm"
                          variant="secondary"
                          className="shrink-0"
                          aria-label={t("game.download")}
                          title={t("game.download")}
                          onClick={async () => {
                            try {
                              await api.shell.openExternal(mod.url);
                            } catch (error) {
                              console.error("Error opening URL:", error);
                            }
                          }}
                        >
                          <ExternalLink />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {filteredMods.length === 0 && (
                  <div className="flex h-24 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                    {t("blockedMods.empty")}
                  </div>
                )}
              </div>
            </ScrollArea>
          </section>

          <section className="grid gap-3 rounded-xl border bg-card p-3 text-card-foreground">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p className="text-sm font-medium leading-none">
                  {t("blockedMods.watchedFolders")}
                </p>
                <Badge variant="outline" className="tabular-nums">
                  {watchedFolders.length}
                </Badge>
              </div>

              <Button variant="outline" size="sm" onClick={handleAddFolder}>
                <FolderPlus />
                {t("blockedMods.addFolder")}
              </Button>
            </div>

            <div className="grid gap-1.5">
              {watchedFolders.map((folder) => (
                <div
                  key={folder.path}
                  className="flex items-center gap-2 rounded-lg border bg-background/40 py-1.5 pr-1.5 pl-2.5"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={folder.path}
                  >
                    {folder.path}
                  </span>
                  {folder.removable ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-6 shrink-0"
                      aria-label={t("blockedMods.removeFolder")}
                      title={t("blockedMods.removeFolder")}
                      onClick={() => handleRemoveFolder(folder.path)}
                    >
                      <X />
                    </Button>
                  ) : (
                    <span
                      className="flex size-6 shrink-0 items-center justify-center"
                      aria-label={t("blockedMods.defaultFolder")}
                      title={t("blockedMods.defaultFolder")}
                    >
                      <Lock className="size-4 text-muted-foreground" />
                    </span>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {t("blockedMods.dropHint")}
            </p>
          </section>
        </div>

        <DialogFooter className="m-0 border-t bg-muted/25 px-5 py-4">
          <Button
            variant="outline"
            onClick={handleOpenAll}
            disabled={missingCount === 0}
          >
            <ExternalLink />
            {t("blockedMods.openAll")}
          </Button>
          <Button variant="destructive" onClick={handleClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>

        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-background/85 text-primary backdrop-blur-sm">
            <Upload className="size-8" />
            <p className="text-sm font-medium">
              {t("blockedMods.dropOverlay")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
