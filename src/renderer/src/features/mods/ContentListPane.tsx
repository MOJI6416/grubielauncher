import { type CSSProperties, Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CircleAlert,
  EyeOff,
  FilePlus2,
  FolderOpen,
  ListRestart,
  Loader2,
  Package,
  PackageOpen,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  ILocalProject,
  IVersion as ModVersion,
  ProjectType,
} from "@/types/ModManager";
import { IVersion } from "@/types/IVersion";
import { Loader } from "@/types/Loader";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MatchableProject } from "@renderer/utilities/mod";
import {
  ContentEntry,
  entryKey,
  fromCatalogProject,
  canToggleType,
} from "./entries";
import { isCheckableProject } from "./updates";
import { TRASH_MAX_AGE_DAYS, TrashEntry } from "./trash";
import { ContentRow } from "./ContentRow";
import { ContentDetails, DetailProgress } from "./ContentDetails";
import { ImportMode } from "./ImportLocalDialog";
import { isImportableFileName } from "./localImport";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import {
  type DetailState,
  EmptyState,
  type Scope,
} from "./contentManagerParts";
import type { RefObject } from "react";
import type { TFunction } from "i18next";
import type { UpdateCheckResult } from "./useUpdateCheck";
import type { DuplicateMarks } from "./filters";

import type { ILocalAccount } from "@/types/Account";
import type { CatalogState } from "./useCatalogSearch";
import type { DeletionPlan } from "@renderer/utilities/mod";
import type { ModFileStates } from "./useModFileStates";
import type { ReactVirtualizer, VirtualItem } from "@tanstack/react-virtual";

const api = window.api;

export interface ContentListPaneProps {
  account: ILocalAccount | undefined;
  activeIndex: number;
  busyKey: string | null;
  canBrowse: boolean;
  canEdit: boolean;
  canSelectRows: boolean;
  catalog: CatalogState & {
    reload: () => void;
    loadMore: (force?: boolean) => void;
  };
  changedAt: Map<string, number>;
  closeDetail: () => void;
  deletionPlan: DeletionPlan;
  detail: DetailState | null;
  detailEntry: ContentEntry | null;
  detailSelectedVersion: ModVersion | null;
  detailStack: ContentEntry[];
  detailWidth: {
    width: number;
    isDefault: boolean;
    clamp: (width: number) => number;
    commit: (width: number) => void;
    reset: () => void;
  };
  duplicates: DuplicateMarks;
  fileStates: ModFileStates;
  findInstalled: (project: MatchableProject) => ILocalProject | undefined;
  handleKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  hasActiveFilters: boolean;
  hideTrashBar: () => void;
  importMode: ImportMode;
  importProgress: number;
  installModpack: (
    entry: ContentEntry,
    modVersion: ModVersion,
  ) => Promise<void>;
  installProject: (entry: ContentEntry, explicit?: ModVersion) => Promise<void>;
  instancePath: string | undefined;
  isBusy: boolean;
  isDropActive: boolean;
  isEmptyLibrary: boolean;
  isModpacks: boolean;
  isResultWave: boolean;
  isTranslating: boolean;
  lang: string;
  listBusy: boolean;
  loadDetail: (entry: ContentEntry, keepStack: boolean) => Promise<void>;
  loader: Loader | undefined;
  modpackProgress: DetailProgress | null;
  needsFileTimes: boolean;
  openTrashFolder: () => Promise<void>;
  projectType: ProjectType;
  readLocalFiles: (
    filePaths: string[],
    source?: {
      names?: Map<string, string>;
      deletedAt?: Map<string, number | null>;
      reasons?: Map<string, TrashEntry["reason"]>;
      mode?: ImportMode;
    },
  ) => Promise<void>;
  removeEntries: (targets: ContentEntry[]) => Promise<void>;
  resetFilters: () => void;
  restorableTrash: TrashEntry[];
  restoreTrash: () => Promise<void>;
  rowActions: {
    onOpen: (entry: ContentEntry) => void;
    onToggleSelected: (entry: ContentEntry) => void;
    onInstall: (entry: ContentEntry) => undefined;
    onUpdate: (entry: ContentEntry) => void;
    onDelete: (entry: ContentEntry) => Promise<void>;
    onRestore: (entry: ContentEntry) => void;
    onToggleEnabled: (entry: ContentEntry, enabled: boolean) => undefined;
  };
  rows: ContentEntry[];
  rowVirtualizer: ReactVirtualizer<HTMLDivElement, Element>;
  scope: Scope;
  browseScope: Scope;
  selectDetailVersion: (next: ModVersion) => Promise<void>;
  selection: Set<string>;
  setDetailStack: Dispatch<SetStateAction<ContentEntry[]>>;
  setIsClearTrashOpen: Dispatch<SetStateAction<boolean>>;
  setIsDropActive: Dispatch<SetStateAction<boolean>>;
  setListElement: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setPinnedFor: (targets: ContentEntry[], pinned: boolean) => void;
  setScope: (scope: Scope) => void;
  showAddRow: boolean;
  showTrashBar: boolean;
  sizeUnits: string[];
  splitRef: RefObject<HTMLDivElement | null>;
  t: TFunction<"translation", undefined>;
  translateDetail: () => Promise<void>;
  updateCheck: UpdateCheckResult;
  version: IVersion | undefined;
  virtualItems: VirtualItem[];
}

export function ContentListPane({
  account,
  activeIndex,
  busyKey,
  canBrowse,
  canEdit,
  canSelectRows,
  catalog,
  changedAt,
  closeDetail,
  deletionPlan,
  detail,
  detailEntry,
  detailSelectedVersion,
  detailStack,
  detailWidth,
  duplicates,
  fileStates,
  findInstalled,
  handleKeyDown,
  hasActiveFilters,
  hideTrashBar,
  importMode,
  importProgress,
  installModpack,
  installProject,
  instancePath,
  isBusy,
  isDropActive,
  isEmptyLibrary,
  isModpacks,
  isResultWave,
  isTranslating,
  lang,
  listBusy,
  loadDetail,
  loader,
  modpackProgress,
  needsFileTimes,
  openTrashFolder,
  projectType,
  readLocalFiles,
  removeEntries,
  resetFilters,
  restorableTrash,
  restoreTrash,
  rowActions,
  rows,
  rowVirtualizer,
  scope,
  selectDetailVersion,
  selection,
  setDetailStack,
  setIsClearTrashOpen,
  setIsDropActive,
  setListElement,
  setPinnedFor,
  setScope,
  browseScope,
  showAddRow,
  showTrashBar,
  sizeUnits,
  splitRef,
  t,
  translateDetail,
  updateCheck,
  version,
  virtualItems,
}: ContentListPaneProps) {
  return (
    <>
      <div
        ref={splitRef}
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card"
      >
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onDragEnter={(event) => {
            if (!canEdit || isModpacks) return;
            event.preventDefault();
            setIsDropActive(true);
          }}
          onDragOver={(event) => {
            if (!canEdit || isModpacks) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node))
              return;
            setIsDropActive(false);
          }}
          onDrop={async (event) => {
            if (!canEdit || isModpacks) return;
            event.preventDefault();
            setIsDropActive(false);

            const filePaths = [...event.dataTransfer.files]
              .map((file) => api.other.getPathForFile(file))
              .filter((filePath) => isImportableFileName(filePath));

            if (filePaths.length === 0) {
              toast.warning(t("modManager.invalidMod"));
              return;
            }

            await readLocalFiles(filePaths);
          }}
        >
          <div
            ref={setListElement}
            tabIndex={0}
            role="listbox"
            aria-label={t("modManager.title")}
            onKeyDown={handleKeyDown}
            className="min-h-0 flex-1 overflow-y-auto p-2 outline-none"
          >
            {rows.length > 0 ? (
              <div
                className={cn("relative w-full", isResultWave && "result-wave")}
                style={{
                  height: `${rowVirtualizer.getTotalSize() + (showAddRow ? 56 : 0)}px`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const entry = rows[virtualRow.index];
                  if (!entry) return null;

                  return (
                    <div
                      key={entry.key}
                      role="presentation"
                      data-wave-row
                      className="absolute top-0 left-0 w-full"
                      style={
                        {
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                          "--wave-index": virtualRow.index,
                        } as CSSProperties
                      }
                    >
                      <ContentRow
                        entry={entry}
                        lang={lang}
                        sizeUnits={sizeUnits}
                        isLibrary={scope === "library"}
                        isActive={virtualRow.index === activeIndex}
                        isSelected={selection.has(entry.key)}
                        isDetailOpen={detail?.entry.key === entry.key}
                        isSelectable={canSelectRows}
                        isEnabled={
                          fileStates.ready
                            ? !fileStates.disabled.has(entry.key)
                            : !entry.markedDisabled
                        }
                        canEdit={canEdit && !isModpacks}
                        canToggle={
                          canEdit &&
                          canToggleType(projectType) &&
                          Boolean(instancePath) &&
                          fileStates.present.has(entry.key)
                        }
                        fileMissing={
                          fileStates.ready && !fileStates.present.has(entry.key)
                        }
                        hasUpdate={updateCheck.updatable.has(entry.key)}
                        isUnavailable={updateCheck.unavailable.has(entry.key)}
                        gameVersion={version?.id}
                        heldVersion={
                          updateCheck.held.get(entry.key)?.versionNumber ||
                          updateCheck.held.get(entry.key)?.name
                        }
                        isUnchecked={updateCheck.unchecked.has(entry.key)}
                        duplicate={
                          scope !== "library"
                            ? undefined
                            : duplicates.extra.has(entry.key)
                              ? "extra"
                              : duplicates.all.has(entry.key)
                                ? "review"
                                : undefined
                        }
                        foreignLoader={
                          entry.installed?.loader &&
                          entry.installed.loader !== loader
                            ? entry.installed.loader
                            : undefined
                        }
                        changedAt={
                          needsFileTimes ? changedAt.get(entry.key) : undefined
                        }
                        isBusy={busyKey === entry.key || isBusy}
                        isWorking={busyKey === entry.key}
                        actions={rowActions}
                      />
                    </div>
                  );
                })}

                {showAddRow && (
                  <button
                    type="button"
                    className="absolute left-0 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    style={{
                      top: `${rowVirtualizer.getTotalSize() + 6}px`,
                    }}
                    onClick={() => setScope(browseScope)}
                  >
                    <PackageOpen className="size-4" />
                    {t("modManager.browseCatalog")}
                  </button>
                )}
              </div>
            ) : listBusy ? (
              <ListSkeleton rows={10} />
            ) : catalog.error && scope !== "library" ? (
              <EmptyState
                icon={<CircleAlert className="size-6 text-destructive" />}
                title={t("modManager.searchFailedTitle")}
                description={t("modManager.searchFailed")}
                action={
                  <Button size="sm" variant="outline" onClick={catalog.reload}>
                    {t("common.retry")}
                  </Button>
                }
              />
            ) : isEmptyLibrary ? (
              <EmptyState
                icon={<Package className="size-6 text-faint" />}
                title={t("modManager.emptyInstalled")}
                description={t("modManager.emptyInstalledHint")}
                action={
                  canBrowse ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setScope(browseScope)}
                    >
                      <PackageOpen className="size-4" />
                      {t("modManager.browseCatalog")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                icon={<Search className="size-6 text-faint" />}
                title={t("common.notFound")}
                description={t("modManager.notFoundHint")}
                action={
                  hasActiveFilters ? (
                    <Button size="sm" variant="outline" onClick={resetFilters}>
                      <ListRestart className="size-4" />
                      {t("modManager.resetFilters")}
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>

          <Collapse show={catalog.isLoadingMore}>
            <div className="flex h-8 items-center justify-center gap-2 border-t border-border text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t("common.searching")}
            </div>
          </Collapse>

          {scope !== "library" &&
            catalog.error &&
            !catalog.isLoadingMore &&
            rows.length > 0 && (
              <div className="flex h-8 shrink-0 items-center justify-center gap-2 border-t border-border px-3 text-xs text-muted-foreground">
                <CircleAlert className="size-3.5 shrink-0 text-destructive" />
                <span className="min-w-0 truncate">
                  {t("modManager.searchFailedTitle")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 px-2 text-xs"
                  onClick={() => catalog.loadMore(true)}
                >
                  {t("common.retry")}
                </Button>
              </div>
            )}

          {showTrashBar && (
            <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3">
              <Undo2 className="size-3.5 shrink-0 text-faint" />
              <span className="shrink-0 text-xs text-foreground">
                {t("modManager.trashCount", {
                  count: restorableTrash.length,
                })}
              </span>
              <span className="min-w-0 truncate text-xs text-faint">
                {t("modManager.trashHint", { days: TRASH_MAX_AGE_DAYS })}
              </span>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  disabled={isBusy}
                  onClick={() => void restoreTrash()}
                >
                  {t("modManager.trashRestore")}
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label={t("modManager.trashOpen")}
                      onClick={() => void openTrashFolder()}
                    >
                      <FolderOpen className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("modManager.trashOpen")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7 text-destructive hover:bg-destructive/15 hover:text-destructive"
                      disabled={isBusy}
                      aria-label={t("modManager.trashClear")}
                      onClick={() => setIsClearTrashOpen(true)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("modManager.trashClear")}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-7"
                      aria-label={t("modManager.trashHide")}
                      onClick={hideTrashBar}
                    >
                      <EyeOff className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-60">
                    {t("modManager.trashHideHint")}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {isDropActive && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary-veil text-sm font-medium text-foreground">
              <FilePlus2 className="size-4" />
              {t("modManager.selectLocalsHint")}
            </div>
          )}

          {importProgress > 0 && (
            <div className="absolute right-3 bottom-3 left-3 z-10 rounded-lg border border-border bg-popover p-2.5 shadow-lg">
              <p className="mb-1.5 text-xs text-muted-foreground">
                {t(
                  importMode === "restore"
                    ? "modManager.restoreTitle"
                    : "modManager.addingProjects",
                )}
              </p>
              <Progress value={importProgress} max={100} />
            </div>
          )}
        </div>

        {detailEntry && (
          <ContentDetails
            entry={detailEntry}
            project={detail?.project ?? null}
            versions={detail?.versions ?? []}
            selectedVersion={detailSelectedVersion}
            installedVersionId={detailEntry.installed?.version?.id ?? null}
            isLoading={detail?.isLoading ?? false}
            isBusy={isBusy}
            error={detail?.error ?? false}
            depsError={detail?.depsError ?? false}
            canEdit={canEdit || isModpacks}
            canGoBack={detailStack.length > 0}
            isModpacks={isModpacks}
            lang={lang}
            progress={modpackProgress}
            canTranslate={lang !== "en" && account?.type !== "plain"}
            isTranslating={isTranslating}
            deletionBlockers={deletionPlan.blockers}
            alsoRemoves={deletionPlan.remove.filter(
              (item) => entryKey(item.provider, item.id) !== detailEntry.key,
            )}
            findInstalled={(project) => findInstalled(project)}
            onBack={() => {
              const previous = detailStack[detailStack.length - 1];
              if (!previous) return;
              setDetailStack((prev) => prev.slice(0, -1));
              void loadDetail(previous, true);
            }}
            onClose={closeDetail}
            onSelectVersion={(next) => void selectDetailVersion(next)}
            onInstall={(next) => {
              if (isModpacks) void installModpack(detailEntry, next);
              else void installProject(detailEntry, next);
            }}
            onDelete={() => removeEntries([detailEntry])}
            onOpenDependency={(project) => {
              setDetailStack((prev) => [...prev, detailEntry]);
              void loadDetail(
                fromCatalogProject(project, findInstalled(project) ?? null),
                true,
              );
            }}
            onTranslate={() => void translateDetail()}
            onRetry={() => void loadDetail(detailEntry, true)}
            width={detailWidth.width}
            clampWidth={detailWidth.clamp}
            onResizeEnd={detailWidth.commit}
            onResetWidth={detailWidth.reset}
            isPinned={detailEntry.installed?.pinned === true}
            canPin={Boolean(
              detailEntry.installed &&
                isCheckableProject(detailEntry.installed),
            )}
            onTogglePin={() =>
              setPinnedFor(
                [detailEntry],
                detailEntry.installed?.pinned !== true,
              )
            }
          />
        )}
      </div>
    </>
  );
}
