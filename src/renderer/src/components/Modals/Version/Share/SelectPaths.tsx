import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, ChevronRight, File, Folder, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader } from "@/types/Loader";
import { cn } from "@/lib/utils";
import {
  createForbiddenPathSet,
  filterSelectableSharePaths,
  getShareRelativePath,
  isForbiddenSharePath,
  selectShareFolderPath,
  selectSharePaths,
  toggleSelectedSharePath,
  unselectShareFolderPath,
} from "@renderer/utilities/selectPaths";

const api = window.api;

interface DirectoryEntry {
  path: string;
  type: "file" | "folder";
}

export const SelectPaths = ({
  onClose,
  pathFolder,
  passPaths,
  selectedPaths,
  loader,
  version,
}: {
  version: string;
  loader: Loader;
  onClose: () => void;
  pathFolder: string;
  passPaths: (paths: string[]) => void;
  selectedPaths: string[];
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [paths, setPaths] = useState<string[]>(selectedPaths);
  const [allEntries, setAllEntries] = useState<DirectoryEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");

  const { t } = useTranslation();

  const forbiddenSet = useMemo(() => {
    return createForbiddenPathSet(version, loader);
  }, [version, loader]);

  const isForbiddenPath = useCallback(
    (pathName: string) => isForbiddenSharePath(pathName, forbiddenSet),
    [forbiddenSet],
  );

  const visibleEntries = useMemo(() => {
    const entries = allEntries.filter((e) => e.path && !e.path.startsWith("."));
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    return entries;
  }, [allEntries]);

  const currentSegments = useMemo(
    () => currentPath.split("/").filter(Boolean),
    [currentPath],
  );

  const getRelativePath = useCallback(
    (entryPath: string) => getShareRelativePath(currentPath, entryPath),
    [currentPath],
  );

  const selectableVisiblePaths = useMemo(
    () =>
      visibleEntries
        .map((entry) => getRelativePath(entry.path))
        .filter((pathName) => !isForbiddenPath(pathName)),
    [visibleEntries, getRelativePath, isForbiddenPath],
  );

  useEffect(() => {
    setCurrentPath("");
    setPaths(filterSelectableSharePaths(selectedPaths, forbiddenSet));
  }, [pathFolder, selectedPaths, forbiddenSet]);

  useEffect(() => {
    let cancelled = false;

    const loadEntries = async () => {
      if (!pathFolder) {
        setAllEntries([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const folderPath =
          currentSegments.length > 0
            ? await api.path.join(pathFolder, ...currentSegments)
            : pathFolder;
        const entries: DirectoryEntry[] =
          await api.fs.readdirWithTypes(folderPath);
        if (cancelled) return;

        setAllEntries(entries);
      } catch {
        if (cancelled) return;
        setAllEntries([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, [pathFolder, currentSegments]);

  const togglePath = useCallback(
    (pathName: string) => {
      setPaths((prev) => toggleSelectedSharePath(prev, pathName, forbiddenSet));
    },
    [forbiddenSet],
  );

  const openFolder = useCallback(
    (folderName: string) => {
      const relativePath = getRelativePath(folderName);
      if (isForbiddenPath(relativePath)) return;

      setCurrentPath(relativePath);
    },
    [getRelativePath, isForbiddenPath],
  );

  const goBack = useCallback(() => {
    setCurrentPath((prev) => prev.split("/").slice(0, -1).join("/"));
  }, []);

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent aria-describedby={undefined}
        className="overflow-hidden p-0 sm:max-w-lg"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{t("selectPaths.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 px-6 pb-3">
          <div className="flex min-h-9 items-center gap-2 rounded-lg border bg-muted/20 px-2 text-xs text-muted-foreground">
            {currentPath && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-7"
                onClick={goBack}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <span className="truncate">{currentPath || "/"}</span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-background/80"
              disabled={isLoading || selectableVisiblePaths.length === 0}
              onClick={() => {
                setPaths((prev) =>
                  selectSharePaths(prev, selectableVisiblePaths, forbiddenSet),
                );
              }}
            >
              {t("selectPaths.selectAll")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-background/80"
              disabled={isLoading || paths.length === 0}
              onClick={() => setPaths([])}
            >
              {t("selectPaths.clearAll")}
            </Button>
          </div>

          <div className="h-80 overflow-auto rounded-lg border bg-card p-1">
            {isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                <p>{t("selectPaths.loadingFolders")}</p>
              </div>
            ) : visibleEntries.length === 0 ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
                {t("selectPaths.emptyFolder")}
              </p>
            ) : (
              visibleEntries.map((entry) => {
                const relativePath = getRelativePath(entry.path);
                const isForbidden = isForbiddenPath(relativePath);

                if (entry.type === "folder") {
                  const isFolderSelected = paths.includes(relativePath);
                  const isFolderPartiallySelected =
                    !isFolderSelected &&
                    paths.some((p) => p.startsWith(`${relativePath}/`));

                  return (
                    <div
                      key={relativePath}
                      className={cn(
                        "flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/60",
                        isForbidden &&
                          "cursor-not-allowed opacity-50 hover:bg-transparent",
                      )}
                    >
                      <Checkbox
                        checked={
                          isFolderSelected
                            ? true
                            : isFolderPartiallySelected
                              ? "indeterminate"
                              : false
                        }
                        disabled={isLoading || isForbidden}
                        onCheckedChange={(checked) => {
                          if (checked === true) {
                            setPaths((prev) =>
                              selectShareFolderPath(prev, relativePath),
                            );
                            return;
                          }

                          setPaths((prev) =>
                            unselectShareFolderPath(prev, relativePath),
                          );
                        }}
                      />
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
                        disabled={isForbidden}
                        onClick={() => openFolder(entry.path)}
                      >
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          {entry.path}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    </div>
                  );
                }

                return (
                  <label
                    key={relativePath}
                    className={cn(
                      "flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/60",
                      isForbidden && "hover:bg-transparent",
                    )}
                  >
                    <Checkbox
                      checked={paths.includes(relativePath)}
                      disabled={isLoading || isForbidden}
                      onCheckedChange={(checked) => {
                        if (
                          (checked === true) !==
                          paths.includes(relativePath)
                        ) {
                          togglePath(relativePath);
                        }
                      }}
                    />
                    <div className="flex min-w-0 items-center gap-2">
                      <File className="size-4 shrink-0 text-muted-foreground" />
                      <p
                        className={
                          isForbidden
                            ? "truncate text-muted-foreground"
                            : "truncate"
                        }
                      >
                        {entry.path}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 pt-4 pb-8">
          <Button
            variant="secondary"
            disabled={isLoading}
            onClick={() => {
              onClose();
            }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            disabled={isLoading}
            onClick={() => {
              passPaths(filterSelectableSharePaths(paths, forbiddenSet));
              onClose();
            }}
          >
            {t("common.choose")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
