import {
  type CSSProperties,
  type DragEvent,
  Dispatch,
  type ReactNode,
  SetStateAction,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { showFailureToast } from "@renderer/utilities/failures";
import { useModSets, toggleFavorite } from "@renderer/features/modSets/modSetsStore";
import { isFavorite, type IModSetItem } from "@renderer/features/modSets/modSets";
import { openCatalogInstall } from "@renderer/features/catalogInstall/catalogInstallStore";
import {
  INSTALLABLE_TYPES,
  isCatalogProvider,
} from "@renderer/features/catalogInstall/installToInstance";
import { cn } from "@/lib/utils";
import {
  CircleAlert,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe2,
  ListRestart,
  Loader2,
  Package,
  PackageOpen,
  Search,
  SunMoon,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  ILocalProject,
  IProjectAuthor,
  IVersion as ModVersion,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { IVersion } from "@/types/IVersion";
import { Loader } from "@/types/Loader";
import type { ShaderSupport } from "./shaderSupport";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import { Progress } from "@/components/ui/progress";
import { Hint } from "@renderer/components/Hint";
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
import { GroupHeader, type GroupHeaderActions } from "./GroupHeader";
import { type DisplayItem, type ModGroup, UNGROUPED_ID } from "./modGroups";
import { useDragAutoScroll } from "@renderer/utilities/useDragAutoScroll";
import { ContentDetails, DetailProgress } from "./ContentDetails";
import { ImportMode } from "./ImportLocalDialog";
import { ListSkeleton } from "@renderer/components/ListSkeleton";
import { type DetailState, type Scope } from "./contentManagerParts";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { RefObject } from "react";
import type { TFunction } from "i18next";
import type { UpdateCheckResult } from "./useUpdateCheck";
import { type DuplicateMarks, contentOrigin } from "./filters";
import type { ModRelations } from "./modRelations";

import type { ILocalAccount } from "@/types/Account";
import type { CatalogState } from "./useCatalogSearch";
import type { DeletionPlan } from "@renderer/utilities/mod";
import type { ModFileStates } from "./useModFileStates";
import type { SelectionGesture } from "@renderer/utilities/rangeSelection";
import type { ReactVirtualizer, VirtualItem } from "@tanstack/react-virtual";

function catalogSourceName(scope: Scope): string {
  return scope === Provider.CURSEFORGE ? "CurseForge" : "Modrinth";
}

export interface ContentListPaneProps {
  account: ILocalAccount | undefined;
  activeIndex: number;
  busyKey: string | null;
  canBrowse: boolean;
  canEdit: boolean;
  canFilterByAuthor: (provider: Provider) => boolean;
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
  displayItems: DisplayItem[];
  detailWidth: {
    width: number;
    isDefault: boolean;
    clamp: (width: number) => number;
    commit: (width: number) => void;
    reset: () => void;
  };
  duplicates: DuplicateMarks;
  fileStates: ModFileStates;
  filterByAuthor: (provider: Provider, author: IProjectAuthor) => void;
  findInstalled: (project: MatchableProject) => ILocalProject | undefined;
  groupActions: GroupHeaderActions;
  canDragRows: boolean;
  dragState: {
    keys: ReadonlySet<string>;
    hasGrouped: boolean;
    groups: ModGroup[];
  } | null;
  dropToNewGroup: () => void;
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
  lockedHint?: string;
  detailLockedHint?: string;
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
  removeEntries: (targets: ContentEntry[]) => Promise<void>;
  resetFilters: () => void;
  restorableTrash: TrashEntry[];
  restoreTrash: () => Promise<void>;
  rowActions: {
    onOpen: (entry: ContentEntry) => void;
    onSelect: (entry: ContentEntry, gesture: SelectionGesture) => void;
    onInstall: (entry: ContentEntry) => undefined;
    onUpdate: (entry: ContentEntry) => void;
    onDelete: (entry: ContentEntry) => Promise<void>;
    onRestore: (entry: ContentEntry) => void;
    onToggleEnabled: (entry: ContentEntry, enabled: boolean) => undefined;
    onAuthor: (entry: ContentEntry) => void;
  };
  rows: ContentEntry[];
  rowVirtualizer: ReactVirtualizer<HTMLDivElement, Element>;
  scope: Scope;
  browseScope: Scope;
  selectDetailVersion: (next: ModVersion) => Promise<void>;
  selection: Set<string>;
  setDetailStack: Dispatch<SetStateAction<ContentEntry[]>>;
  setIsClearTrashOpen: Dispatch<SetStateAction<boolean>>;
  listElement: HTMLDivElement | null;
  setListElement: Dispatch<SetStateAction<HTMLDivElement | null>>;
  setPinnedFor: (targets: ContentEntry[], pinned: boolean) => void;
  libraryPackKeys: ReadonlySet<string> | null;
  detailRelations: ModRelations | null;
  relationsScanning: boolean;
  loadRelations: () => void;
  openInstalled: (mod: ILocalProject) => void;
  setScope: (scope: Scope) => void;
  showTrashBar: boolean;
  sizeUnits: string[];
  splitRef: RefObject<HTMLDivElement | null>;
  t: TFunction<"translation", undefined>;
  translateDetail: () => Promise<void>;
  openProjectLink: (href: string) => Promise<boolean>;
  updateCheck: UpdateCheckResult;
  version: IVersion | undefined;
  virtualItems: VirtualItem[];
  shaderSupport: ShaderSupport | null;
  onOpenShaderLoader: (slug: string) => void;
  canInstallShaderLoader: boolean;
  onOpenWorlds?: () => void;
}

export function ContentListPane({
  account,
  activeIndex,
  busyKey,
  canBrowse,
  canEdit,
  canFilterByAuthor,
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
  displayItems,
  duplicates,
  fileStates,
  filterByAuthor,
  findInstalled,
  groupActions,
  canDragRows,
  dragState,
  dropToNewGroup,
  handleKeyDown,
  hasActiveFilters,
  hideTrashBar,
  importMode,
  importProgress,
  installModpack,
  installProject,
  instancePath,
  isBusy,
  lockedHint,
  detailLockedHint,
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
  listElement,
  setListElement,
  setPinnedFor,
  libraryPackKeys,
  detailRelations,
  relationsScanning,
  loadRelations,
  openInstalled,
  setScope,
  browseScope,
  showTrashBar,
  sizeUnits,
  splitRef,
  t,
  translateDetail,
  openProjectLink,
  updateCheck,
  version,
  virtualItems,
  shaderSupport,
  onOpenShaderLoader,
  canInstallShaderLoader,
  onOpenWorlds,
}: ContentListPaneProps) {
  const modSets = useModSets();
  const favoriteItem =
    detailEntry &&
    isCatalogProvider(detailEntry.provider) &&
    INSTALLABLE_TYPES.has(detailEntry.projectType)
      ? {
          provider: detailEntry.provider,
          id: detailEntry.id,
          projectType: detailEntry.projectType,
          title: detailEntry.title,
          iconUrl: detailEntry.iconUrl ?? null,
          url: detailEntry.url ?? "",
        }
      : null;
  const flipFavorite = async (item: IModSetItem) => {
    const favorite = await toggleFavorite(item);
    if (favorite === null) {
      showFailureToast(t("modSets.saveFailed"), undefined, {
        channels: ["fs:writeJSON"],
      });
      return;
    }
    toast.success(
      t(favorite ? "modManager.favoriteAdded" : "modManager.favoriteRemoved", {
        title: item.title,
      }),
    );
  };
  const dropPanelRef = useRef<HTMLDivElement | null>(null);
  useDragAutoScroll(
    dragState !== null,
    () => listElement,
    () => dropPanelRef.current,
  );

  return (
    <>
      <div
        ref={splitRef}
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {onOpenWorlds &&
            scope === "library" &&
            (projectType === ProjectType.WORLD ||
              projectType === ProjectType.DATAPACK) && (
              <div className="flex min-h-10 shrink-0 items-center gap-2.5 border-b border-border px-3 py-1.5 text-xs">
                <Globe2 className="size-3.5 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                  {projectType === ProjectType.WORLD
                    ? t("modManager.worldsElsewhere")
                    : t("modManager.datapacksElsewhere")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={onOpenWorlds}
                >
                  {t("modManager.openWorlds")}
                </Button>
              </div>
            )}

          {shaderSupport && shaderSupport.state !== "ready" && (
            <div className="flex min-h-10 shrink-0 items-center gap-2.5 border-b border-border px-3 py-1.5 text-xs">
              <SunMoon className="size-3.5 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 leading-snug text-muted-foreground">
                {shaderSupport.state === "missing"
                  ? t("modManager.shaderLoader.missing", { loader: shaderSupport.title })
                  : t("modManager.shaderLoader.unsupported")}
              </span>
              {shaderSupport.state === "missing" && canInstallShaderLoader && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2.5 text-xs"
                  onClick={() => onOpenShaderLoader(shaderSupport.slug)}
                >
                  {t("modManager.shaderLoader.install", { loader: shaderSupport.title })}
                </Button>
              )}
            </div>
          )}

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
                  height: `${rowVirtualizer.getTotalSize()}px`,
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const item = displayItems[virtualRow.index];
                  if (!item) return null;

                  if (item.kind === "header") {
                    return (
                      <div
                        key={`group:${item.groupId}`}
                        role="presentation"
                        className="absolute top-0 left-0 w-full"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <GroupHeader
                          groupId={item.groupId}
                          name={item.name}
                          count={item.count}
                          collapsed={item.collapsed}
                          entries={item.entries}
                          allDisabled={item.entries.every((member) =>
                            fileStates.ready
                              ? fileStates.disabled.has(member.key)
                              : member.markedDisabled,
                          )}
                          canToggle={
                            canEdit &&
                            canToggleType(projectType) &&
                            Boolean(instancePath) &&
                            item.entries.some((member) =>
                              fileStates.present.has(member.key),
                            )
                          }
                          isBusy={isBusy}
                          lockedHint={lockedHint}
                          canDrop={dragState !== null}
                          actions={groupActions}
                        />
                      </div>
                    );
                  }

                  const entry = item.entry;

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
                        isActive={item.rowIndex === activeIndex}
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
                        origin={
                          scope === "library"
                            ? contentOrigin(entry, libraryPackKeys)
                            : undefined
                        }
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
                        lockedHint={lockedHint}
                        isWorking={busyKey === entry.key}
                        isDraggable={canDragRows}
                        isDragged={dragState?.keys.has(entry.key) ?? false}
                        actions={rowActions}
                      />
                    </div>
                  );
                })}

              </div>
            ) : listBusy ? (
              <ListSkeleton rows={10} />
            ) : catalog.error && scope !== "library" ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CircleAlert className="text-destructive" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {t("modManager.searchFailedSource", {
                      source: catalogSourceName(scope),
                    })}
                  </EmptyTitle>
                  <EmptyDescription className="max-w-80 text-xs">
                    {t("modManager.searchFailedSourceHint")}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button size="sm" variant="outline" onClick={catalog.reload}>
                    {t("common.retry")}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : isEmptyLibrary ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package />
                  </EmptyMedia>
                  <EmptyTitle>{t("modManager.emptyInstalled")}</EmptyTitle>
                  <EmptyDescription className="max-w-80 text-xs">
                    {t("modManager.emptyInstalledHint")}
                  </EmptyDescription>
                </EmptyHeader>
                {canBrowse && (
                  <EmptyContent>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setScope(browseScope)}
                    >
                      <PackageOpen className="size-4" />
                      {t("modManager.browseCatalog")}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>{t("common.notFound")}</EmptyTitle>
                  <EmptyDescription className="max-w-80 text-xs">
                    {t("modManager.notFoundHint")}
                  </EmptyDescription>
                </EmptyHeader>
                {hasActiveFilters && (
                  <EmptyContent>
                    <Button size="sm" variant="outline" onClick={resetFilters}>
                      <ListRestart className="size-4" />
                      {t("modManager.resetFilters")}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
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
                <Hint
                  content={t("modManager.searchFailedSource", {
                    source: catalogSourceName(scope),
                  })}
                  variant="text"
                  truncatedOnly
                >
                  <span className="min-w-0 truncate">
                    {t("modManager.searchFailedSource", {
                      source: catalogSourceName(scope),
                    })}
                  </span>
                </Hint>
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
              <Hint
                content={t("modManager.trashHint", { days: TRASH_MAX_AGE_DAYS })}
                variant="text"
                truncatedOnly
              >
                <span className="min-w-0 truncate text-xs text-faint">
                  {t("modManager.trashHint", { days: TRASH_MAX_AGE_DAYS })}
                </span>
              </Hint>
              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <Hint content={lockedHint}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2.5 text-xs"
                    disabled={isBusy || Boolean(lockedHint)}
                    onClick={() => void restoreTrash()}
                  >
                    {t("modManager.trashRestore")}
                  </Button>
                </Hint>
                <Hint content={t("modManager.trashOpen")}>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7"
                    aria-label={t("modManager.trashOpen")}
                    onClick={() => void openTrashFolder()}
                  >
                    <FolderOpen className="size-3.5" />
                  </Button>
                </Hint>
                <Hint content={t("modManager.trashClear")}>
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
                </Hint>
                <Hint
                  content={t("modManager.trashHideHint")}
                  className="max-w-60"
                >
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-7"
                    aria-label={t("modManager.trashHide")}
                    onClick={hideTrashBar}
                  >
                    <EyeOff className="size-3.5" />
                  </Button>
                </Hint>
              </div>
            </div>
          )}

          {dragState && (
            <div
              ref={dropPanelRef}
              className="absolute right-3 bottom-3 left-3 z-10 flex max-h-[45%] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-popover/95 p-2 shadow-lg"
            >
              {dragState.groups.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
                  {dragState.groups.map((group) => (
                    <GroupDropZone
                      key={group.id}
                      icon={<Folder className="size-4" />}
                      label={group.name}
                      onDrop={() => groupActions.onDrop(group.id)}
                    />
                  ))}
                </div>
              )}
              <div className="flex shrink-0 gap-2">
                <GroupDropZone
                  icon={<FolderPlus className="size-4" />}
                  label={t("modGroups.newGroup")}
                  onDrop={dropToNewGroup}
                />
                {dragState.hasGrouped && (
                  <GroupDropZone
                    icon={<X className="size-4" />}
                    label={t("modGroups.ungroup")}
                    onDrop={() => groupActions.onDrop(UNGROUPED_ID)}
                  />
                )}
              </div>
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
            lockedHint={detailLockedHint}
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
            onAuthor={
              canFilterByAuthor(detailEntry.provider)
                ? (author) => filterByAuthor(detailEntry.provider, author)
                : undefined
            }
            onOpenLink={openProjectLink}
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
            relations={detailRelations}
            relationsScanning={relationsScanning}
            onLoadRelations={loadRelations}
            onOpenInstalled={openInstalled}
            isFavorite={isFavorite(modSets, detailEntry)}
            onToggleFavorite={
              favoriteItem ? () => void flipFavorite(favoriteItem) : undefined
            }
            onInstallElsewhere={
              favoriteItem && (detail?.project ?? detailEntry.project)
                ? () =>
                    openCatalogInstall({
                      kind: "project",
                      project: (detail?.project ?? detailEntry.project)!,
                    })
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}

function GroupDropZone({
  icon,
  label,
  onDrop,
}: {
  icon: ReactNode;
  label: string;
  onDrop: () => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <div
      data-over={isOver || undefined}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={(event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setIsOver(false);
      }}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsOver(false);
        onDrop();
      }}
      className="flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 px-3 text-xs font-medium text-muted-foreground transition-colors data-[over]:border-primary data-[over]:bg-primary-soft data-[over]:text-foreground [&>svg]:shrink-0"
    >
      {icon}
      <Hint content={label} variant="text" truncatedOnly>
        <span className="min-w-0 truncate">{label}</span>
      </Hint>
    </div>
  );
}
