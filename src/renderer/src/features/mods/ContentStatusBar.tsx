import { Dispatch, SetStateAction } from "react";
import {
  CheckCheck,
  CircleArrowUp,
  CloudOff,
  Copy,
  FolderInput,
  ListFilter,
  ListRestart,
  Pin,
  PinOff,
  Plug,
  PowerOff,
  Trash2,
  X,
} from "lucide-react";
import { ProjectType } from "@/types/ModManager";
import { Loader } from "@/types/Loader";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getLoaderInfo } from "@renderer/components/Loaders";
import { ContentEntry, canToggleType } from "./entries";
import { LibraryFacet } from "./filters";
import type { TFunction } from "i18next";
import type { UpdateCheckResult } from "./useUpdateCheck";

import type { CatalogFilterChip, DuplicateMarks } from "./filters";

export interface ContentStatusBarProps {
  addForeignFiles: () => Promise<void>;
  applyUpdateFor: (keys: string[]) => void;
  bar:
    | "selection"
    | "foreign"
    | "duplicates"
    | "updates"
    | "unchecked"
    | "connector"
    | "chips"
    | null;
  clearFilterChips: () => void;
  duplicates: DuplicateMarks;
  filterChips: { key: LibraryFacet; label: string }[] | CatalogFilterChip[];
  foreignFiles: string[];
  isBusy: boolean;
  libraryEntries: ContentEntry[];
  libraryFacets: LibraryFacet[];
  loader: Loader | undefined;
  projectType: ProjectType;
  removeDuplicateRecords: (targets: ContentEntry[]) => void;
  removeEntries: (targets: ContentEntry[]) => Promise<void>;
  removeFilterChip: (key: string) => void;
  selectedCheckable: ContentEntry[];
  selectedEntries: ContentEntry[];
  selection: Set<string>;
  selectionAllPinned: boolean;
  setCatalogLoader: Dispatch<SetStateAction<Loader | null>>;
  setEnabledFor: (entries: ContentEntry[], enabled: boolean) => Promise<void>;
  setLibraryFacets: Dispatch<SetStateAction<LibraryFacet[]>>;
  setPinnedFor: (targets: ContentEntry[], pinned: boolean) => void;
  setQuery: Dispatch<SetStateAction<string>>;
  setRawQuery: Dispatch<SetStateAction<string>>;
  setSelection: Dispatch<SetStateAction<Set<string>>>;
  t: TFunction<"translation", undefined>;
  trashForeignFiles: () => Promise<void>;
  uncheckedCount: number;
  updatableCount: number;
  updateCheck: UpdateCheckResult;
}

export function ContentStatusBar({
  addForeignFiles,
  applyUpdateFor,
  bar,
  clearFilterChips,
  duplicates,
  filterChips,
  foreignFiles,
  isBusy,
  libraryEntries,
  libraryFacets,
  loader,
  projectType,
  removeDuplicateRecords,
  removeEntries,
  removeFilterChip,
  selectedCheckable,
  selectedEntries,
  selection,
  selectionAllPinned,
  setCatalogLoader,
  setEnabledFor,
  setLibraryFacets,
  setPinnedFor,
  setQuery,
  setRawQuery,
  setSelection,
  t,
  trashForeignFiles,
  uncheckedCount,
  updatableCount,
  updateCheck,
}: ContentStatusBarProps) {
  return (
    <>
      <Collapse show={bar !== null}>
        {bar === "selection" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-primary/40 bg-primary-soft px-2.5">
            <span className="text-xs font-medium text-foreground">
              {t("modManager.selectedCount", { count: selection.size })}
            </span>

            <div className="ml-auto flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={isBusy}
                onClick={() =>
                  applyUpdateFor(selectedEntries.map((item) => item.key))
                }
              >
                <CircleArrowUp className="size-3.5" />
                {t("common.update")}
              </Button>

              {selectedCheckable.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={isBusy}
                  onClick={() =>
                    setPinnedFor(selectedCheckable, !selectionAllPinned)
                  }
                >
                  {selectionAllPinned ? (
                    <PinOff className="size-3.5" />
                  ) : (
                    <Pin className="size-3.5" />
                  )}
                  {t(
                    selectionAllPinned ? "modManager.unpin" : "modManager.pin",
                  )}
                </Button>
              )}

              {canToggleType(projectType) && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isBusy}
                    onClick={() => void setEnabledFor(selectedEntries, true)}
                  >
                    <CheckCheck className="size-3.5" />
                    {t("modManager.enable")}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isBusy}
                    onClick={() => void setEnabledFor(selectedEntries, false)}
                  >
                    <PowerOff className="size-3.5" />
                    {t("modManager.disable")}
                  </Button>
                </>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/15 hover:text-destructive"
                disabled={isBusy}
                onClick={() => {
                  removeEntries(selectedEntries);
                  setSelection(new Set());
                }}
              >
                <Trash2 className="size-3.5" />
                {t("common.delete")}
              </Button>

              <Button
                size="icon-sm"
                variant="ghost"
                className="size-7"
                aria-label={t("common.cancel")}
                onClick={() => setSelection(new Set())}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : bar === "foreign" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5">
            <FolderInput className="size-4 shrink-0 text-faint" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {t("modManager.foreignFiles", {
                    count: foreignFiles.length,
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {t("modManager.foreignHint")}
              </TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled={isBusy}
              onClick={() => void trashForeignFiles()}
            >
              {t("modManager.foreignTrash")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled={isBusy}
              onClick={() => void addForeignFiles()}
            >
              {t("modManager.foreignAdd")}
            </Button>
          </div>
        ) : bar === "updates" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5">
            <CircleArrowUp className="size-4 shrink-0 text-warning" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {t("modManager.availableUpdates", { count: updatableCount })}
            </span>
            {!libraryFacets.includes("update") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setLibraryFacets(["update"])}
              >
                <ListFilter className="size-3.5" />
                {t("modManager.updatesShow")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled={isBusy}
              onClick={() => applyUpdateFor([...updateCheck.updatable])}
            >
              {t("modManager.updateAll")}
            </Button>
          </div>
        ) : bar === "unchecked" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5">
            <CloudOff className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {t("modManager.uncheckedUpdates", { count: uncheckedCount })}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2.5 text-xs"
              disabled={isBusy || updateCheck.isChecking}
              onClick={() => updateCheck.check(true)}
            >
              {t("modManager.retryCheck")}
            </Button>
          </div>
        ) : bar === "connector" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5">
            <Plug className="size-4 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {t("modManager.connectorHint", {
                loader: getLoaderInfo(loader).name,
              })}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 px-2.5 text-xs"
              onClick={() => {
                setCatalogLoader(null);
                setRawQuery("Sinytra Connector");
                setQuery("Sinytra Connector");
              }}
            >
              {t("modManager.connectorFind")}
            </Button>
          </div>
        ) : bar === "duplicates" ? (
          <div className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-warning/40 bg-surface-2 px-2.5">
            <Copy className="size-4 shrink-0 text-warning" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                  {t("modManager.duplicatesFound", {
                    count: duplicates.groups,
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72">
                {t("modManager.duplicatesHint")}
              </TooltipContent>
            </Tooltip>
            {!libraryFacets.includes("duplicate") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setLibraryFacets(["duplicate"])}
              >
                {t("modManager.duplicatesShow")}
              </Button>
            )}
            {duplicates.extra.size > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 px-2.5 text-xs"
                disabled={isBusy}
                onClick={() => {
                  removeDuplicateRecords(
                    libraryEntries.filter((entry) =>
                      duplicates.extra.has(entry.key),
                    ),
                  );
                  if (duplicates.extra.size === duplicates.all.size) {
                    setLibraryFacets((prev) =>
                      prev.filter((facet) => facet !== "duplicate"),
                    );
                  }
                }}
              >
                {t("modManager.duplicatesRemove")}
              </Button>
            )}
          </div>
        ) : bar === "chips" ? (
          <div className="mb-2.5 flex h-9 items-center gap-1.5 overflow-x-auto">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-surface-2 px-2 text-xs text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
                onClick={() => removeFilterChip(chip.key)}
              >
                {chip.label}
                <X className="size-3" />
              </button>
            ))}
            <button
              type="button"
              className="flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-faint transition-colors hover:text-foreground"
              onClick={clearFilterChips}
            >
              <ListRestart className="size-3" />
              {t("modManager.resetFilters")}
            </button>
          </div>
        ) : null}
      </Collapse>
    </>
  );
}
