import {
  Dialog,
  DialogContent,
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
  Loader2,
  Lock,
  Replace,
  Search,
  ShieldAlert,
  SkipForward,
  TriangleAlert,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Hint } from "@renderer/components/Hint";
import { cn } from "@/lib/utils";
import { IProject, Provider, ProjectType } from "@/types/ModManager";
import { Loader } from "@/types/Loader";
import { showFailureToast } from "@renderer/utilities/failures";
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

type ModState = "ready" | "substituted" | "skipped" | "missing";

function modKey(mod: IBlockedMod) {
  return `${mod.projectId}-${mod.fileName}`;
}

function isHandledMod(mod: IBlockedMod) {
  return !!mod.filePath || !!mod.skipped || !!mod.substituted;
}

function modState(mod: IBlockedMod): ModState {
  if (mod.filePath) return "ready";
  if (mod.substituted) return "substituted";
  if (mod.skipped) return "skipped";
  return "missing";
}

interface IWatchedFolder {
  path: string;
  removable: boolean;
}

export function BlockedMods({
  onClose,
  mods,
  mcVersion,
  loader,
  onSubstitute,
}: {
  onClose: (mods: IBlockedMod[] | null) => void;
  mods: IBlockedMod[];
  mcVersion?: string;
  loader?: Loader;
  onSubstitute?: (
    blockedMod: IBlockedMod,
    project: IProject,
  ) => Promise<boolean>;
}) {
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>(mods);
  const [viewMode, setViewMode] = useState<"all" | "notInstalled">(
    "notInstalled",
  );
  const [substituteFor, setSubstituteFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IProject[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOutcome, setSearchOutcome] = useState<
    "idle" | "empty" | "failed"
  >("idle");
  const [substituting, setSubstituting] = useState<{
    key: string;
    projectId: string;
  } | null>(null);
  const [downloadsPath, setDownloadsPath] = useState<string | null>(null);
  const [extraFolders, setExtraFolders] = useState<string[]>(() =>
    loadWatchedFolders(),
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [isFoldersOpen, setIsFoldersOpen] = useState(false);

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
    if (blockedMods.some((mod) => modState(mod) === "skipped")) return;
    if (areBlockedModsReady(blockedMods)) {
      onClose(blockedMods);
    }
  }, [blockedMods, onClose]);

  const filteredMods = useMemo(() => {
    return blockedMods.filter((mod) => {
      if (viewMode === "all") return true;
      return !isHandledMod(mod);
    });
  }, [blockedMods, viewMode]);

  const handledCount = useMemo(
    () => blockedMods.filter((mod) => isHandledMod(mod)).length,
    [blockedMods],
  );

  const skippedCount = useMemo(
    () => blockedMods.filter((mod) => modState(mod) === "skipped").length,
    [blockedMods],
  );

  const missingCount = blockedMods.length - handledCount;

  const handleSkip = useCallback((mod: IBlockedMod) => {
    setBlockedMods((prev) =>
      prev.map((m) =>
        modKey(m) === modKey(mod) ? { ...m, skipped: true } : m,
      ),
    );
  }, []);

  const handleUndoSkip = useCallback((mod: IBlockedMod) => {
    setBlockedMods((prev) =>
      prev.map((m) =>
        modKey(m) === modKey(mod) ? { ...m, skipped: false } : m,
      ),
    );
  }, []);

  const handleSkipAllMissing = useCallback(() => {
    setBlockedMods((prev) =>
      prev.map((m) => (isHandledMod(m) ? m : { ...m, skipped: true })),
    );
  }, []);

  const handleOpenSubstitute = useCallback((mod: IBlockedMod) => {
    const key = modKey(mod);
    setSearchResults([]);
    setSearchOutcome("idle");
    setSearchQuery(mod.modTitle || mod.fileName.replace(/\.jar$/i, ""));
    setSubstituteFor((prev) => (prev === key ? null : key));
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSearchOutcome("idle");
  }, []);

  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) return;

    setIsSearching(true);
    try {
      const data = await api.modManager.search(
        query,
        Provider.MODRINTH,
        {
          version: mcVersion,
          loader,
          projectType: ProjectType.MOD,
          sort: "",
          filter: [],
        },
        { offset: 0, limit: 10 },
      );
      const projects = data?.projects ?? [];
      setSearchResults(data?.error ? [] : projects);
      setSearchOutcome(
        !data || data.error
          ? "failed"
          : projects.length === 0
            ? "empty"
            : "idle",
      );
    } catch {
      setSearchResults([]);
      setSearchOutcome("failed");
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery, mcVersion, loader]);

  const handlePickSubstitute = useCallback(
    async (mod: IBlockedMod, project: IProject) => {
      if (!onSubstitute) return;

      const key = modKey(mod);
      setSubstituting({ key, projectId: project.id });
      try {
        const ok = await onSubstitute(mod, project);
        if (!ok) {
          showFailureToast(t("blockedMods.substituteFailed"), undefined, {
            channels: ["modManager:", "service:", "file:download"],
            fallbackDescription: t("blockedMods.substituteFailedHint"),
          });
          return;
        }

        setBlockedMods((prev) =>
          prev.map((m) =>
            modKey(m) === key ? { ...m, substituted: true, skipped: false } : m,
          ),
        );
        setSubstituteFor(null);
        toast.success(
          t("blockedMods.substituteSuccess", { title: project.title }),
        );
      } catch (error) {
        showFailureToast(t("blockedMods.substituteFailed"), error, {
          fallbackDescription: t("blockedMods.substituteFailedHint"),
        });
      } finally {
        setSubstituting(null);
      }
    },
    [onSubstitute, t],
  );

  const handleOpenAll = useCallback(async () => {
    const modsToOpen = blockedMods.filter((mod) => !isHandledMod(mod));
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

  const stateLabel = (state: ModState) => {
    if (state === "ready") return t("blockedMods.ready");
    if (state === "substituted") return t("blockedMods.substitutedLabel");
    if (state === "skipped") return t("blockedMods.skippedLabel");
    return t("blockedMods.missing");
  };

  return (
    <Dialog open>
      <DialogContent
        aria-describedby={undefined}
        className="grid max-h-[min(38rem,calc(100vh-3rem))] grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-lg"
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
        <DialogHeader className="flex-row items-center gap-2 border-b border-border px-4 py-3">
          <ShieldAlert className="size-4 shrink-0 text-warning" />
          <DialogTitle className="min-w-0 flex-1 truncate pr-0 text-sm">
            {t("blockedMods.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2.5 border-b border-border bg-surface-2 px-4 py-3">
          <p className="text-xs leading-4 text-muted-foreground">
            {t("blockedMods.description")}
          </p>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {t("blockedMods.progress")}
              </span>
              <span className="font-mono tabular-nums text-faint">
                {handledCount - skippedCount}/{blockedMods.length}
              </span>
            </div>
            <Progress
              value={
                blockedMods.length === 0
                  ? 0
                  : ((handledCount - skippedCount) / blockedMods.length) * 100
              }
            />
          </div>
        </div>

        <ScrollArea className="min-h-0">
          <div className="grid gap-2 px-4 py-3">
            <div className="flex h-6 items-center gap-2">
              <span className="text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                {t("blockedMods.files")}
              </span>
              <Button
                size="xs"
                variant="ghost"
                className="ml-auto"
                disabled={handledCount === 0}
                onClick={() =>
                  setViewMode((prev) =>
                    prev === "all" ? "notInstalled" : "all",
                  )
                }
              >
                <Eye />
                {viewMode === "all"
                  ? t("blockedMods.showMissing")
                  : t("blockedMods.showAll")}
              </Button>
            </div>

            <div className="grid gap-1">
              {filteredMods.map((mod) => {
                const key = modKey(mod);
                const isSubstitutePanelOpen = substituteFor === key;
                const state = modState(mod);

                return (
                  <div
                    key={key}
                    className="grid gap-2 rounded-lg border border-border bg-surface-2 p-2"
                  >
                    <div className="flex items-center gap-2.5">
                      {state === "missing" ? (
                        <TriangleAlert className="size-4 shrink-0 text-warning" />
                      ) : state === "skipped" ? (
                        <SkipForward className="size-4 shrink-0 text-faint" />
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-success" />
                      )}

                      <div className="grid min-w-0 flex-1">
                        <Hint content={mod.fileName} variant="text">
                          <span className="min-w-0 truncate text-sm">
                            {mod.modTitle || mod.fileName}
                          </span>
                        </Hint>
                        <span
                          className={cn(
                            "min-w-0 truncate text-[0.7rem]",
                            state === "missing"
                              ? "text-faint"
                              : state === "skipped"
                                ? "text-warning"
                                : "text-success",
                          )}
                        >
                          {state === "missing"
                            ? mod.fileName
                            : stateLabel(state)}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {state === "missing" && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="secondary"
                                  aria-label={t("game.download")}
                                  onClick={async () => {
                                    try {
                                      await api.shell.openExternal(mod.url);
                                    } catch (error) {
                                      console.error(
                                        "Error opening URL:",
                                        error,
                                      );
                                    }
                                  }}
                                >
                                  <ExternalLink />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("game.download")}
                              </TooltipContent>
                            </Tooltip>

                            {onSubstitute && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon-sm"
                                    variant="ghost"
                                    aria-expanded={isSubstitutePanelOpen}
                                    aria-label={t("blockedMods.substitute")}
                                    onClick={() => handleOpenSubstitute(mod)}
                                  >
                                    <Replace />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("blockedMods.substitute")}
                                </TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("blockedMods.skip")}
                                  onClick={() => handleSkip(mod)}
                                >
                                  <SkipForward />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("blockedMods.skip")}
                              </TooltipContent>
                            </Tooltip>
                          </>
                        )}

                        {state === "skipped" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("blockedMods.undoSkip")}
                                onClick={() => handleUndoSkip(mod)}
                              >
                                <Undo2 />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("blockedMods.undoSkip")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>

                    {isSubstitutePanelOpen && onSubstitute && (
                      <div className="grid gap-2 rounded-md border border-border bg-background/40 p-2">
                        <div className="flex items-center gap-2">
                          <Input
                            value={searchQuery}
                            onChange={(event) =>
                              handleQueryChange(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleSearch();
                              }
                            }}
                            placeholder={t("blockedMods.searchPlaceholder")}
                            className="h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="shrink-0"
                            onClick={() => void handleSearch()}
                            disabled={isSearching}
                          >
                            {isSearching ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Search />
                            )}
                            {t("blockedMods.search")}
                          </Button>
                        </div>

                        {searchResults.length > 0 ? (
                          <div className="grid max-h-36 gap-0.5 overflow-y-auto">
                            {searchResults.map((project) => (
                              <button
                                key={project.id}
                                type="button"
                                className="flex h-8 items-center gap-2 rounded-md px-1.5 text-left transition-colors hover:bg-surface-3 disabled:opacity-60"
                                disabled={substituting?.key === key}
                                onClick={() =>
                                  void handlePickSubstitute(mod, project)
                                }
                              >
                                {project.iconUrl ? (
                                  <img
                                    src={project.iconUrl}
                                    alt=""
                                    className="size-5 shrink-0 rounded"
                                  />
                                ) : (
                                  <span className="size-5 shrink-0 rounded bg-surface-3" />
                                )}
                                <span className="min-w-0 flex-1 truncate text-xs">
                                  {project.title}
                                </span>
                                {substituting?.key === key &&
                                  substituting.projectId === project.id && (
                                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                                  )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          !isSearching && (
                            <p
                              className={cn(
                                "px-1 text-[0.7rem] leading-4",
                                searchOutcome === "failed"
                                  ? "text-destructive"
                                  : searchOutcome === "empty"
                                    ? "text-warning"
                                    : "text-faint",
                              )}
                            >
                              {t(
                                searchOutcome === "failed"
                                  ? "blockedMods.searchError"
                                  : searchOutcome === "empty"
                                    ? "blockedMods.searchEmpty"
                                    : "blockedMods.substituteHint",
                              )}
                            </p>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredMods.length === 0 &&
                (skippedCount > 0 ? (
                  <div className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    <SkipForward className="size-4 shrink-0 text-warning" />
                    {t("blockedMods.emptySkipped", { count: skippedCount })}
                  </div>
                ) : (
                  <div className="flex h-20 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success" />
                    {t("blockedMods.empty")}
                  </div>
                ))}
            </div>

            <div className="grid gap-1.5 rounded-lg border border-border bg-surface-2 p-2">
              <div className="flex h-6 items-center gap-2">
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-2 text-left"
                  aria-expanded={isFoldersOpen}
                  onClick={() => setIsFoldersOpen((prev) => !prev)}
                >
                  <Folder className="size-3.5 shrink-0 text-faint" />
                  <span className="text-xs">
                    {t("blockedMods.watchedFolders")}
                  </span>
                  <span className="font-mono text-[0.7rem] tabular-nums text-faint">
                    {watchedFolders.length}
                  </span>
                </button>

                <Button
                  size="xs"
                  variant="ghost"
                  className="ml-auto"
                  onClick={handleAddFolder}
                >
                  <FolderPlus />
                  {t("blockedMods.addFolder")}
                </Button>
              </div>

              {isFoldersOpen &&
                watchedFolders.map((folder) => (
                  <div
                    key={folder.path}
                    className="flex h-7 items-center gap-2 rounded-md bg-background/40 px-2"
                  >
                    <Hint content={folder.path} variant="text" truncatedOnly>
                      <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] text-muted-foreground">
                        {folder.path}
                      </span>
                    </Hint>
                    {folder.removable ? (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        className="shrink-0"
                        aria-label={t("blockedMods.removeFolder")}
                        onClick={() => handleRemoveFolder(folder.path)}
                      >
                        <X />
                      </Button>
                    ) : (
                      <Lock
                        className="size-3 shrink-0 text-faint"
                        aria-label={t("blockedMods.defaultFolder")}
                      />
                    )}
                  </div>
                ))}

              <p className="text-[0.7rem] leading-4 text-faint">
                {t("blockedMods.dropHint")}
              </p>
            </div>
          </div>
        </ScrollArea>

        <div className="grid gap-2 border-t border-border bg-surface-2 px-4 py-3">
          {skippedCount > 0 && (
            <p className="flex items-start gap-2 text-xs leading-4 text-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              {t("blockedMods.skipWarning")}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onClose(null)}
            >
              {t("blockedMods.cancelInstall")}
            </Button>

            <Button
              variant="ghost"
              className="ml-auto"
              onClick={handleSkipAllMissing}
              disabled={missingCount === 0}
            >
              <SkipForward />
              {t("blockedMods.skipAll")}
            </Button>

            {missingCount === 0 ? (
              <Button onClick={() => onClose(blockedMods)}>
                {t("blockedMods.continueWithSkipped")}
              </Button>
            ) : (
              <Button onClick={handleOpenAll}>
                <ExternalLink />
                {t("blockedMods.openAll")}
              </Button>
            )}
          </div>
        </div>

        {isDragOver && (
          <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/85 text-primary backdrop-blur-sm">
            <Upload className="size-7" />
            <p className="text-sm font-medium">
              {t("blockedMods.dropOverlay")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
