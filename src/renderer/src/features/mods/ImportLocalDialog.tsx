import { IAddedLocalProject, IProject, ProjectType } from "@/types/ModManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Hint } from "@renderer/components/Hint";
import { formatBytes } from "@renderer/utilities/file";
import { CircleAlert, FileBox, Loader2, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "./format";
import { ProjectIcon } from "./ProjectIcon";

export type ImportMode = "import" | "restore";

const TYPE_KEY: Record<string, string> = {
  [ProjectType.MOD]: "modManager.projectTypes.mod",
  [ProjectType.RESOURCEPACK]: "modManager.projectTypes.resourcepack",
  [ProjectType.SHADER]: "modManager.projectTypes.shader",
  [ProjectType.DATAPACK]: "modManager.projectTypes.datapack",
  [ProjectType.PLUGIN]: "modManager.projectTypes.plugin",
  [ProjectType.WORLD]: "modManager.projectTypes.world",
  [ProjectType.MODPACK]: "modManager.projectTypes.modpack",
};

export function ImportLocalDialog({
  onClose,
  projects,
  addProjects,
  mode = "import",
  lang,
  sizeUnits,
}: {
  onClose: () => void;
  projects: IAddedLocalProject[];
  addProjects: (projects: IProject[]) => void | Promise<void>;
  mode?: ImportMode;
  lang: string;
  sizeUnits: string[];
}) {
  const { t } = useTranslation();

  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const validIndexes = useMemo(
    () =>
      projects
        .map((item, index) => (item.status === "valid" ? index : -1))
        .filter((index) => index !== -1),
    [projects],
  );

  useEffect(() => {
    setSelected(new Set(validIndexes));
  }, [validIndexes]);

  const selectedCount = selected.size;
  const validCount = validIndexes.length;
  const allSelected = validCount > 0 && selectedCount === validCount;

  const selectedProjects = useMemo(
    () =>
      projects
        .filter((_, index) => selected.has(index))
        .map((item) => item.project),
    [projects, selected],
  );

  const toggle = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === validIndexes.length ? new Set() : new Set(validIndexes),
    );
  }, [validIndexes]);

  const handleAdd = useCallback(async () => {
    if (isLoading || selected.size === 0) return;

    setIsLoading(true);
    try {
      await addProjects(selectedProjects);
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, selected.size, addProjects, selectedProjects, onClose]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        onPointerDownOutside={(event) => {
          if (isLoading) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (isLoading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              mode === "restore"
                ? "modManager.restoreTitle"
                : "modManager.addingProjects",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              mode === "restore"
                ? "modManager.restoreHint"
                : "modManager.importHint",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-7 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={isLoading || validCount === 0}
            onClick={toggleAll}
          >
            {t(
              allSelected ? "modManager.clearSelection" : "modManager.selectAll",
            )}
          </Button>
          <span className="ml-auto font-mono text-xs tabular-nums text-faint">
            {selectedCount}/{validCount}
          </span>
        </div>

        <div className="-mx-1 max-h-[21rem] min-h-0 overflow-y-auto px-1">
          <div className="flex flex-col gap-1">
            {projects.map((item, index) => {
              const isValid = item.status === "valid";
              const isDuplicate = item.status === "duplicate";
              const isSelected = selected.has(index);

              const typeKey = TYPE_KEY[item.project.projectType];
              const meta = [
                item.fileName,
                item.size ? formatBytes(item.size, sizeUnits, 1) : null,
                typeKey ? t(typeKey) : null,
                item.deletedAt
                  ? formatDate(new Date(item.deletedAt).toISOString(), lang)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={!isValid || isLoading}
                  onClick={() => toggle(index)}
                  className="flex h-14 w-full min-w-0 items-center gap-2.5 rounded-lg bg-surface-2 px-2.5 text-left transition-colors hover:bg-surface-3 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-surface-2"
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={!isValid || isLoading}
                    aria-label={item.project.title}
                    className="pointer-events-none shrink-0"
                  />

                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-1 text-faint">
                    <ProjectIcon
                      src={item.project.iconUrl}
                      size={36}
                      fallback={<FileBox className="size-4" />}
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                    <Hint
                      content={item.project.title}
                      variant="text"
                      truncatedOnly
                    >
                      <span className="truncate text-sm leading-4 text-foreground">
                        {item.project.title}
                      </span>
                    </Hint>
                    <Hint content={meta} variant="text" truncatedOnly>
                      <span className="truncate text-xs leading-4 text-faint">
                        {meta || item.project.description}
                      </span>
                    </Hint>
                  </div>

                  {isDuplicate && (
                    <span className="flex shrink-0 items-center gap-1 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[0.625rem] leading-3 font-medium text-warning">
                      <PackageCheck className="size-2.5" />
                      {t("modManager.installed")}
                    </span>
                  )}

                  {!isValid && !isDuplicate && (
                    <span className="flex shrink-0 items-center gap-1 rounded-sm bg-destructive/15 px-1.5 py-0.5 text-[0.625rem] leading-3 font-medium text-destructive">
                      <CircleAlert className="size-2.5" />
                      {t("modManager.broken")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {t("common.cancel")}
          </Button>

          <Button
            disabled={isLoading || selectedCount === 0}
            onClick={handleAdd}
          >
            {isLoading && <Loader2 className="animate-spin" />}
            {t(mode === "restore" ? "modManager.trashRestore" : "common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
