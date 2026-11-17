import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import {
  Archive,
  Earth,
  FolderOpen,
  Import,
  Loader2,
  Search,
  Skull,
  TriangleAlert,
} from "lucide-react";
import { IWorld } from "@/types/World";
import { ILocalProject } from "@/types/ModManager";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { PanelFallback } from "@renderer/components/PanelFallback";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SortMenu } from "@renderer/components/SortMenu";
import { SegmentedControl } from "@renderer/components/SegmentedControl";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { RunGameParams } from "@renderer/features/launch/types";
import { bumpInstanceDataRevision } from "@renderer/features/instances/instanceRevision";
import {
  consolesAtom,
  isOwnerVersionAtom,
  selectedVersionAtom,
} from "@renderer/stores/atoms";
import { formatBytes } from "@renderer/utilities/file";
import { formatRelative } from "@renderer/utilities/date";
import { showFailureToast } from "@renderer/utilities/failures";
import { worldDisplayStats } from "@renderer/utilities/worldStats";
import { toast } from "sonner";
import {
  availableWorldFilters,
  buildWorldList,
  countWorldFilters,
  duplicateWorldNames,
  matchesWorldQuery,
  pickSelectedFolder,
  WORLD_SORTS,
  WorldFilter,
  WorldSort,
} from "./worldsList";
import { useDatapackOptions, useWorldsData } from "./useWorldsData";
import { WorldDetail } from "./WorldDetail";
import { WorldIcon } from "./WorldIcon";
import { RemovalItem, RemovalList } from "@renderer/components/RemovalCollapse";
import { useWorldActions, WorldMenuItems } from "./worldActions";

const api = window.api;

export function Worlds({
  onClose,
  runGame,
  mods,
}: {
  onClose: (isFull?: boolean) => void;
  runGame: (params: RunGameParams) => Promise<void>;
  mods?: ILocalProject[];
}) {
  const version = useAtomValue(selectedVersionAtom);
  const isOwner = useAtomValue(isOwnerVersionAtom);
  const consoles = useAtomValue(consolesAtom);
  const { t, i18n } = useTranslation();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorldFilter>("all");
  const [sort, setSort] = useState<WorldSort>("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [renameRequest, setRenameRequest] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const keepFocusRef = useRef(false);

  const {
    worlds,
    setWorlds,
    status,
    sizes,
    backups,
    reload,
    reloadCounters,
    refreshWorld,
  } = useWorldsData(version);
  const datapackOptions = useDatapackOptions(version, mods);

  const sizeLabels = [
    t("sizes.0"),
    t("sizes.1"),
    t("sizes.2"),
    t("sizes.3"),
    t("sizes.4"),
  ];

  const playTime = useMemo(() => {
    const map: Record<string, number> = {};
    for (const world of worlds) {
      map[world.folderName] = worldDisplayStats(world.statistics).playTimeTicks;
    }
    return map;
  }, [worlds]);

  const items = useMemo(
    () =>
      buildWorldList({
        worlds,
        sizes,
        backups,
        playTime,
        query,
        filter,
        sort,
      }),
    [worlds, sizes, backups, playTime, query, filter, sort],
  );

  const searched = useMemo(
    () => worlds.filter((world) => matchesWorldQuery(world, query)),
    [worlds, query],
  );
  const filters = useMemo(() => availableWorldFilters(worlds), [worlds]);
  const filterCounts = useMemo(() => countWorldFilters(searched), [searched]);
  const ambiguousNames = useMemo(() => duplicateWorldNames(worlds), [worlds]);
  const worldPaths = useMemo(
    () => new Set(worlds.map((world) => world.path)),
    [worlds],
  );

  const revealWorld = useCallback((folderName: string) => {
    setQuery("");
    setFilter("all");
    setSelected(folderName);
  }, []);

  const selectedFolder = pickSelectedFolder(items, selected);
  const selectedWorld =
    worlds.find((world) => world.folderName === selectedFolder) ?? null;

  const isVersionRunning = consoles.consoles.some(
    (gameConsole) =>
      gameConsole.versionName === version?.version.name &&
      gameConsole.status === "running",
  );

  const onWorldRemoved = useCallback(
    (world: IWorld) => {
      setWorlds((previous) =>
        previous.filter((entry) => entry.path !== world.path),
      );
      setSelected(null);
      void reloadCounters();
      bumpInstanceDataRevision();
    },
    [reloadCounters, setWorlds],
  );

  const actions = useWorldActions({
    version,
    isOwner,
    isVersionRunning,
    takenNames: worlds.map((entry) => entry.name),
    onRemoved: onWorldRemoved,
    onRestored: (world) => {
      revealWorld(world.folderName);
      bumpInstanceDataRevision();
    },
    onDuplicated: (folderName) => {
      revealWorld(folderName);
      bumpInstanceDataRevision();
    },
    onPatched: (world, patch) =>
      setWorlds((previous) =>
        previous.map((entry) =>
          entry.path === world.path ? { ...entry, ...patch } : entry,
        ),
      ),
  });

  const requestRename = useCallback((world: IWorld) => {
    keepFocusRef.current = true;
    setSelected(world.folderName);
    setRenameRequest(world.path);
  }, []);
  const onRenameHandled = useCallback(() => setRenameRequest(null), []);

  const isResultWave = useEntranceWave(status === "loading");

  const importBlockedReason = isVersionRunning
    ? t("worlds.disabledWhileRunning")
    : !isOwner
      ? t("worlds.notOwnerHint")
      : undefined;

  const handleImport = useCallback(async () => {
    if (!version) return;

    const picked = await api.other.openFileDialog(false, [
      { name: "Minecraft world", extensions: ["zip"] },
    ]);
    if (!picked?.length) return;

    setIsImporting(true);

    try {
      const result = await api.worlds.import(picked[0], version.versionPath);

      if (result?.ok) {
        toast.success(t("worlds.imported", { name: result.name }));
        revealWorld(api.path.basename(result.path));
        bumpInstanceDataRevision();
      } else {
        showFailureToast(t("worlds.importError"), undefined, {
          channels: ["worlds:import"],
          fallbackDescription: t(
            `worlds.transferErrors.${result?.error ?? "failed"}`,
          ),
        });
      }
    } catch (error) {
      showFailureToast(t("worlds.importError"), error);
    } finally {
      setIsImporting(false);
    }
  }, [revealWorld, t, version]);

  const handleKeyNav = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Delete") {
        if (!selectedWorld || actions.isLocked(selectedWorld)) return;
        event.preventDefault();
        void actions.remove(selectedWorld);
        return;
      }

      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      event.preventDefault();
      const index = items.findIndex(
        (item) => item.world.folderName === selectedFolder,
      );
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const target = items[Math.max(0, Math.min(items.length - 1, next))];

      if (target) setSelected(target.world.folderName);
    },
    [actions, items, selectedFolder, selectedWorld],
  );

  const openSaves = async () => {
    if (!version) return;

    try {
      const savesPath = api.path.join(version.versionPath, "saves");
      await api.fs.ensure(savesPath);
      await api.shell.openPath(savesPath);
    } catch (error) {
      showFailureToast(t("worlds.openSavesError"), error, {
        channels: ["fs:ensure", "shell:openPath"],
      });
    }
  };

  if (!version) return null;

  if (status === "loading") {
    return <PanelFallback variant="rail" />;
  }

  if (status === "error") {
    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlert />
          </EmptyMedia>
          <EmptyTitle>{t("worlds.loadError")}</EmptyTitle>
          <EmptyDescription>{t("worlds.loadErrorHint")}</EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          {t("common.retry")}
        </Button>
      </Empty>
    );
  }

  if (!worlds.length) {
    return (
      <Empty className="h-full border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Earth />
          </EmptyMedia>
          <EmptyTitle>{t("worlds.noWorlds")}</EmptyTitle>
          <EmptyDescription>{t("worlds.noWorldsHint")}</EmptyDescription>
        </EmptyHeader>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isImporting || Boolean(importBlockedReason)}
            onClick={() => void handleImport()}
          >
            {isImporting ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Import className="size-3.5" />
            )}
            {t("worlds.import")}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void openSaves()}
          >
            <FolderOpen className="size-3.5" />
            {t("worlds.openSaves")}
          </Button>
        </div>

        {importBlockedReason && (
          <p className="text-2xs text-faint">{importBlockedReason}</p>
        )}
      </Empty>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[16.5rem_minmax(0,1fr)] gap-3">
      <div className="flex min-h-0 flex-col gap-2 rounded-xl border bg-card p-2">
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              className="h-8 pl-7 text-xs"
              placeholder={t("worlds.search")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <SortMenu
            value={sort}
            options={WORLD_SORTS.map((option) => ({
              value: option,
              label: t(`worlds.sortBy.${option}`),
            }))}
            onChange={setSort}
          />
        </div>

        {filters.length > 1 && (
          <SegmentedControl
            value={filter}
            ariaLabel={t("worlds.filterLabel")}
            className="flex-wrap"
            options={filters.map((option) => ({
              value: option,
              label: t(`worlds.filters.${option}`),
              count: filterCounts[option],
            }))}
            onChange={setFilter}
          />
        )}

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div
            ref={listRef}
            tabIndex={0}
            role="listbox"
            aria-label={t("worlds.title")}
            onKeyDown={handleKeyNav}
            className={cn(
              "flex flex-col gap-0.5 pr-1 outline-none",
              isResultWave && "result-wave",
            )}
          >
            {items.length === 0 && (
              <Empty className="gap-3 p-4">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>{t("worlds.notFound")}</EmptyTitle>
                </EmptyHeader>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  {t("worlds.resetFilters")}
                </Button>
              </Empty>
            )}

            <RemovalList sourceKeys={worldPaths}>
              {items.map((item, index) => {
                const world = item.world;
                const isActive = world.folderName === selectedFolder;

                return (
                  <RemovalItem key={world.path} itemKey={world.path}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          data-wave-row
                          style={{ "--wave-index": index } as CSSProperties}
                          onClick={() => setSelected(world.folderName)}
                          onContextMenu={() => setSelected(world.folderName)}
                          className="flex w-full min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-row-hover aria-selected:bg-row-selected"
                        >
                          <WorldIcon
                            icon={world.icon}
                            size={36}
                            className="size-9 rounded-md"
                            iconClassName="size-4"
                          />

                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="flex min-w-0 items-center gap-1">
                              {world.hardcore && (
                                <Skull className="size-3 shrink-0 text-destructive" />
                              )}
                              <Hint
                                content={world.name}
                                variant="text"
                                truncatedOnly
                              >
                                <span className="truncate text-xs font-medium">
                                  {world.name}
                                </span>
                              </Hint>
                              {ambiguousNames.has(world.name) &&
                                world.name !== world.folderName && (
                                  <Hint
                                    content={world.folderName}
                                    variant="text"
                                    truncatedOnly
                                  >
                                    <span className="max-w-20 shrink-0 truncate font-mono text-3xs text-faint">
                                      {world.folderName}
                                    </span>
                                  </Hint>
                                )}
                            </span>

                            <span className="flex min-w-0 items-center gap-1 font-mono text-3xs text-faint">
                              <Hint
                                content={
                                  world.lastPlayed
                                    ? formatRelative(new Date(world.lastPlayed))
                                    : t("worlds.neverPlayed")
                                }
                                variant="text"
                                truncatedOnly
                              >
                                <span className="min-w-0 truncate">
                                  {world.lastPlayed
                                    ? formatRelative(new Date(world.lastPlayed))
                                    : t("worlds.neverPlayed")}
                                </span>
                              </Hint>
                              {item.sizeBytes !== null && (
                                <>
                                  <span aria-hidden>·</span>
                                  <span className="shrink-0">
                                    {formatBytes(item.sizeBytes, sizeLabels, 1)}
                                  </span>
                                </>
                              )}
                            </span>
                          </span>

                          {item.backups > 0 && (
                            <Hint content={t("worldBackups.title")}>
                              <span className="flex shrink-0 items-center gap-0.5 font-mono text-3xs text-faint">
                                <Archive className="size-3" />
                                {item.backups}
                              </span>
                            </Hint>
                          )}
                        </button>
                      </ContextMenuTrigger>
                      <ContextMenuContent
                        className="w-56"
                        onCloseAutoFocus={(event) => {
                          if (!keepFocusRef.current) return;
                          keepFocusRef.current = false;
                          event.preventDefault();
                        }}
                      >
                        <WorldMenuItems
                          menu="context"
                          world={world}
                          version={version}
                          isOwner={isOwner}
                          isVersionRunning={isVersionRunning}
                          actions={actions}
                          onRename={() => requestRename(world)}
                        />
                      </ContextMenuContent>
                    </ContextMenu>
                  </RemovalItem>
                );
              })}
            </RemovalList>
          </div>
        </div>

        {importBlockedReason && (
          <Hint content={importBlockedReason} variant="text" truncatedOnly>
            <p className="shrink-0 truncate px-1.5 text-3xs text-faint">
              {importBlockedReason}
            </p>
          </Hint>
        )}

        <div className="flex shrink-0 items-center gap-1 border-t pt-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 min-w-0 flex-1 justify-start bg-transparent px-1.5 text-xs text-muted-foreground"
            disabled={isImporting || Boolean(importBlockedReason)}
            onClick={() => void handleImport()}
          >
            {isImporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Import className="size-3.5" />
            )}
            <Hint content={t("worlds.import")} variant="text" truncatedOnly>
              <span className="truncate">{t("worlds.import")}</span>
            </Hint>
          </Button>

          <Hint content={t("worlds.openSaves")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={t("worlds.openSaves")}
              onClick={() => void openSaves()}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          </Hint>
        </div>
      </div>

      {selectedWorld ? (
        <WorldDetail
          key={selectedWorld.path}
          world={selectedWorld}
          version={version}
          isOwner={isOwner}
          isVersionRunning={isVersionRunning}
          sizeBytes={
            typeof sizes[selectedWorld.folderName] === "number"
              ? sizes[selectedWorld.folderName]
              : null
          }
          backupCount={backups[selectedWorld.folderName] ?? 0}
          takenNames={worlds.map((entry) => entry.name)}
          datapackOptions={datapackOptions}
          locale={i18n.resolvedLanguage || i18n.language}
          actions={actions}
          renameRequested={renameRequest === selectedWorld.path}
          onRenameHandled={onRenameHandled}
          onPlay={() => {
            void runGame({
              version,
              quick: { single: selectedWorld.folderName },
            });
            onClose(true);
          }}
          onRenamed={(nextPath) => {
            revealWorld(api.path.basename(nextPath));
            bumpInstanceDataRevision();
          }}
          onRefresh={() => {
            void refreshWorld(selectedWorld.path);
            void reloadCounters();
            bumpInstanceDataRevision();
          }}
          onWorldPatched={(patch) =>
            setWorlds((previous) =>
              previous.map((entry) =>
                entry.path === selectedWorld.path
                  ? { ...entry, ...patch }
                  : entry,
              ),
            )
          }
        />
      ) : (
        <div className="flex items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
          {t("worlds.selectWorld")}
        </div>
      )}
    </div>
  );
}
