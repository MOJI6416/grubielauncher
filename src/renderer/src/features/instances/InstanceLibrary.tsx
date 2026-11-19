import { DragEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CloudDownload,
  Ellipsis,
  FolderInput,
  FolderPen,
  FolderPlus,
  FolderSearch,
  LayoutGrid,
  Layers3,
  List,
  ListFilter,
  Rows4,
  PackagePlus,
  Search,
  SearchX,
  Tag,
  Trash2,
  TriangleAlert,
  UserPlus,
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
  ContextMenuShortcut,
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
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
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
import { LoaderLabel, getLoaderInfo } from "@renderer/components/Loaders";
import {
  accountAtom,
  accountsAtom,
  installActiveAtom,
  isRunningAtom,
  internetAtom,
  networkAtom,
  selectedVersionAtom,
  settingsAtom,
  versionsAtom,
  versionsLoadedAtom,
  versionsUnreadableAtom,
  pathsAtom,
} from "@renderer/stores/atoms";
import {
  type InstanceGroup,
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
import type { RunGameParams } from "@renderer/features/launch/types";
import { GroupDialog } from "./GroupDialog";
import { InstanceRow, InstanceTile } from "./InstanceCard";
import { OrphanFolders, useOrphanFolders } from "./OrphanFolders";
import { duplicateInstance } from "./duplicateInstance";
import { openPortDialog } from "@renderer/features/port/portStore";
import { buildInstanceActions } from "./instanceActions";
import { requestInstanceDelete } from "./deleteStore";
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
import { openInstanceScreen } from "./openInstanceScreen";
import {
  allTags as listTags,
  availableLoaders,
  instanceKey,
  reorderKeys,
} from "./selectors";
import { instanceUpdatesAtom } from "./updateCheck";
import { modpackUpdatesAtom } from "@renderer/features/modpack/modpackCatalog";
import { useModpackUpdateCheck } from "@renderer/features/modpack/useModpackSource";
import { useInstanceUpdateCheck } from "./useInstanceUpdateCheck";
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_SORTS,
  LibraryFacet,
  LibraryFilters,
  LibrarySort,
  availableFacets,
  buildLibraryEntries,
  sectionLibraryEntries,
  countFilters,
  listFilters,
  mergeManualOrder,
  moveFocus,
  selectLibrary,
  sortLibrary,
  toggleFilter,
} from "./library";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { SortMenu } from "@renderer/components/SortMenu";
import {
  RemovalItem,
  RemovalList,
} from "@renderer/components/RemovalCollapse";
import { showUndoToast } from "@renderer/utilities/undoToast";
import { openAddAccount } from "@renderer/features/accounts/addAccountRequest";

const api = window.api;

const VIEW_LABELS: Record<InstancesView, string> = {
  list: "versions.viewList",
  compact: "versions.viewCompact",
  grid: "versions.viewGrid",
};

const VIEW_MODES: InstancesView[] = ["list", "compact", "grid"];

type RemovedGroup = {
  group: InstanceGroup;
  index: number;
  ungroupedCollapsed: boolean;
};

function ViewIcon({ mode }: { mode: InstancesView }) {
  if (mode === "list") return <List className="size-4" />;
  if (mode === "compact") return <Rows4 className="size-4" />;
  return <LayoutGrid className="size-4" />;
}

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
  const isInstallActive = useAtomValue(installActiveAtom);
  const isNetwork = useAtomValue(networkAtom);
  const isInternetOnline = useAtomValue(internetAtom);
  const modpackUpdates = useAtomValue(modpackUpdatesAtom);
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
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_LIBRARY_FILTERS);
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
  useModpackUpdateCheck(versions, isInternetOnline);

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
  const instanceKeys = useMemo(
    () => new Set(versions.map(instanceKey)),
    [versions],
  );
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

  const open = (instance: Version, tab?: InstanceTab) =>
    openInstanceScreen(instance, account, {
      tab,
      morphFrom: `library:${instanceKey(instance)}`,
    });

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

  const deleteGroup = (groupId: string, name: string) => {
    let removed: RemovedGroup | null = null;

    updateInstancesFile((file) => {
      const index = file.groups.findIndex((group) => group.id === groupId);
      if (index === -1) return file;

      const group = file.groups[index];
      removed = {
        group,
        index,
        ungroupedCollapsed: file.ungroupedCollapsed === true,
      };
      const next = removeGroup(file, groupId);

      return group.keys.length > 0 && next.ungroupedCollapsed
        ? toggleUngrouped(next)
        : next;
    });

    const snapshot = removed as RemovedGroup | null;
    if (!snapshot) return;

    showUndoToast(t("versions.groups.removed", { name }), () =>
      updateInstancesFile((file) => {
        if (file.groups.some((group) => group.id === snapshot.group.id)) {
          return file;
        }

        const claimed = new Set(file.groups.flatMap((group) => group.keys));
        const groups = [...file.groups];
        groups.splice(Math.min(snapshot.index, groups.length), 0, {
          ...snapshot.group,
          keys: snapshot.group.keys.filter((key) => !claimed.has(key)),
        });
        const next = { ...file, groups };

        return snapshot.ungroupedCollapsed !== (next.ungroupedCollapsed === true)
          ? toggleUngrouped(next)
          : next;
      }),
    );
  };

  const groupActions = (groupId: string, name: string) => [
    {
      id: "rename",
      icon: FolderPen,
      label: t("versions.groups.rename"),
      disabled: false,
      destructive: false,
      onSelect: () => setRenamingGroup({ id: groupId, name }),
    },
    {
      id: "up",
      icon: ArrowUp,
      label: t("versions.groups.moveUp"),
      disabled: groupIndex(groupId) <= 0,
      destructive: false,
      onSelect: () => moveGroup(groupId, -1),
    },
    {
      id: "down",
      icon: ArrowDown,
      label: t("versions.groups.moveDown"),
      disabled: groupIndex(groupId) >= groups.length - 1,
      destructive: false,
      onSelect: () => moveGroup(groupId, 1),
    },
    {
      id: "delete",
      icon: Trash2,
      label: t("versions.groups.remove"),
      disabled: false,
      destructive: true,
      onSelect: () => deleteGroup(groupId, name),
    },
  ];

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
      onPlay: () => play(instance),
      onPlayAnother: () => play(instance),
      onManageTags: () => onManageTags(itemKey, instance.version.name),
      onDuplicate: () => void duplicateInstance(instance),
      onPort: () => openPortDialog(instance),
      onDelete: () => requestInstanceDelete(instance),
      account,
      isBusy: isLaunching || isInstallActive,
      deleteShortcut: "Del",
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
                    <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-info/15 font-mono text-3xs text-info">
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

            <SortMenu
              value={sort}
              options={LIBRARY_SORTS.map((option) => ({
                value: option,
                label: t(`versions.sort.${option}`),
              }))}
              onChange={(value) =>
                void patchSettings({ instancesSort: value }).catch((error) =>
                  showFailureToast(t("settings.saveFailed"), error, {
                    channels: ["fs:writeJSON"],
                  }),
                )
              }
              className="size-9"
            >
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onCreateGroup}>
                <FolderPlus />
                <span>{t("versions.groups.create")}</span>
              </DropdownMenuItem>
            </SortMenu>

            <SegmentedControl
              iconOnly
              value={view}
              ariaLabel={t("versions.viewLabel")}
              options={VIEW_MODES.map((mode) => ({
                value: mode,
                label: t(VIEW_LABELS[mode]),
                icon: <ViewIcon mode={mode} />,
              }))}
              onChange={(mode) =>
                void patchSettings({ instancesView: mode }).catch((error) =>
                  showFailureToast(t("settings.saveFailed"), error, {
                    channels: ["fs:writeJSON"],
                  }),
                )
              }
              className="h-9 p-1"
            />

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {activeFilters.slice(0, 3).map(({ facet, value }) => (
                <Badge
                  key={`${facet}:${value}`}
                  variant="secondary"
                  className="shrink-0 gap-1 pr-1"
                >
                  <Hint
                    content={facetLabel(facet, value)}
                    variant="text"
                    truncatedOnly
                  >
                    <span className="max-w-28 truncate">
                      {facetLabel(facet, value)}
                    </span>
                  </Hint>
                  <Hint content={t("versions.clearFilters")}>
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      aria-label={t("versions.clearFilters")}
                      onClick={() => flip(facet, value)}
                    >
                      <X className="size-3" />
                    </button>
                  </Hint>
                </Badge>
              ))}
              {activeFilters.length > 3 && (
                <span className="shrink-0 font-mono text-2xs text-faint">
                  +{activeFilters.length - 3}
                </span>
              )}
              {hiddenCount > 0 && (
                <Hint content={t("versions.clearFilters")} variant="text">
                  <button
                    type="button"
                    onClick={reset}
                    className="shrink-0 rounded text-2xs text-faint transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
              : view === "compact"
                ? "flex flex-col gap-1"
                : "flex flex-col gap-1.5",
          )}
        >
          {Array.from({ length: view === "grid" ? 8 : 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={cn(
                "w-full",
                view === "grid"
                  ? "h-38 rounded-xl"
                  : view === "compact"
                    ? "h-9 rounded-lg"
                    : "h-14 rounded-xl",
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
            <EmptyDescription className="max-w-sm">
              {account
                ? t("shell.emptyInstancesHint")
                : t("versions.emptyNoAccount")}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="max-w-none flex-row justify-center">
            {account ? (
              <>
                <Button
                  data-focus-key="new-instance"
                  onClick={() => openNewInstance()}
                >
                  <PackagePlus />
                  {t("versions.create")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => openNewInstance({ source: "catalog" })}
                >
                  <Layers3 />
                  {t("newInstance.sources.catalog")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const filePaths = await api.other.openFileDialog(false, [
                      { name: "Modpack", extensions: ["zip", "mrpack"] },
                    ]);
                    if (!filePaths.length) return;
                    openNewInstance({ importFilePath: filePaths[0] });
                  }}
                >
                  <FolderInput />
                  {t("addVersion.tabs.fromFile")}
                </Button>
              </>
            ) : (
              <Button onClick={openAddAccount}>
                <UserPlus />
                {t("accounts.addAccount")}
              </Button>
            )}
          </EmptyContent>
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
            className="flex flex-col gap-3 pr-2.5"
          >
            {sectionLibraryEntries(entries).map((section) => {
              const renderEntry = (entry: (typeof entries)[number]) => {
                if (entry.kind === "header") {
                  const header = (
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
                        "sticky top-0 z-10 flex h-7 shrink-0 items-center gap-2 bg-background px-1",
                        isDragging && "rounded-lg border border-dashed border-input",
                      )}
                    >
                      {isFiltering ? (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-5">
                          <Hint content={entry.name} variant="text" truncatedOnly>
                            <span className="truncate text-3xs font-semibold tracking-[0.09em] text-faint uppercase">
                              {entry.name}
                            </span>
                          </Hint>
                          <span className="shrink-0 font-mono text-3xs text-faint">
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
                          <Hint content={entry.name} variant="text" truncatedOnly>
                            <span className="truncate text-3xs font-semibold tracking-[0.09em] text-faint uppercase">
                              {entry.name}
                            </span>
                          </Hint>
                          <span className="shrink-0 font-mono text-3xs text-faint">
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
                            {groupActions(entry.id, entry.name).map((action) => (
                              <Fragment key={action.id}>
                                {action.destructive && <DropdownMenuSeparator />}
                                <DropdownMenuItem
                                  variant={action.destructive ? "destructive" : "default"}
                                  disabled={action.disabled}
                                  onSelect={action.onSelect}
                                >
                                  <action.icon />
                                  <span>{action.label}</span>
                                </DropdownMenuItem>
                              </Fragment>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );

                  if (!entry.id) return header;

                  return (
                    <ContextMenu key={entry.key}>
                      <ContextMenuTrigger asChild>{header}</ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        {groupActions(entry.id, entry.name).map((action) => (
                          <Fragment key={action.id}>
                            {action.destructive && <ContextMenuSeparator />}
                            <ContextMenuItem
                              variant={action.destructive ? "destructive" : "default"}
                              disabled={action.disabled}
                              onSelect={action.onSelect}
                            >
                              <action.icon />
                              <span>{action.label}</span>
                            </ContextMenuItem>
                          </Fragment>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
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
                const deleteAction = actions
                  .flat()
                  .find((action) => action.id === "delete");

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
                              variant={
                                action.destructive ? "destructive" : "default"
                              }
                              disabled={action.disabled}
                              onSelect={action.onSelect}
                            >
                              <action.icon />
                              <span>{action.label}</span>
                              {action.shortcut && (
                                <DropdownMenuShortcut>
                                  {action.shortcut}
                                </DropdownMenuShortcut>
                              )}
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
                    update:
                      updates[itemKey] ??
                      (modpackUpdates[itemKey] ? "behind" : undefined),
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
                  onDelete:
                    deleteAction && !deleteAction.disabled
                      ? deleteAction.onSelect
                      : undefined,
                  dragProps: dragProps(itemKey),
                };

                return (
                  <RemovalItem key={itemKey} itemKey={itemKey}>
                    <ContextMenu>
                      <ContextMenuTrigger className="contents">
                        {view === "grid" ? (
                          <InstanceTile {...cardProps} />
                        ) : (
                          <InstanceRow
                            {...cardProps}
                            compact={view === "compact"}
                          />
                        )}
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-56">
                        {actions.map((group, index) => (
                          <div key={group[0]?.id ?? index}>
                            {index > 0 && <ContextMenuSeparator />}
                            {group.map((action) => (
                              <ContextMenuItem
                                key={action.id}
                                variant={
                                  action.destructive ? "destructive" : "default"
                                }
                                disabled={action.disabled}
                                onSelect={action.onSelect}
                              >
                                <action.icon />
                                <span>{action.label}</span>
                                {action.shortcut && (
                                  <ContextMenuShortcut>
                                    {action.shortcut}
                                  </ContextMenuShortcut>
                                )}
                              </ContextMenuItem>
                            ))}
                            {index === 2 && (
                              <ContextMenuSub>
                                <ContextMenuSubTrigger>
                                  <FolderPlus />
                                  <span>{t("versions.groups.addTo")}</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent>
                                  {groupItems(itemKey)}
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                            )}
                          </div>
                        ))}
                      </ContextMenuContent>
                    </ContextMenu>
                  </RemovalItem>
                );
              };

              return (
                <div
                  key={section.key}
                  role={section.header ? "group" : undefined}
                  aria-label={section.header?.name}
                  className={cn(
                    "flex flex-col",
                    view === "grid"
                      ? "gap-3"
                      : view === "compact"
                        ? "gap-1"
                        : "gap-1.5",
                  )}
                >
                  {section.header && renderEntry(section.header)}
                  {view === "grid"
                    ? section.items.length > 0 && (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                          <RemovalList sourceKeys={instanceKeys}>
                            {section.items.map(renderEntry)}
                          </RemovalList>
                        </div>
                      )
                    : (
                        <RemovalList sourceKeys={instanceKeys}>
                          {section.items.map(renderEntry)}
                        </RemovalList>
                      )}
                </div>
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

    </section>
  );
}
