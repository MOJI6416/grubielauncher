import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronRight,
  CloudDownload,
  Ellipsis,
  FolderPen,
  FolderPlus,
  FolderSearch,
  LayoutGrid,
  List,
  ListFilter,
  PackagePlus,
  Search,
  SearchX,
  Tag,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Version } from "@renderer/classes/Version";
import { Hint } from "@renderer/components/Hint";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { LoaderLabel, getLoaderInfo } from "@renderer/components/Loaders";
import {
  accountAtom,
  accountsAtom,
  isRunningAtom,
  networkAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
  versionsUnreadableAtom,
  pathsAtom,
} from "@renderer/stores/atoms";
import {
  assignToGroup,
  removeGroup,
  reorderGroups,
  toggleGroup,
  toggleUngrouped,
} from "@/shared/instancesFile";
import { patchSettings } from "@renderer/utilities/persistSettings";
import { isOwner, parseVersionOwner } from "@renderer/utilities/versionPure";
import { reloadInstanceLibrary } from "@renderer/utilities/version";
import type { InstancesView } from "@/types/Settings";
import type { InstanceTab } from "@renderer/navigation/routes";
import { navigate } from "@renderer/navigation/navigate";
import type { RunGameParams } from "@renderer/features/launch/types";
import { GroupDialog } from "./GroupDialog";
import { InstanceRow, InstanceTile } from "./InstanceCard";
import { OrphanFolders, useOrphanFolders } from "./OrphanFolders";
import { buildInstanceActions } from "./instanceActions";
import { instanceFlagsAtom } from "./atoms";
import {
  instanceGroupsAtom,
  instanceOrderAtom,
  instanceTagsAtom,
  instancesFileUnreadableAtom,
  ungroupedCollapsedAtom,
  updateInstancesFile,
} from "./instancesStore";
import { instanceLastLaunch } from "./contentCounts";
import {
  instanceLastLaunchAtom,
  instancePlaytimeAtom,
  instanceStatsAtom,
  runningSessionsAtom,
} from "./instanceStats";
import { openNewInstance } from "./newInstance";
import { resolveInstanceStatuses } from "./instanceStatus";
import { selectInstance } from "./selectInstance";
import {
  allTags as listTags,
  availableLoaders,
  instanceKey,
  reorderKeys,
} from "./selectors";
import { instanceUpdatesAtom } from "./updateCheck";
import { useInstanceUpdateCheck } from "./useInstanceUpdateCheck";
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_SORTS,
  LibraryFacet,
  LibraryFilters,
  LibrarySort,
  availableFacets,
  buildLibraryEntries,
  countFilters,
  listFilters,
  mergeManualOrder,
  moveFocus,
  selectLibrary,
  sortLibrary,
  toggleFilter,
} from "./library";

const api = window.api;

export function InstanceLibrary({
  runGame,
  onManageTags,
  onCreateGroup,
}: {
  runGame: (params: RunGameParams) => Promise<void>;
  onManageTags: (key: string, name: string) => void;
  onCreateGroup: () => void;
}) {
  const versions = useAtomValue(versionsAtom);
  const versionsLoaded = useAtomValue(versionsLoadedAtom);
  const versionsUnreadable = useAtomValue(versionsUnreadableAtom);
  const paths = useAtomValue(pathsAtom);
  const selected = useAtomValue(selectedVersionAtom);
  const account = useAtomValue(accountAtom);
  const accounts = useAtomValue(accountsAtom);
  const isLaunching = useAtomValue(isRunningAtom);
  const isNetwork = useAtomValue(networkAtom);
  const settings = useAtomValue(settingsAtom);
  const updates = useAtomValue(instanceUpdatesAtom);
  const tags = useAtomValue(instanceTagsAtom);
  const groups = useAtomValue(instanceGroupsAtom);
  const organizeUnreadable = useAtomValue(instancesFileUnreadableAtom);
  const manualOrder = useAtomValue(instanceOrderAtom);
  const isUngroupedCollapsed = useAtomValue(ungroupedCollapsedAtom);
  const playtime = useAtomValue(instancePlaytimeAtom);
  const lastLaunch = useAtomValue(instanceLastLaunchAtom);
  const stats = useAtomValue(instanceStatsAtom);
  const sessions = useAtomValue(runningSessionsAtom);
  const flags = useAtomValue(instanceFlagsAtom);
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
  const [pendingGroup, setPendingGroup] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renamingGroup, setRenamingGroup] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragKeyRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const view = settings.instancesView;
  const sort = settings.instancesSort as LibrarySort;
  const orphans = useOrphanFolders(versions);

  useInstanceUpdateCheck(versions, account, isNetwork);

  useEffect(() => {
    if (!versionsLoaded || versions.length === 0) return;

    const known = new Set(versions.map(instanceKey));
    if (manualOrder.every((key) => known.has(key))) return;

    updateInstancesFile((file) => ({
      ...file,
      order: file.order.filter((key) => known.has(key)),
    }));
  }, [versionsLoaded, versions, manualOrder]);

  const runningKeys = useMemo(() => {
    const names = new Set(sessions.map((session) => session.versionName));
    return versions
      .filter((version) => names.has(version.version.name))
      .map(instanceKey);
  }, [sessions, versions]);

  const visible = useMemo(
    () =>
      selectLibrary(versions, {
        query,
        filters,
        tags,
        updates,
        playtime,
        lastLaunch,
        runningKeys,
        sort,
        manualOrder,
      }),
    [
      versions,
      query,
      filters,
      tags,
      updates,
      playtime,
      lastLaunch,
      runningKeys,
      sort,
      manualOrder,
    ],
  );

  const isFiltering = query.trim().length > 0 || countFilters(filters) > 0;

  const entries = useMemo(
    () =>
      buildLibraryEntries(visible, groups, {
        ungroupedName: t("versions.groups.ungrouped"),
        ungroupedCollapsed: isUngroupedCollapsed,
        hideEmptyGroups: isFiltering,
        expandGroups: isFiltering,
      }),
    [visible, groups, isUngroupedCollapsed, isFiltering, t],
  );

  const loaders = useMemo(() => availableLoaders(versions), [versions]);
  const allTags = useMemo(
    () => listTags(tags, versions.map(instanceKey)),
    [tags, versions],
  );
  const hasUpdates = Object.values(updates).includes("behind");
  const facets = useMemo(
    () => availableFacets({ loaders, tags: allTags, hasUpdates }),
    [loaders, allTags, hasUpdates],
  );
  const facetCount = countFilters(facets);
  const hiddenCount = versions.length - visible.length;
  const activeFilters = listFilters(filters);
  const filterCount = countFilters(filters);
  const hasInstances = versions.length > 0;

  const facetLabel = (facet: LibraryFacet, value: string) =>
    facet === "loader"
      ? getLoaderInfo(value).name
      : facet === "state"
        ? t("versions.state.needsUpdate")
        : `#${value}`;

  const flip = (facet: LibraryFacet, value: string) =>
    setFilters((current) => toggleFilter(current, facet, value));

  const reset = () => {
    setQuery("");
    setFilters(EMPTY_LIBRARY_FILTERS);
  };

  const select = (instance: Version) => {
    void selectInstance(instance, account);
  };

  const open = (instance: Version, tab?: InstanceTab) => {
    select(instance);
    navigate({ name: "instance", id: instanceKey(instance), tab });
  };

  const play = (instance: Version) => {
    select(instance);
    void runGame({ version: instance });
  };

  const reorder = (fromKey: string, toKey: string) => {
    const visibleKeys = visible.map(instanceKey);
    const moved = reorderKeys(visibleKeys, fromKey, toKey);
    if (!moved) return;

    updateInstancesFile((file) => ({
      ...file,
      order: mergeManualOrder(
        sortLibrary(versions, {
          sort: "manual",
          manualOrder: file.order,
        }).map(instanceKey),
        visibleKeys,
        moved,
      ),
    }));
  };

  const groupIndex = (groupId: string | null) =>
    groups.findIndex((group) => group.id === groupId);

  const moveGroup = (groupId: string | null, delta: number) => {
    const from = groupIndex(groupId);
    if (from === -1) return;

    updateInstancesFile((file) => reorderGroups(file, from, from + delta));
  };

  const dropIntoGroup = (groupId: string | null) => {
    const key = dragKeyRef.current;
    dragKeyRef.current = null;
    setIsDragging(false);
    if (!key) return;
    updateInstancesFile((file) => assignToGroup(file, key, groupId));
  };

  const dragProps = (itemKey: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLElement>) => {
      dragKeyRef.current = itemKey;
      setIsDragging(true);
      event.dataTransfer.effectAllowed = "move";
      try {
        event.dataTransfer.setData("text/plain", itemKey);
      } catch {}
    },
    onDragEnd: () => setIsDragging(false),
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (sort !== "manual") return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (sort !== "manual") return;
      event.preventDefault();
      const from = dragKeyRef.current;
      dragKeyRef.current = null;
      setIsDragging(false);
      if (from && from !== itemKey) reorder(from, itemKey);
    },
  });

  const focusOption = (delta: number) => {
    const nodes = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );
    if (!nodes.length) return false;

    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = moveFocus(
      nodes.map((_, position) => String(position)),
      index === -1 ? null : String(index),
      delta,
    );
    if (next === null) return false;

    nodes[Number(next)].focus();
    return true;
  };

  const renderMenu = (instance: Version, itemKey: string) => {
    const isRunningInstance = runningKeys.includes(itemKey);

    return buildInstanceActions({
      instance,
      t,
      canPlay: !!account && !isLaunching,
      isRunningInstance,
      hasSaves: flags[itemKey]?.hasSaves === true,
      hasServer: flags[itemKey]?.hasServer === true,
      hasStatistics: flags[itemKey]?.hasStatistics === true,
      onPlay: () => play(instance),
      onPlayAnother: () => play(instance),
      onManageTags: () => onManageTags(itemKey, instance.version.name),
    });
  };

  const groupItems = (itemKey: string) => (
    <>
      <ContextMenuItem
        onSelect={() =>
          updateInstancesFile((file) => assignToGroup(file, itemKey, null))
        }
      >
        {t("versions.groups.none")}
      </ContextMenuItem>
      {groups.map((group) => (
        <ContextMenuItem
          key={group.id}
          onSelect={() =>
            updateInstancesFile((file) =>
              assignToGroup(file, itemKey, group.id),
            )
          }
        >
          {group.name}
        </ContextMenuItem>
      ))}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onCreateGroup}>
        <FolderPlus />
        <span>{t("versions.groups.create")}</span>
      </ContextMenuItem>
    </>
  );

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      {!versionsLoaded ? (
        <div className="mb-2.5 flex h-9 shrink-0 items-center gap-2">
          <Skeleton className="h-9 w-56 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-18 rounded-lg" />
          <Skeleton className="ml-auto h-9 w-32 rounded-lg" />
        </div>
      ) : (
        hasInstances && (
          <div className="mb-2.5 flex h-9 shrink-0 items-center gap-2">
            <div className="relative w-56 shrink-0">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <Input
                value={query}
                placeholder={t("versions.searchPlaceholder")}
                className="h-9 pl-8"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown") return;
                  if (focusOption(1)) event.preventDefault();
                }}
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-9 shrink-0">
                  <ListFilter />
                  {t("versions.filters.title")}
                  {filterCount > 0 && (
                    <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary-soft font-mono text-[0.6rem] text-foreground">
                      {filterCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {facetCount === 0 && (
                  <div className="px-2 py-2.5 text-center">
                    {organizeUnreadable ? (
                      <p className="flex items-start gap-1.5 text-left text-xs text-warning">
                        <TriangleAlert className="mt-px size-3.5 shrink-0" />
                        {t("versions.organizeLoadFailed")}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t("versions.filters.empty")}
                        </p>
                        <p className="mt-1 text-xs text-faint">
                          {t("versions.filters.emptyHint")}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {facets.loader.length > 0 && (
                  <>
                    <DropdownMenuLabel>
                      {t("versions.loader")}
                    </DropdownMenuLabel>
                    {facets.loader.map((loader) => (
                      <DropdownMenuCheckboxItem
                        key={`loader-${loader}`}
                        checked={filters.loader.includes(loader)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => flip("loader", loader)}
                      >
                        <LoaderLabel loader={loader} />
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}

                {facets.state.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={filters.state.includes("behind")}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={() => flip("state", "behind")}
                    >
                      <span className="flex items-center gap-2">
                        <CloudDownload className="size-3.5 text-warning" />
                        {t("versions.state.needsUpdate")}
                      </span>
                    </DropdownMenuCheckboxItem>
                  </>
                )}

                {facets.tag.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>
                      {t("versions.tags.manage")}
                    </DropdownMenuLabel>
                    {facets.tag.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={`tag-${tag}`}
                        checked={filters.tag.includes(tag)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => flip("tag", tag)}
                      >
                        <span className="flex items-center gap-2">
                          <Tag className="size-3.5 text-faint" />
                          {tag}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}

                {filterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setFilters(EMPTY_LIBRARY_FILTERS)}
                    >
                      <X />
                      <span>{t("versions.clearFilters")}</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-9 shrink-0">
                  <ArrowDownUp />
                  {t(`versions.sort.${sort}`)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(value) =>
                    void patchSettings({
                      instancesSort: value as (typeof LIBRARY_SORTS)[number],
                    }).catch((error) =>
                      showFailureToast(t("settings.saveFailed"), error, {
                        channels: ["fs:writeJSON"],
                      }),
                    )
                  }
                >
                  {LIBRARY_SORTS.map((option) => (
                    <DropdownMenuRadioItem key={option} value={option}>
                      {t(`versions.sort.${option}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onCreateGroup}>
                  <FolderPlus />
                  <span>{t("versions.groups.create")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
              {(["list", "grid"] as InstancesView[]).map((mode) => (
                <Hint
                  key={mode}
                  content={t(
                    mode === "list" ? "versions.viewList" : "versions.viewGrid",
                  )}
                >
                  <Button
                    size="icon-sm"
                    variant={view === mode ? "secondary" : "ghost"}
                    aria-label={t(
                      mode === "list"
                        ? "versions.viewList"
                        : "versions.viewGrid",
                    )}
                    onClick={() =>
                      void patchSettings({ instancesView: mode }).catch(
                        (error) =>
                          showFailureToast(t("settings.saveFailed"), error, {
                            channels: ["fs:writeJSON"],
                          }),
                      )
                    }
                  >
                    {mode === "list" ? (
                      <List className="size-4" />
                    ) : (
                      <LayoutGrid className="size-4" />
                    )}
                  </Button>
                </Hint>
              ))}
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {activeFilters.slice(0, 3).map(({ facet, value }) => (
                <Badge
                  key={`${facet}:${value}`}
                  variant="secondary"
                  className="shrink-0 gap-1 pr-1"
                >
                  <span className="max-w-28 truncate">
                    {facetLabel(facet, value)}
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-0.5 hover:bg-foreground/10"
                    aria-label={t("versions.clearFilters")}
                    onClick={() => flip(facet, value)}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              {activeFilters.length > 3 && (
                <span className="shrink-0 font-mono text-[0.7rem] text-faint">
                  +{activeFilters.length - 3}
                </span>
              )}
              {hiddenCount > 0 && (
                <Hint content={t("versions.clearFilters")} variant="text">
                  <button
                    type="button"
                    onClick={reset}
                    className="shrink-0 rounded text-[0.7rem] text-faint transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {t("home.hiddenByFilter", { count: hiddenCount })}
                  </button>
                </Hint>
              )}
            </div>

            <Button
              variant="secondary"
              className="h-9 shrink-0"
              data-focus-key="new-instance"
              disabled={!account}
              onClick={() => openNewInstance()}
            >
              <PackagePlus />
              {t("versions.create")}
            </Button>
          </div>
        )
      )}

      {!versionsLoaded ? (
        <div
          className={cn(
            "pr-2.5",
            view === "grid"
              ? "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
              : "flex flex-col gap-1.5",
          )}
        >
          {Array.from({ length: view === "grid" ? 8 : 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={cn(
                "w-full rounded-xl",
                view === "grid" ? "h-38" : "h-14",
              )}
            />
          ))}
        </div>
      ) : versionsUnreadable ? (
        <Empty className="min-h-0 flex-1 border border-destructive/40 bg-surface-2">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderSearch className="text-destructive" />
            </EmptyMedia>
            <EmptyTitle>{t("versions.libraryUnreadable")}</EmptyTitle>
          </EmptyHeader>
          <p className="max-w-md text-sm whitespace-pre-line text-muted-foreground">
            {versionsUnreadable}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => void reloadInstanceLibrary()}
            >
              {t("common.retry")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void api.shell.openPath(paths.minecraft)}
            >
              {t("common.openFolder")}
            </Button>
          </div>
        </Empty>
      ) : !hasInstances ? (
        <Empty className="min-h-0 flex-1 border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackagePlus />
            </EmptyMedia>
            <EmptyTitle>{t("versions.noVersions")}</EmptyTitle>
          </EmptyHeader>
          <p className="max-w-sm text-sm text-muted-foreground">
            {t("shell.emptyInstancesHint")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button
              data-focus-key="new-instance"
              disabled={!account}
              onClick={() => openNewInstance()}
            >
              <PackagePlus />
              {t("versions.create")}
            </Button>
            <Button
              variant="secondary"
              disabled={!account}
              onClick={async () => {
                const filePaths = await api.other.openFileDialog(false, [
                  { name: "Modpack", extensions: ["zip", "mrpack"] },
                ]);
                if (!filePaths.length) return;
                openNewInstance({ importFilePath: filePaths[0] });
              }}
            >
              {t("addVersion.tabs.fromFile")}
            </Button>
          </div>
        </Empty>
      ) : visible.length === 0 ? (
        <Empty className="min-h-0 flex-1 border border-dashed border-border bg-card">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>{t("versions.noResults")}</EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" className="mt-1" onClick={reset}>
            {t("versions.clearFilters")}
          </Button>
        </Empty>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div
            ref={listRef}
            role="listbox"
            aria-label={t("shell.nav.instances")}
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              if (focusOption(event.key === "ArrowDown" ? 1 : -1)) {
                event.preventDefault();
              }
            }}
            className={cn(
              "pr-2.5",
              view === "grid"
                ? "grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3"
                : "flex flex-col gap-1.5",
            )}
          >
            {entries.map((entry) => {
              if (entry.kind === "header") {
                return (
                  <div
                    key={entry.key}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      dropIntoGroup(entry.id);
                    }}
                    className={cn(
                      "sticky top-0 z-10 col-span-full mt-1.5 flex h-7 items-center gap-2 rounded-lg bg-background px-1 first:mt-0",
                      isDragging && "border border-dashed border-input",
                    )}
                  >
                    {isFiltering ? (
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-5">
                        <span className="truncate text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                          {entry.name}
                        </span>
                        <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                          {entry.count}
                        </span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          updateInstancesFile((file) =>
                            entry.id
                              ? toggleGroup(file, entry.id as string)
                              : toggleUngrouped(file),
                          )
                        }
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <ChevronRight
                          className={cn(
                            "size-3.5 shrink-0 text-faint transition-transform",
                            !entry.collapsed && "rotate-90",
                          )}
                        />
                        <span className="truncate text-[0.65rem] font-semibold tracking-[0.09em] text-faint uppercase">
                          {entry.name}
                        </span>
                        <span className="shrink-0 font-mono text-[0.65rem] text-faint">
                          {entry.count}
                        </span>
                      </button>
                    )}

                    {entry.id && (
                      <DropdownMenu>
                        <Hint content={t("common.more")}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="shrink-0 text-faint"
                              aria-label={`${t("common.more")} — ${entry.name}`}
                            >
                              <Ellipsis className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                        </Hint>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem
                            onSelect={() =>
                              setRenamingGroup({
                                id: entry.id as string,
                                name: entry.name,
                              })
                            }
                          >
                            <FolderPen />
                            <span>{t("versions.groups.rename")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={groupIndex(entry.id) <= 0}
                            onSelect={() => moveGroup(entry.id, -1)}
                          >
                            <ArrowUp />
                            <span>{t("versions.groups.moveUp")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={groupIndex(entry.id) >= groups.length - 1}
                            onSelect={() => moveGroup(entry.id, 1)}
                          >
                            <ArrowDown />
                            <span>{t("versions.groups.moveDown")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() =>
                              setPendingGroup({
                                id: entry.id as string,
                                name: entry.name,
                              })
                            }
                          >
                            <X />
                            <span>{t("versions.groups.remove")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              }

              const instance = entry.instance;
              const itemKey = entry.key;
              const ownerOk = isOwner(
                instance.version.owner,
                account ?? undefined,
                instance.version.ownerId,
              );
              const ownerInfo = ownerOk
                ? null
                : parseVersionOwner(instance.version.owner);
              const ownerAccount = ownerInfo
                ? accounts?.find(
                    (entry) =>
                      entry.type === ownerInfo.type &&
                      entry.nickname === ownerInfo.nickname,
                  )
                : undefined;

              const actions = renderMenu(instance, itemKey);

              const menu = (
                <DropdownMenu>
                  <Hint content={t("common.more")}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${t("common.more")} — ${instance.version.name}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                  </Hint>
                  <DropdownMenuContent
                    align="end"
                    className="w-56"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {actions.slice(1).map((group, index) => (
                      <div key={group[0]?.id ?? index}>
                        {index > 0 && <DropdownMenuSeparator />}
                        {group.map((action) => (
                          <DropdownMenuItem
                            key={action.id}
                            disabled={action.disabled}
                            onSelect={action.onSelect}
                          >
                            <action.icon />
                            <span>{action.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );

              const cardProps = {
                instance,
                itemKey,
                active: !!selected && instanceKey(selected) === itemKey,
                statuses: resolveInstanceStatuses({
                  running: runningKeys.includes(itemKey),
                  installed: instance.hasManifest,
                  update: updates[itemKey],
                  downloaded: instance.version.downloadedVersion,
                }),
                tags: tags[itemKey] ?? [],
                playtime: playtime[itemKey],
                lastLaunchedAt: instanceLastLaunch(
                  instance.version.lastLaunch,
                  stats[itemKey],
                ),
                ownerNickname: ownerInfo?.nickname,
                ownerImage: ownerAccount?.image,
                canPlay: !!account && !isLaunching,
                menu,
                onSelect: () => select(instance),
                onOpen: () => open(instance),
                onPlay: () => play(instance),
                dragProps: dragProps(itemKey),
              };

              return (
                <ContextMenu key={itemKey}>
                  <ContextMenuTrigger className="contents">
                    {view === "grid" ? (
                      <InstanceTile {...cardProps} />
                    ) : (
                      <InstanceRow {...cardProps} />
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    {actions.map((group, index) => (
                      <div key={group[0]?.id ?? index}>
                        {index > 0 && <ContextMenuSeparator />}
                        {group.map((action) => (
                          <ContextMenuItem
                            key={action.id}
                            disabled={action.disabled}
                            onSelect={action.onSelect}
                          >
                            <action.icon />
                            <span>{action.label}</span>
                          </ContextMenuItem>
                        ))}
                      </div>
                    ))}
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger>
                        <FolderPlus />
                        <span>{t("versions.groups.addTo")}</span>
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent>
                        {groupItems(itemKey)}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </ScrollArea>
      )}

      <Collapse show={versionsLoaded && orphans.length > 0}>
        {versionsLoaded && orphans.length > 0 ? (
          <div className="mt-2.5 flex">
            <OrphanFolders folders={orphans} />
          </div>
        ) : null}
      </Collapse>

      {renamingGroup && (
        <GroupDialog
          group={renamingGroup}
          onClose={() => setRenamingGroup(null)}
        />
      )}

      {pendingGroup && (
        <Confirmation
          title={t("versions.groups.remove")}
          onClose={() => setPendingGroup(null)}
          reversible={false}
          content={[
            {
              text: t("versions.groups.removeConfirm", {
                name: pendingGroup.name,
              }),
            },
            { text: t("versions.groups.removeKeep") },
          ]}
          buttons={[
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setPendingGroup(null),
            },
            {
              text: t("common.delete"),
              color: "danger",
              onClick: () => {
                updateInstancesFile((file) => {
                  const hadMembers = file.groups.some(
                    (group) =>
                      group.id === pendingGroup.id && group.keys.length > 0,
                  );
                  const next = removeGroup(file, pendingGroup.id);

                  return hadMembers && next.ungroupedCollapsed
                    ? toggleUngrouped(next)
                    : next;
                });
                setPendingGroup(null);
              },
            },
          ]}
        />
      )}
    </section>
  );
}
