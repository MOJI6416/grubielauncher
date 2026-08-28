import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hint } from "@renderer/components/Hint";
import {
  ArrowUp,
  ChevronRight,
  Cog,
  File,
  Folder,
  Home,
  Info,
  Globe,
  Loader2,
  Lock,
  PackageCheck,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { Loader } from "@/types/Loader";
import { cn } from "@/lib/utils";
import { motionTransition } from "@/lib/motion";
import { formatBytes } from "@renderer/utilities/file";
import { isOtherOverLimit } from "./publishPlan";
import {
  buildShareTrail,
  classifyBlockedSharePath,
  countSelectedInsideFolder,
  createForbiddenPathSet,
  filterSelectableSharePaths,
  getShareParentPath,
  getShareRelativePath,
  matchesShareQuery,
  selectShareFolderPath,
  selectSharePaths,
  shareRootLabel,
  splitSharePath,
  toggleSelectedSharePath,
  unselectShareFolderPath,
  type BlockedShareReason,
} from "@renderer/utilities/selectPaths";

const api = window.api;

const SIZE_SCAN_LIMIT = 200;
const SIZE_WORKERS = 4;

interface DirectoryEntry {
  path: string;
  type: "file" | "folder";
}

interface Listing {
  path: string;
  entries: DirectoryEntry[];
}

interface BrowserEntry extends DirectoryEntry {
  relativePath: string;
  blocked: BlockedShareReason | null;
}

const blockedIcons = {
  private: Lock,
  runtime: Cog,
  managed: PackageCheck,
  world: Globe,
} as const;

const blockedReasonKeys = {
  private: "selectPaths.reasonPrivate",
  runtime: "selectPaths.reasonRuntime",
  managed: "selectPaths.reasonManaged",
  world: "selectPaths.reasonWorld",
} as const;

const blockedTagKeys = {
  private: "selectPaths.tagPrivate",
  runtime: "selectPaths.tagRuntime",
  managed: "selectPaths.tagManaged",
  world: "selectPaths.tagWorld",
} as const;

export function SelectPathsPanel({
  pathFolder,
  selectedPaths,
  loader,
  version,
  onCancel,
  onApply,
}: {
  pathFolder: string;
  selectedPaths: string[];
  loader: Loader;
  version: string;
  onCancel: () => void;
  onApply: (paths: string[]) => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [paths, setPaths] = useState<string[]>(selectedPaths);
  const [listing, setListing] = useState<Listing | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [query, setQuery] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [entrySizes, setEntrySizes] = useState<Record<string, number | null>>(
    {},
  );
  const [selectedSize, setSelectedSize] = useState<number | null>(0);
  const [isSelectedSizeUnknown, setIsSelectedSizeUnknown] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const sizeCache = useRef(new Map<string, number | null>());
  const hasAutoFocused = useRef(false);

  const { t } = useTranslation();
  const transition = motionTransition(useReducedMotion());

  const sizeLabels = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  const forbiddenSet = useMemo(
    () => createForbiddenPathSet(version, loader),
    [version, loader],
  );

  const currentSegments = useMemo(
    () => currentPath.split("/").filter(Boolean),
    [currentPath],
  );

  const rootLabel = useMemo(() => shareRootLabel(pathFolder), [pathFolder]);
  const trail = useMemo(
    () => buildShareTrail(currentSegments),
    [currentSegments],
  );

  const listingPath = listing?.path ?? "";

  const toAbsolute = useCallback(
    (relativePath: string) =>
      relativePath
        ? api.path.join(pathFolder, ...relativePath.split("/"))
        : pathFolder,
    [pathFolder],
  );

  const entries = useMemo<BrowserEntry[]>(() => {
    if (!listing) return [];

    const mapped = listing.entries
      .filter((entry) => entry.path && !entry.path.startsWith("."))
      .map((entry) => {
        const relativePath = getShareRelativePath(listing.path, entry.path);
        return {
          ...entry,
          relativePath,
          blocked: classifyBlockedSharePath(relativePath, forbiddenSet),
        };
      });

    mapped.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    return mapped;
  }, [listing, forbiddenSet]);

  const openEntries = useMemo(
    () =>
      entries.filter(
        (entry) => !entry.blocked && matchesShareQuery(entry.path, query),
      ),
    [entries, query],
  );

  const blockedEntries = useMemo(
    () =>
      entries.filter(
        (entry) => entry.blocked && matchesShareQuery(entry.path, query),
      ),
    [entries, query],
  );

  const rows = useMemo(
    () => (showBlocked ? [...openEntries, ...blockedEntries] : openEntries),
    [openEntries, blockedEntries, showBlocked],
  );

  const selectablePaths = useMemo(
    () => openEntries.map((entry) => entry.relativePath),
    [openEntries],
  );

  const sortedPaths = useMemo(
    () => [...paths].sort((a, b) => a.localeCompare(b)),
    [paths],
  );

  useEffect(() => {
    setPaths(filterSelectableSharePaths(selectedPaths, forbiddenSet));
  }, [selectedPaths, forbiddenSet]);

  useEffect(() => {
    let cancelled = false;

    const loadEntries = async () => {
      if (!pathFolder) {
        setListing({ path: "", entries: [] });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const folderPath =
          currentSegments.length > 0
            ? api.path.join(pathFolder, ...currentSegments)
            : pathFolder;
        const loaded: DirectoryEntry[] =
          await api.fs.readdirWithTypes(folderPath);
        if (cancelled) return;

        setListing({ path: currentSegments.join("/"), entries: loaded });
      } catch {
        if (cancelled) return;
        setListing({ path: currentSegments.join("/"), entries: [] });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadEntries();
    return () => {
      cancelled = true;
    };
  }, [pathFolder, currentSegments]);

  useEffect(() => {
    const viewport = viewportRef.current?.closest(
      "[data-slot=scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = 0;
    setActiveIndex(0);
    setEntrySizes({});
  }, [listingPath]);

  useEffect(() => {
    if (entries.length === 0 || entries.length > SIZE_SCAN_LIMIT) return;

    let cancelled = false;
    const queue = entries.filter((entry) => !entry.blocked);

    const worker = async () => {
      while (queue.length > 0 && !cancelled) {
        const entry = queue.shift();
        if (!entry) return;

        const absolute = toAbsolute(entry.relativePath);
        const cached = sizeCache.current.get(absolute);

        if (cached !== undefined) {
          setEntrySizes((prev) => ({ ...prev, [entry.relativePath]: cached }));
          continue;
        }

        try {
          const size = await api.file.getTotalSizes([absolute]);
          if (cancelled) return;
          sizeCache.current.set(absolute, size);
          setEntrySizes((prev) => ({ ...prev, [entry.relativePath]: size }));
        } catch {
          if (cancelled) return;
        }
      }
    };

    void Promise.all(Array.from({ length: SIZE_WORKERS }, () => worker()));

    return () => {
      cancelled = true;
    };
  }, [entries, toAbsolute]);

  useEffect(() => {
    if (paths.length === 0) {
      setSelectedSize(0);
      setIsSelectedSizeUnknown(false);
      return;
    }

    let cancelled = false;
    setSelectedSize(null);
    setIsSelectedSizeUnknown(false);

    const timer = setTimeout(() => {
      api.file
        .getTotalSizes(paths.map(toAbsolute))
        .catch(() => null)
        .then((total) => {
          if (cancelled) return;
          setIsSelectedSizeUnknown(total === null);
          setSelectedSize(total ?? 0);
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paths, toAbsolute]);

  const focusRow = useCallback((index: number) => {
    setActiveIndex(index);
    const row = rowRefs.current[index];
    if (!row) return;
    row.focus({ preventScroll: true });
    row.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    if (hasAutoFocused.current || rows.length === 0) return;
    hasAutoFocused.current = true;
    rowRefs.current[0]?.focus({ preventScroll: true });
  }, [rows.length]);

  const isEverythingSelected =
    selectablePaths.length > 0 &&
    selectablePaths.every((pathName) => paths.includes(pathName));

  const toggleEntry = useCallback(
    (entry: BrowserEntry) => {
      if (entry.blocked) return;

      if (entry.type === "folder") {
        setPaths((prev) =>
          prev.includes(entry.relativePath)
            ? unselectShareFolderPath(prev, entry.relativePath)
            : selectShareFolderPath(prev, entry.relativePath),
        );
        return;
      }

      setPaths((prev) =>
        toggleSelectedSharePath(prev, entry.relativePath, forbiddenSet),
      );
    },
    [forbiddenSet],
  );

  const goUp = useCallback(() => {
    if (!currentPath) return;
    setQuery("");
    setCurrentPath(getShareParentPath(currentPath));
  }, [currentPath]);

  const openFolder = useCallback((relativePath: string) => {
    setQuery("");
    setCurrentPath(relativePath);
  }, []);

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(Math.min(activeIndex + 1, rows.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRow(Math.max(activeIndex - 1, 0));
        return;
      case "Home":
        event.preventDefault();
        focusRow(0);
        return;
      case "End":
        event.preventDefault();
        focusRow(rows.length - 1);
        return;
      case " ":
        event.preventDefault();
        if (rows[activeIndex]) toggleEntry(rows[activeIndex]);
        return;
      case "Enter": {
        event.preventDefault();
        const entry = rows[activeIndex];
        if (!entry || entry.blocked) return;
        if (entry.type === "folder") openFolder(entry.relativePath);
        else toggleEntry(entry);
        return;
      }
      case "ArrowRight": {
        const entry = rows[activeIndex];
        if (entry && !entry.blocked && entry.type === "folder") {
          event.preventDefault();
          openFolder(entry.relativePath);
        }
        return;
      }
      case "ArrowLeft":
      case "Backspace":
        if (currentPath) {
          event.preventDefault();
          goUp();
        }
        return;
      case "/":
        event.preventDefault();
        searchRef.current?.focus();
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      focusRow(0);
    }
  };

  const renderSize = (relativePath: string): ReactNode => {
    const size = entrySizes[relativePath];
    if (size === undefined) return null;

    return (
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
        {size === null ? "?" : formatBytes(size, sizeLabels, size < 1024 ? 0 : 1)}
      </span>
    );
  };

  const renderRow = (entry: BrowserEntry, index: number): ReactNode => {
    if (entry.blocked) {
      const BlockedIcon = blockedIcons[entry.blocked];

      return (
        <Hint
          key={entry.relativePath}
          content={t(blockedReasonKeys[entry.blocked])}
        >
          <div
            ref={(node) => {
              rowRefs.current[index] = node;
            }}
            role="option"
            aria-selected={false}
            aria-disabled
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            className="flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <BlockedIcon className="size-3.5 shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate">{entry.path}</span>
            <span className="shrink-0 text-[11px] text-faint">
              {t(blockedTagKeys[entry.blocked])}
            </span>
          </div>
        </Hint>
      );
    }

    const isSelected = paths.includes(entry.relativePath);
    const insideCount =
      entry.type === "folder" && !isSelected
        ? countSelectedInsideFolder(paths, entry.relativePath)
        : 0;
    const EntryIcon = entry.type === "folder" ? Folder : File;

    return (
      <div
        key={entry.relativePath}
        ref={(node) => {
          rowRefs.current[index] = node;
        }}
        role="option"
        aria-selected={isSelected}
        tabIndex={index === activeIndex ? 0 : -1}
        onFocus={() => setActiveIndex(index)}
        onClick={() => {
          if (entry.type === "folder") {
            openFolder(entry.relativePath);
            return;
          }
          toggleEntry(entry);
        }}
        className={cn(
          "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm outline-none transition-colors",
          "hover:bg-surface-3 focus-visible:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring/50",
          isSelected && "bg-surface-3/60",
        )}
      >
        <span
          className="flex shrink-0 items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            tabIndex={-1}
            aria-hidden
            checked={
              isSelected ? true : insideCount > 0 ? "indeterminate" : false
            }
            onCheckedChange={() => toggleEntry(entry)}
          />
        </span>

        <EntryIcon
          className={cn(
            "size-3.5 shrink-0",
            isSelected ? "text-foreground" : "text-faint",
          )}
        />
        <span className="min-w-0 flex-1 truncate">{entry.path}</span>

        {insideCount > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t("selectPaths.insideSelected", { count: insideCount })}
          </span>
        )}
        {renderSize(entry.relativePath)}
        {entry.type === "folder" && (
          <ChevronRight className="size-3.5 shrink-0 text-faint" />
        )}
      </div>
    );
  };

  const isOverLimit =
    selectedSize !== null &&
    !isSelectedSizeUnknown &&
    isOtherOverLimit(selectedSize);

  const emptyTitle = query
    ? t("selectPaths.searchEmpty")
    : blockedEntries.length > 0
      ? t("selectPaths.allHidden")
      : t("selectPaths.emptyFolder");

  const emptyHint = query
    ? t("selectPaths.searchEmptyHint")
    : blockedEntries.length > 0
      ? t("selectPaths.allHiddenHint")
      : t("selectPaths.emptyFolderHint");

  const selectAllButton = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={isLoading || selectablePaths.length === 0}
      onClick={() =>
        setPaths((prev) =>
          isEverythingSelected
            ? prev.filter((pathName) => !selectablePaths.includes(pathName))
            : selectSharePaths(prev, selectablePaths, forbiddenSet),
        )
      }
    >
      {isEverythingSelected
        ? t("selectPaths.clearAll")
        : t("selectPaths.selectAll")}
    </Button>
  );

  return (
    <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
      <div className="flex h-7 items-center gap-1.5 border-b border-border px-4 text-[11px] text-faint">
        <span className="min-w-0 truncate">{t("selectPaths.purpose")}</span>
        <Hint content={t("selectPaths.purposeHint")}>
          <Info className="size-3 shrink-0" />
        </Hint>
      </div>

      <div className="flex h-9 items-center gap-1.5 border-b border-border px-3 text-xs">
        <Hint content={t("selectPaths.up")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!currentPath}
            aria-label={t("selectPaths.up")}
            onClick={goUp}
          >
            <ArrowUp />
          </Button>
        </Hint>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5">
          <button
            type="button"
            className="flex min-w-0 shrink-0 items-center gap-1 rounded px-1 py-0.5 text-faint transition-colors hover:text-foreground"
            onClick={() => openFolder("")}
          >
            <Home className="size-3.5 shrink-0" />
            {currentSegments.length === 0 && rootLabel && (
              <span className="min-w-0 max-w-40 truncate text-foreground">
                {rootLabel}
              </span>
            )}
          </button>

          {trail.collapsed && (
            <>
              <ChevronRight className="size-3 shrink-0 text-faint" />
              <button
                type="button"
                className="shrink-0 rounded px-1 py-0.5 text-faint transition-colors hover:text-foreground"
                onClick={() => openFolder(trail.collapsed?.path ?? "")}
              >
                …
              </button>
            </>
          )}

          {trail.items.map((item, index) => (
            <span key={item.path} className="flex min-w-0 items-center">
              <ChevronRight className="size-3 shrink-0 text-faint" />
              <button
                type="button"
                className={cn(
                  "min-w-0 truncate rounded px-1 py-0.5 transition-colors hover:text-foreground",
                  index === trail.items.length - 1
                    ? "text-foreground"
                    : "text-faint",
                )}
                onClick={() => openFolder(item.path)}
              >
                {item.label}
              </button>
            </span>
          ))}
        </nav>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("selectPaths.search")}
            aria-label={t("selectPaths.search")}
            className="h-7 w-32 rounded-md pr-6 pl-6 text-xs shadow-none"
          />
          {query && (
            <button
              type="button"
              aria-label={t("selectPaths.clearSearch")}
              className="absolute top-1/2 right-1 flex size-4 -translate-y-1/2 items-center justify-center rounded text-faint transition-colors hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {selectAllButton}
      </div>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 px-3 py-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-2">
          <ScrollArea className="min-h-0 flex-1">
            <LazyMotion features={domAnimation}>
              <m.div
                ref={viewportRef}
                key={listingPath}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition}
                className={cn(
                  "p-1 transition-opacity",
                  isLoading && listing && "opacity-50",
                )}
              >
                {!listing ? (
                  <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t("selectPaths.loadingFolders")}
                  </div>
                ) : (
                  <div
                    ref={listRef}
                    role="listbox"
                    aria-multiselectable
                    aria-label={t("selectPaths.purpose")}
                    tabIndex={-1}
                    className="grid gap-px outline-none"
                    onKeyDown={handleListKeyDown}
                  >
                    {openEntries.map((entry, index) => renderRow(entry, index))}

                    {rows.length === 0 && (
                      <div className="flex h-40 flex-col items-center justify-center gap-1 px-6 text-center">
                        <p className="text-xs text-muted-foreground">
                          {emptyTitle}
                        </p>
                        <p className="text-[11px] text-faint">{emptyHint}</p>
                      </div>
                    )}

                    {showBlocked && blockedEntries.length > 0 && (
                      <div
                        className={cn(
                          "grid gap-px",
                          openEntries.length > 0 &&
                            "mt-1 border-t border-border pt-1",
                        )}
                      >
                        {blockedEntries.map((entry, index) =>
                          renderRow(entry, openEntries.length + index),
                        )}
                      </div>
                    )}
                  </div>
                )}
              </m.div>
            </LazyMotion>
          </ScrollArea>

          {blockedEntries.length > 0 && (
            <div className="flex h-9 shrink-0 items-center gap-2 border-t border-border px-3 text-[11px] text-faint">
              <span className="min-w-0 truncate">
                {t("selectPaths.hidden", { count: blockedEntries.length })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => setShowBlocked((prev) => !prev)}
              >
                {showBlocked
                  ? t("selectPaths.hideHidden")
                  : t("selectPaths.showHidden")}
              </Button>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-2 p-1">
          <div className="flex h-6 items-center gap-2 px-2 text-[11px] text-faint">
            <span className="min-w-0 truncate">
              {t("selectPaths.pickedTitle")}
            </span>
            {paths.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => setPaths([])}
              >
                {t("selectPaths.clearPicked")}
              </Button>
            )}
          </div>

          {paths.length === 0 ? (
            <p className="flex h-7 items-center px-2 text-[11px] text-faint">
              {t("selectPaths.nothingSelectedHint")}
            </p>
          ) : (
            <ScrollArea className="max-h-[84px]">
              <div className="grid gap-px">
                {sortedPaths.map((item) => {
                  const { folder, name } = splitSharePath(item);
                  const cachedSize = sizeCache.current.get(toAbsolute(item));

                  return (
                    <div
                      key={item}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-xs transition-colors hover:bg-surface-3"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center text-left"
                        onClick={() => openFolder(getShareParentPath(item))}
                      >
                        {folder && (
                          <span className="min-w-0 truncate text-faint">
                            {folder}
                          </span>
                        )}
                        <span className="shrink-0 truncate">{name}</span>
                      </button>
                      {cachedSize !== undefined && (
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                          {cachedSize === null
                            ? "?"
                            : formatBytes(cachedSize, sizeLabels, 1)}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("selectPaths.remove")}
                        onClick={() =>
                          setPaths((prev) =>
                            unselectShareFolderPath(prev, item),
                          )
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      <div className="flex h-14 items-center justify-between gap-3 border-t border-border bg-surface-2 px-4">
        {paths.length === 0 ? (
          <span className="truncate text-xs text-faint">
            {t("selectPaths.nothingSelected")}
          </span>
        ) : (
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-xs",
              isOverLimit ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <span className="shrink-0">
              {t("selectPaths.picked", { count: paths.length })}
            </span>
            <span className="shrink-0 text-faint">·</span>
            {selectedSize === null ? (
              <Loader2 className="size-3 shrink-0 animate-spin" />
            ) : (
              <span className="shrink-0 font-mono tabular-nums">
                {isSelectedSizeUnknown
                  ? "?"
                  : formatBytes(selectedSize, sizeLabels, 1)}
              </span>
            )}
            {isOverLimit && (
              <span className="truncate">· {t("selectPaths.overLimit")}</span>
            )}
          </span>
        )}

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onApply(filterSelectableSharePaths(paths, forbiddenSet))
            }
          >
            {t("common.choose")}
          </Button>
        </div>
      </div>
    </div>
  );
}
