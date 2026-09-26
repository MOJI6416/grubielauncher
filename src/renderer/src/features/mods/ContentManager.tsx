import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import { toast } from "sonner";
import {
  CheckCheck,
  CircleAlert,
  CircleArrowUp,
  CloudOff,
  Copy,
  Database,
  Earth,
  EyeOff,
  FilePlus2,
  FolderInput,
  FolderOpen,
  Library,
  ListFilter,
  ListRestart,
  Loader2,
  Package,
  PackageOpen,
  Palette,
  Pin,
  PinOff,
  Plug,
  PowerOff,
  Puzzle,
  RotateCw,
  ScanSearch,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  DependencyType,
  IAddedLocalProject,
  ILocalIdentifyMatch,
  ILocalProject,
  IModpack,
  IProject,
  IVersion as ModVersion,
  IVersionDependency,
  ProjectType,
  Provider,
} from "@/types/ModManager";
import { IVersion } from "@/types/IVersion";
import { Loader } from "@/types/Loader";
import { DownloaderInfo } from "@/types/Downloader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapse } from "@/components/ui/collapse";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  accountAtom,
  internetAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import {
  MatchableProject,
  buildInstalledIndex,
  findInstalledProject,
  getProjectTypes,
  planDeletion,
  sharesFile,
} from "@renderer/utilities/mod";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  getLocalPathFromFileUrl,
  toFileUrl,
} from "@renderer/utilities/exportVersion";
import {
  BlockedMods,
  IBlockedMod,
} from "@renderer/components/Modals/BlockedMods";
import { LoaderLabel, getLoaderInfo } from "@renderer/components/Loaders";
import { AskAgentButton } from "@renderer/features/agent/AskAgentButton";
import { AI_PROMPT_MAX_CHARS } from "@/shared/config";
import {
  ContentEntry,
  buildLibraryEntries,
  entryKey,
  fromCatalogProject,
  isSameLocalProject,
  canToggleType,
  withInstalled,
} from "./entries";
import {
  LIBRARY_FACETS,
  LIBRARY_SORTS,
  LibraryFacet,
  LibrarySort,
  buildCatalogChips,
  catalogFilterKey,
  catalogFilterLabel,
  categoryLocaleKey,
  humanizeFilterName,
  countLibraryFacets,
  filterLibraryEntries,
  findDuplicates,
  sortLibraryEntries,
  toggleValue,
} from "./filters";
import {
  applyUpdates,
  isCheckableProject,
  planQuickInstall,
  toLocalProject,
} from "./updates";
import { useCatalogMeta, useCatalogSearch } from "./useCatalogSearch";
import { useUpdateCheck } from "./useUpdateCheck";
import { toggleModFile, useModFileStates } from "./useModFileStates";
import {
  folderNameForType,
  forgetAllModFiles,
  forgetModFiles,
  listModFiles,
} from "./modFiles";
import {
  TRASH_MAX_AGE_DAYS,
  TrashEntry,
  listTrash,
  trashFolder,
  trashPaths,
} from "./trash";
import { useDetailPanelWidth } from "./detailWidth";
import { Confirmation } from "@renderer/components/Modals/Confirmation";
import { installQueue } from "@renderer/features/install/installQueue";
import { ContentRow, ROW_HEIGHT } from "./ContentRow";
import { ContentDetails, DetailProgress } from "./ContentDetails";
import { withExtractProgress } from "@renderer/utilities/archiveProgress";
import { ImportLocalDialog, ImportMode } from "./ImportLocalDialog";
import { IdentifyLocalDialog, IdentifyReport } from "./IdentifyLocalDialog";
import { isIdentifiable, linkIdentified } from "./identify";
import {
  catalogLoaderOptions,
  hasConnector,
  needsConnector,
} from "./catalogLoader";
import {
  LOCAL_IMPORT_EXTENSIONS,
  buildImportEntry,
  buildInvalidEntry,
  findForeignFiles,
  isImportableFileName,
  mapWithConcurrency,
} from "./localImport";

const api = window.api;

const RUNNING_ALLOWED_TYPES = [ProjectType.RESOURCEPACK, ProjectType.SHADER];

const PROJECT_TYPE_ICONS: Partial<Record<ProjectType, typeof Puzzle>> = {
  [ProjectType.MOD]: Puzzle,
  [ProjectType.RESOURCEPACK]: Palette,
  [ProjectType.SHADER]: Sparkles,
  [ProjectType.DATAPACK]: Database,
  [ProjectType.WORLD]: Earth,
  [ProjectType.PLUGIN]: Plug,
};

const TRASH_HIDDEN_KEY = "grubie:trashBarHidden:";

function readTrashHiddenAt(instancePath: string): number {
  try {
    return Number(localStorage.getItem(TRASH_HIDDEN_KEY + instancePath)) || 0;
  } catch {
    return 0;
  }
}

function writeTrashHiddenAt(instancePath: string, at: number) {
  try {
    localStorage.setItem(TRASH_HIDDEN_KEY + instancePath, String(at));
  } catch {}
}
const LOCAL_IMPORT_CONCURRENCY = 4;

type Scope = "library" | Provider.CURSEFORGE | Provider.MODRINTH;

interface DetailState {
  entry: ContentEntry;
  project: IProject | null;
  versions: ModVersion[];
  selectedVersionId: string | null;
  isLoading: boolean;
  error: boolean;
  depsError: boolean;
}

function toModVersion(mod: ILocalProject): ModVersion[] {
  if (!mod.version) return [];
  return [
    {
      id: mod.version.id,
      name: mod.version.files[0]?.filename ?? mod.version.id,
      dependencies: [],
      downloads: -1,
      files: mod.version.files,
    },
  ];
}

export function ContentManager({
  mods,
  setMods,
  onClose,
  version,
  loader,
  isModpacks,
  setVersion,
  setLoader,
  setModpack,
  pendingRemovedLocalProjects,
  setPendingRemovedLocalProjects,
  running = false,
  versionPath,
  canEdit: canEditProp,
}: {
  mods: ILocalProject[];
  setMods: (mods: ILocalProject[]) => void;
  onClose: (modpack?: IModpack) => void;
  version: IVersion | undefined;
  loader: Loader | undefined;
  isModpacks: boolean;
  setVersion: (version: IVersion | undefined) => void;
  setLoader: (loader: Loader | undefined) => void;
  setModpack: (modpack: IModpack) => void;
  pendingRemovedLocalProjects?: ILocalProject[];
  setPendingRemovedLocalProjects?: Dispatch<SetStateAction<ILocalProject[]>>;
  running?: boolean;
  versionPath?: string;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const translateCategory = useCallback(
    (key: string, fallback: string) => t(key, { defaultValue: fallback }),
    [t],
  );

  const settings = useAtomValue(settingsAtom);
  const account = useAtomValue(accountAtom);
  const paths = useAtomValue(pathsAtom);
  const server = useAtomValue(serverAtom);
  const selectedVersion = useAtomValue(selectedVersionAtom);
  const isDownloadedVersion = useAtomValue(isDownloadedVersionAtom);
  const isOwnerVersion = useAtomValue(isOwnerVersionAtom);
  const isOnline = useAtomValue(internetAtom);

  const lang = settings.lang || "en";
  const sizeUnits = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  const isSelectedInstance =
    Boolean(versionPath) && versionPath === selectedVersion?.versionPath;
  const instancePath = isSelectedInstance ? versionPath : undefined;
  const canEdit =
    canEditProp ??
    (isSelectedInstance ? !isDownloadedVersion && isOwnerVersion : true);
  const canBrowse = isModpacks || (canEdit && isOnline);

  const [internalPending, setInternalPending] = useState<ILocalProject[]>([]);
  const pendingRemoved = pendingRemovedLocalProjects ?? internalPending;
  const setPendingRemoved =
    setPendingRemovedLocalProjects ?? setInternalPending;

  const projectTypes = useMemo(() => {
    if (isModpacks) return [ProjectType.MODPACK];
    const types = getProjectTypes(
      loader || "vanilla",
      server,
      Provider.CURSEFORGE,
    );
    return running
      ? types.filter((type) => RUNNING_ALLOWED_TYPES.includes(type))
      : types;
  }, [isModpacks, loader, server, running]);

  const [scope, setScope] = useState<Scope>(
    isModpacks ? Provider.CURSEFORGE : "library",
  );
  const [projectType, setProjectType] = useState<ProjectType>(
    () => projectTypes[0] ?? ProjectType.MOD,
  );
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [librarySort, setLibrarySort] = useState<LibrarySort>("name");
  const [libraryFacets, setLibraryFacets] = useState<LibraryFacet[]>([]);
  const [catalogSort, setCatalogSort] = useState("");
  const [catalogFilters, setCatalogFilters] = useState<string[]>([]);
  const [catalogLoader, setCatalogLoader] = useState<Loader | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [detailStack, setDetailStack] = useState<ContentEntry[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [fileRevision, setFileRevision] = useState(0);
  const [importing, setImporting] = useState<IAddedLocalProject[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>("import");
  const [importProgress, setImportProgress] = useState(0);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDropActive, setIsDropActive] = useState(false);
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [downloadInfo, setDownloadInfo] = useState<DownloaderInfo | null>(null);
  const [modpackStage, setModpackStage] = useState<
    "download" | "extract" | null
  >(null);
  const [extractPercent, setExtractPercent] = useState<number | null>(null);

  useEffect(() => {
    if (!modpackStage) setExtractPercent(null);
  }, [modpackStage]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [gameVersions, setGameVersions] = useState<IVersion[]>([]);
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([]);
  const [trashHiddenAt, setTrashHiddenAt] = useState(0);
  const [isClearTrashOpen, setIsClearTrashOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const detailWidth = useDetailPanelWidth(splitRef);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyReport, setIdentifyReport] = useState<IdentifyReport | null>(
    null,
  );
  const [folderState, setFolderState] = useState<{
    projectType: ProjectType;
    listing: Set<string>;
    managed: Partial<Record<ProjectType, string[]>> | null;
  } | null>(null);

  const [listElement, setListElement] = useState<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const detailRequestRef = useRef(0);
  const translationsRef = useRef(
    new Map<string, { description?: string; body?: string }>(),
  );

  useEffect(() => {
    if (projectTypes.includes(projectType)) return;
    setProjectType(projectTypes[0] ?? ProjectType.MOD);
  }, [projectTypes, projectType]);

  useEffect(() => {
    if (!canBrowse && scope !== "library") setScope("library");
  }, [canBrowse, scope]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(rawQuery), 350);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  useEffect(() => {
    const unsubscribe = api.events.onDownloaderInfo(setDownloadInfo);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!instancePath) return;

    forgetAllModFiles(instancePath);
    setFileRevision((value) => value + 1);
  }, [instancePath]);

  useEffect(() => {
    return installQueue.subscribeSettled(() => {
      if (!instancePath) return;

      void forgetModFiles(instancePath, projectType).then(() =>
        setFileRevision((value) => value + 1),
      );
    });
  }, [projectType, instancePath]);

  useEffect(() => {
    if (!isModpacks) return;
    let cancelled = false;

    api.versions
      .getList("vanilla")
      .then((list) => {
        if (!cancelled) setGameVersions(list ?? []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isModpacks]);

  const catalogProvider =
    scope === "library" ? Provider.CURSEFORGE : (scope as Provider);

  const meta = useCatalogMeta(
    catalogProvider,
    projectType,
    scope !== "library",
  );

  useEffect(() => {
    setCatalogSort(meta.sorts[0] ?? "");
    setCatalogFilters([]);
  }, [meta.sorts, catalogProvider, projectType]);

  const resolvedLoader = useMemo(() => {
    if (isModpacks) return loader;
    if (projectType === ProjectType.PLUGIN && server)
      return server.core as unknown as Loader;
    return loader;
  }, [isModpacks, loader, projectType, server]);

  const loaderOptions = useMemo(
    () => (isModpacks ? [] : catalogLoaderOptions(loader, projectType)),
    [isModpacks, loader, projectType],
  );

  const overrideLoader =
    scope !== "library" &&
    catalogLoader &&
    catalogLoader !== loader &&
    loaderOptions.includes(catalogLoader)
      ? catalogLoader
      : undefined;

  const browseLoader = overrideLoader ?? resolvedLoader;

  const isCatalogReady = meta.isReady;

  const catalog = useCatalogSearch(
    {
      provider: catalogProvider,
      projectType,
      query,
      sort: catalogSort,
      filters: catalogFilters,
      gameVersion: version?.id,
      loader: browseLoader,
    },
    scope !== "library" && isCatalogReady,
  );

  const installedIndex = useMemo(() => buildInstalledIndex(mods), [mods]);
  const findInstalled = useCallback(
    (project: MatchableProject) =>
      findInstalledProject(installedIndex, project),
    [installedIndex],
  );

  const libraryEntries = useMemo(
    () => buildLibraryEntries(mods, pendingRemoved, projectType),
    [mods, pendingRemoved, projectType],
  );

  const fileStates = useModFileStates(
    instancePath,
    projectType,
    libraryEntries,
    fileRevision,
  );

  const updateCheck = useUpdateCheck({
    mods,
    projectType,
    gameVersion: version?.id,
    loader: resolvedLoader ?? "vanilla",
    enabled: scope === "library" && canEdit && isOnline && !isModpacks,
  });

  const duplicates = useMemo(
    () => findDuplicates(libraryEntries, updateCheck.unavailable),
    [libraryEntries, updateCheck.unavailable],
  );

  const foreignKeys = useMemo(
    () =>
      new Set(
        libraryEntries
          .filter(
            (entry) =>
              entry.installed?.loader && entry.installed.loader !== loader,
          )
          .map((entry) => entry.key),
      ),
    [libraryEntries, loader],
  );

  const libraryMarks = useMemo(
    () => ({
      updatable: updateCheck.updatable,
      disabled: fileStates.disabled,
      duplicates: duplicates.all,
      foreign: foreignKeys,
    }),
    [duplicates, fileStates.disabled, foreignKeys, updateCheck.updatable],
  );

  const facetCounts = useMemo(
    () => countLibraryFacets(libraryEntries, libraryMarks),
    [libraryEntries, libraryMarks],
  );

  const [fileTimes, setFileTimes] = useState<Record<string, number>>({});
  const needsFileTimes = scope === "library" && librarySort === "recent";

  useEffect(() => {
    if (!needsFileTimes || !instancePath) return;

    let cancelled = false;
    void api.modManager
      .fileTimes(instancePath, projectType)
      .catch(() => ({}))
      .then((times) => {
        if (!cancelled) setFileTimes(times);
      });

    return () => {
      cancelled = true;
    };
  }, [needsFileTimes, instancePath, projectType, fileRevision]);

  const changedAt = useMemo(() => {
    const times = new Map<string, number>();
    if (!needsFileTimes) return times;

    for (const entry of libraryEntries) {
      const stamped = Date.parse(entry.installed?.updatedAt ?? "");
      const onDisk = Math.max(
        fileTimes[entry.fileName] ?? 0,
        fileTimes[`${entry.fileName}.disabled`] ?? 0,
      );
      const value = Math.max(Number.isNaN(stamped) ? 0 : stamped, onDisk);
      if (value > 0) times.set(entry.key, value);
    }

    return times;
  }, [fileTimes, libraryEntries, needsFileTimes]);

  const rows = useMemo<ContentEntry[]>(() => {
    if (scope === "library") {
      const filtered = filterLibraryEntries(
        libraryEntries,
        { query, facets: libraryFacets, sort: librarySort },
        libraryMarks,
      );
      return sortLibraryEntries(
        filtered,
        librarySort,
        updateCheck.updatable,
        changedAt,
      );
    }

    return catalog.items.map((project) =>
      fromCatalogProject(project, findInstalled(project) ?? null),
    );
  }, [
    scope,
    libraryEntries,
    query,
    libraryFacets,
    librarySort,
    libraryMarks,
    updateCheck.updatable,
    changedAt,
    catalog.items,
    findInstalled,
  ]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    if (scope === "library") return;
    if (!catalog.hasMore || catalog.isLoading || catalog.isLoadingMore) return;
    if (lastVisibleIndex < rows.length - 6) return;
    catalog.loadMore();
  }, [scope, catalog, lastVisibleIndex, rows.length]);

  const scopeSignature = `${scope}|${projectType}|${query}|${catalogSort}|${catalogFilters.join(",")}|${librarySort}|${libraryFacets.join(",")}`;

  useEffect(() => {
    setActiveIndex(-1);
    listElement?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSignature]);

  const membershipSignature = `${query}|${libraryFacets.join(",")}`;

  useEffect(() => {
    setSelection((prev) => (prev.size === 0 ? prev : new Set()));
  }, [membershipSignature]);

  useEffect(() => {
    setSelection(new Set());
    detailRequestRef.current += 1;
    setDetail(null);
    setDetailStack([]);
  }, [scope, projectType]);

  const closeDetail = useCallback(() => {
    detailRequestRef.current += 1;
    setDetail(null);
    setDetailStack([]);
  }, []);

  const loadDetail = useCallback(
    async (entry: ContentEntry, keepStack: boolean) => {
      const requestId = ++detailRequestRef.current;

      if (!keepStack) setDetailStack([]);

      setDetail({
        entry,
        project: entry.project,
        versions: [],
        selectedVersionId: null,
        isLoading: true,
        error: false,
        depsError: false,
      });

      if (
        entry.provider === Provider.LOCAL ||
        entry.provider === Provider.OTHER
      ) {
        const versions = entry.installed ? toModVersion(entry.installed) : [];
        setDetail({
          entry,
          project: entry.project,
          versions,
          selectedVersionId: versions[0]?.id ?? null,
          isLoading: false,
          error: versions.length === 0,
          depsError: false,
        });
        return;
      }

      const [versions, info] = await Promise.all([
        api.modManager
          .getVersions(entry.provider, entry.id, {
            loader: entry.installed?.loader ?? browseLoader,
            version: version?.id,
            projectType: entry.projectType,
            modUrl: entry.url,
          })
          .catch(() => [] as ModVersion[]),
        api.modManager.getProject(entry.provider, entry.id).catch(() => null),
      ]);

      if (requestId !== detailRequestRef.current) return;

      const installedVersion = entry.installed?.version;
      const resolved =
        versions.length === 0 && installedVersion
          ? toModVersion(entry.installed!)
          : versions;

      if (resolved.length === 0) {
        setDetail({
          entry,
          project: info
            ? { ...(entry.project ?? info), ...info }
            : entry.project,
          versions: [],
          selectedVersionId: null,
          isLoading: false,
          error: true,
          depsError: false,
        });
        return;
      }

      const installedIdx = installedVersion
        ? resolved.findIndex((item) => item.id === installedVersion.id)
        : -1;
      const selected = resolved[installedIdx === -1 ? 0 : installedIdx];

      setDetail({
        entry,
        project: info ? { ...(entry.project ?? info), ...info } : entry.project,
        versions: resolved,
        selectedVersionId: selected?.id ?? null,
        isLoading: false,
        error: false,
        depsError: false,
      });

      if (selected && selected.dependencies.length > 0 && !isModpacks) {
        const needsResolve = selected.dependencies.every((dep) => !dep.project);
        if (!needsResolve) return;

        const dependencies = await api.modManager
          .getDependencies(entry.provider, entry.id, selected.dependencies)
          .catch(() => null);

        if (requestId !== detailRequestRef.current) return;

        const depsFailed = dependencies === null;

        setDetail((prev) =>
          prev && prev.entry.key === entry.key
            ? {
                ...prev,
                depsError: depsFailed,
                versions: dependencies
                  ? prev.versions.map((item) =>
                      item.id === selected.id ? { ...item, dependencies } : item,
                    )
                  : prev.versions,
              }
            : prev,
        );
      }
    },
    [browseLoader, isModpacks, version?.id],
  );

  const openDetail = useCallback(
    (entry: ContentEntry) => {
      void loadDetail(entry, false);
    },
    [loadDetail],
  );

  const selectDetailVersion = useCallback(
    async (next: ModVersion) => {
      const current = detail;
      if (!current) return;

      setDetail({ ...current, selectedVersionId: next.id, depsError: false });

      if (isModpacks) return;
      if (next.dependencies.length === 0) return;
      if (next.dependencies.some((dep) => dep.project)) return;

      const requestId = detailRequestRef.current;
      const dependencies = await api.modManager
        .getDependencies(
          current.entry.provider,
          current.entry.id,
          next.dependencies,
        )
        .catch(() => null);

      if (requestId !== detailRequestRef.current) return;

      const depsFailed = dependencies === null;

      setDetail((prev) =>
        prev && prev.entry.key === current.entry.key
          ? {
              ...prev,
              depsError: depsFailed,
              versions: dependencies
                ? prev.versions.map((item) =>
                    item.id === next.id ? { ...item, dependencies } : item,
                  )
                : prev.versions,
            }
          : prev,
      );
    },
    [detail, isModpacks],
  );

  const rememberRemoved = useCallback(
    (project: ILocalProject) => {
      setPendingRemoved((prev) =>
        prev.some((item) => isSameLocalProject(item, project))
          ? prev
          : [...prev, project],
      );
    },
    [setPendingRemoved],
  );

  const forgetRemoved = useCallback(
    (project: ILocalProject) => {
      setPendingRemoved((prev) =>
        prev.filter((item) => !isSameLocalProject(item, project)),
      );
    },
    [setPendingRemoved],
  );

  const unresolvedDepsRef = useRef(false);
  const skippedDepsRef = useRef(false);

  const fetchers = useMemo(
    () => ({
      fetchVersions: (project: IProject) =>
        api.modManager
          .getVersions(project.provider, project.id, {
            loader:
              project.projectType === ProjectType.PLUGIN && server
                ? (server.core as unknown as Loader)
                : overrideLoader || loader || "vanilla",
            version: version?.id,
            projectType: project.projectType,
            modUrl: project.url,
          })
          .catch(() => [] as ModVersion[]),
      fetchDependencies: async (
        project: IProject,
        deps: IVersionDependency[],
      ) => {
        const resolved = await api.modManager
          .getDependencies(project.provider, project.id, deps)
          .catch(() => null);

        if (!resolved) {
          unresolvedDepsRef.current = true;
          return [];
        }

        const resolvedIds = new Set(resolved.map((item) => item.projectId));
        if (
          deps.some(
            (dep) =>
              dep.relationType === DependencyType.REQUIRED &&
              !resolvedIds.has(dep.projectId),
          )
        ) {
          unresolvedDepsRef.current = true;
        }

        return resolved;
      },
    }),
    [loader, overrideLoader, server, version?.id],
  );

  const installProject = useCallback(
    async (entry: ContentEntry, explicit?: ModVersion) => {
      if (!version) return;

      setBusyKey(entry.key);
      setIsBusy(true);
      unresolvedDepsRef.current = false;
      skippedDepsRef.current = false;

      try {
        const base =
          detail?.entry.key === entry.key
            ? (detail.project ?? entry.project)
            : entry.project;
        const source: IProject = {
          ...(base ?? {
            id: entry.id,
            title: entry.title,
            description: entry.description,
            projectType: entry.projectType,
            iconUrl: entry.iconUrl,
            url: entry.url,
            provider: entry.provider,
            versions: [],
            gallery: [],
            body: "",
          }),
          id: entry.id,
          provider: entry.provider,
          projectType: entry.projectType,
          title: entry.title,
          iconUrl: entry.iconUrl,
          url: entry.url,
        };

        const added: ILocalProject[] = [];
        let next = [...mods];

        if (explicit) {
          const installedKey = entry.installed
            ? entryKey(entry.installed.provider, entry.installed.id)
            : entry.key;
          const installLoader = overrideLoader ?? entry.installed?.loader;
          const local = toLocalProject(source, explicit, {
            disabled:
              fileStates.disabled.has(entry.key) ||
              fileStates.disabled.has(installedKey) ||
              entry.markedDisabled,
            loader: installLoader,
          });
          if (entry.installed?.pinned) local.pinned = true;
          const ownIndex = next.findIndex(
            (item) => entryKey(item.provider, item.id) === entry.key,
          );
          const installedIndex =
            ownIndex !== -1
              ? ownIndex
              : next.findIndex(
                  (item) => entryKey(item.provider, item.id) === installedKey,
                );
          const index =
            installedIndex !== -1
              ? installedIndex
              : next.findIndex((item) => sharesFile(item, local));
          if (index === -1) next.push(local);
          else next.splice(index, 1, local);
          added.push(local);

          const required = (explicit.dependencies ?? []).filter(
            (dep) => dep.relationType === DependencyType.REQUIRED,
          );
          if (required.some((dep) => !dep.project)) {
            unresolvedDepsRef.current = true;
          }

          const uninstalled = required.filter(
            (dep) =>
              dep.project &&
              !findInstalledProject(buildInstalledIndex(next), dep.project),
          );
          if (installLoader && uninstalled.length > 0) {
            skippedDepsRef.current = true;
          }
          const missing = installLoader ? [] : uninstalled;

          for (const dep of missing) {
            if (!dep.project) continue;
            const plan = await planQuickInstall(dep.project, next, fetchers);
            next = [...next, ...plan.added];
            added.push(...plan.added);
          }
        } else {
          const plan = await planQuickInstall(
            source,
            next,
            fetchers,
            overrideLoader
              ? { loader: overrideLoader, dependencies: false }
              : undefined,
          );
          if (plan.skippedDependencies) skippedDepsRef.current = true;

          if (plan.added.length === 0) {
            if (plan.rootMissingVersion) {
              showFailureToast(t("modManager.notFoundMod"), undefined, {
                channels: ["modManager:", "service:"],
                fallbackDescription: t("modManager.notFoundModHint"),
              });
            } else {
              toast.warning(t("modManager.alreadyInstalled"));
            }
            return;
          }

          next = [...next, ...plan.added];
          added.push(...plan.added);
        }

        setMods(next);
        for (const item of added) forgetRemoved(item);

        const extra = added.length - 1;
        const summary =
          extra > 0
            ? t("modManager.quickInstalled", { count: extra })
            : explicit && entry.installed
              ? t("modManager.updated")
              : t("modManager.added");

        if (skippedDepsRef.current) {
          toast.warning(summary, {
            description: t("modManager.dependenciesSkipped"),
          });
        } else if (unresolvedDepsRef.current) {
          toast.warning(summary, {
            description: t("modManager.dependenciesUnresolved"),
          });
        } else {
          toast.success(summary);
        }

        if (detail?.entry.key === entry.key && explicit) {
          setDetail((prev) =>
            prev ? { ...prev, selectedVersionId: explicit.id } : prev,
          );
        }
      } catch (error) {
        showFailureToast(t("modManager.notFoundMod"), error, {
          channels: ["modManager:", "service:"],
          fallbackDescription: t("modManager.notFoundModHint"),
        });
      } finally {
        setBusyKey(null);
        setIsBusy(false);
      }
    },
    [
      detail,
      fetchers,
      fileStates.disabled,
      forgetRemoved,
      mods,
      overrideLoader,
      setMods,
      t,
      version,
    ],
  );

  const removeEntries = useCallback(
    (targets: ContentEntry[]) => {
      let next = [...mods];
      const removed: ILocalProject[] = [];
      const blocked: string[] = [];

      for (const entry of targets) {
        const installed = next.find(
          (item) => entryKey(item.provider, item.id) === entry.key,
        );
        if (!installed) continue;

        const plan = planDeletion(next, installed);
        if (plan.blockers.length > 0) {
          blocked.push(entry.title);
          continue;
        }

        const keys = new Set(
          plan.remove.map((item) => entryKey(item.provider, item.id)),
        );
        next = next.filter(
          (item) => !keys.has(entryKey(item.provider, item.id)),
        );
        removed.push(...plan.remove);
      }

      if (removed.length > 0) {
        setMods(next);
        for (const item of removed) rememberRemoved(item);
        toast.success(
          removed.length > 1
            ? t("modManager.deletedMultiple", { count: removed.length })
            : t("modManager.deleted"),
        );
      }

      if (blocked.length > 0) {
        toast.warning(`${t("modManager.requiredBy")}: ${blocked.join(", ")}`);
      }
    },
    [mods, rememberRemoved, setMods, t],
  );

  const removeDuplicateRecords = useCallback(
    (targets: ContentEntry[]) => {
      const keys = new Set(targets.map((entry) => entry.key));
      const removed = mods.filter((item) =>
        keys.has(entryKey(item.provider, item.id)),
      );
      if (removed.length === 0) return;

      setMods(
        mods.filter((item) => !keys.has(entryKey(item.provider, item.id))),
      );
      for (const item of removed) rememberRemoved(item);
      toast.success(
        removed.length > 1
          ? t("modManager.deletedMultiple", { count: removed.length })
          : t("modManager.deleted"),
      );
    },
    [mods, rememberRemoved, setMods, t],
  );

  const setPinnedFor = useCallback(
    (targets: ContentEntry[], pinned: boolean) => {
      const keys = new Set(
        targets
          .filter((entry) => entry.installed && isCheckableProject(entry.installed))
          .map((entry) => entry.key),
      );
      if (keys.size === 0) return;

      setMods(
        mods.map((item) => {
          if (!keys.has(entryKey(item.provider, item.id))) return item;
          const next = { ...item };
          if (pinned) next.pinned = true;
          else delete next.pinned;
          return next;
        }),
      );
      toast.success(
        t(pinned ? "modManager.pinnedDone" : "modManager.unpinnedDone", {
          count: keys.size,
        }),
      );
    },
    [mods, setMods, t],
  );

  const applyUpdateFor = useCallback(
    (keys: string[]) => {
      const updates = new Map<string, ModVersion>();
      for (const key of keys) {
        const latest = updateCheck.latest.get(key);
        if (latest) updates.set(key, latest);
      }

      if (updates.size === 0) {
        toast.warning(t("modManager.noAvailableUpdates"));
        return;
      }

      const result = applyUpdates(mods, updates, fileStates.disabled);
      setMods(result.mods);
      if ([...updateCheck.updatable].every((key) => updates.has(key))) {
        setLibraryFacets((prev) => prev.filter((facet) => facet !== "update"));
      }
      toast.success(
        result.updated > 1
          ? t("modManager.updatedMultiple", { count: result.updated })
          : t("modManager.updated"),
      );
    },
    [
      fileStates.disabled,
      mods,
      setMods,
      t,
      updateCheck.latest,
      updateCheck.updatable,
    ],
  );

  const setEnabledFor = useCallback(
    async (entries: ContentEntry[], enabled: boolean) => {
      if (!instancePath) return;

      const changed = new Set<string>();
      let failure: unknown = null;

      setIsBusy(true);
      if (entries.length === 1) setBusyKey(entries[0].key);

      for (const entry of entries) {
        if (!entry.fileName) continue;
        if (fileStates.disabled.has(entry.key) === !enabled) continue;

        try {
          await toggleModFile(
            instancePath,
            projectType,
            entry.fileName,
            !enabled,
          );
          changed.add(entry.key);
        } catch (error) {
          failure = error;
        }
      }

      if (changed.size > 0) {
        setMods(
          mods.map((mod) => {
            const key = entryKey(mod.provider, mod.id);
            if (!mod.version || !changed.has(key)) return mod;

            return {
              ...mod,
              version: {
                ...mod.version,
                files: mod.version.files.map((file) => ({
                  ...file,
                  disabled: !enabled,
                })),
              },
            };
          }),
        );

        setFileRevision((value) => value + 1);
        toast.success(
          t(enabled ? "modManager.enabled" : "modManager.disabled"),
        );
      }

      if (failure) {
        showFailureToast(t("modManager.toggleError"), failure, {
          channels: ["fs:rename"],
          fallbackDescription: t("modManager.toggleErrorHint"),
        });
      }

      setBusyKey(null);
      setIsBusy(false);
    },
    [fileStates.disabled, instancePath, mods, projectType, setMods, t],
  );

  const restoreEntry = useCallback(
    (entry: ContentEntry) => {
      if (!entry.installed) return;
      setMods([...mods, entry.installed]);
      forgetRemoved(entry.installed);
      toast.success(t("modManager.added"));
    },
    [forgetRemoved, mods, setMods, t],
  );

  const readLocalFiles = useCallback(
    async (
      filePaths: string[],
      source?: {
        names?: Map<string, string>;
        deletedAt?: Map<string, number | null>;
        reasons?: Map<string, TrashEntry["reason"]>;
        mode?: ImportMode;
      },
    ) => {
      const names = source?.names;

      setImportMode(source?.mode ?? "import");
      setIsBusy(true);
      setImportProgress(1);

      const collected: IAddedLocalProject[] = [];

      try {
        const infos = await mapWithConcurrency(
          filePaths,
          LOCAL_IMPORT_CONCURRENCY,
          (filePath) =>
            api.modManager.checkLocalMod(filePath).catch(() => null),
          (done) =>
            setImportProgress(
              Math.max(1, Math.round((done / filePaths.length) * 100)),
            ),
        );

        for (const [index, filePath] of filePaths.entries()) {
          const info = infos[index];
          const deletedAt = source?.deletedAt?.get(filePath) ?? null;
          const deletedReason = source?.reasons?.get(filePath);
          const displayName =
            names?.get(filePath) ??
            info?.filename ??
            (await api.path.basename(filePath));

          const built = info
            ? buildImportEntry({
                info,
                displayName,
                projectType,
                installed: mods,
                collected,
                deletedAt,
                fileUrl: toFileUrl(info.path),
              })
            : buildInvalidEntry({ displayName, projectType, deletedAt });
          collected.push(deletedReason ? { ...built, deletedReason } : built);
        }
      } catch (error) {
        showFailureToast(t("modManager.invalidMod"), error, {
          channels: ["modManager:checkLocalMod"],
        });
        return;
      } finally {
        setImportProgress(0);
        setIsBusy(false);
      }

      if (collected.length === 0) {
        toast.warning(t("modManager.invalidMod"));
        return;
      }

      setImporting(collected);
      setIsImportOpen(true);
    },
    [mods, projectType, t],
  );

  const canUseTrash =
    scope === "library" &&
    canEdit &&
    !isModpacks &&
    Boolean(instancePath);

  useEffect(() => {
    if (!canUseTrash || !instancePath) {
      setTrashEntries([]);
      return;
    }

    let cancelled = false;

    void listTrash(instancePath).then((entries) => {
      if (!cancelled) setTrashEntries(entries);
    });

    return () => {
      cancelled = true;
    };
  }, [canUseTrash, instancePath, fileRevision]);

  useEffect(() => {
    if (!canUseTrash || !instancePath) {
      setFolderState(null);
      return;
    }

    let cancelled = false;

    void Promise.all([
      listModFiles(instancePath, projectType),
      api.modManager.managedFiles(instancePath).catch(() => null),
    ]).then(([listing, managed]) => {
      if (!cancelled) setFolderState({ projectType, listing, managed });
    });

    return () => {
      cancelled = true;
    };
  }, [canUseTrash, instancePath, projectType, fileRevision]);

  useEffect(() => {
    if (!canUseTrash || !instancePath) return;

    const onFocus = () => {
      forgetAllModFiles(instancePath);
      setFileRevision((value) => value + 1);
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [canUseTrash, instancePath]);

  const foreignFiles = useMemo(() => {
    if (!folderState || folderState.projectType !== projectType) return [];

    return findForeignFiles({
      listing: folderState.listing,
      mods,
      pendingRemoved,
      projectType,
      managed: folderState.managed
        ? (folderState.managed[projectType] ?? [])
        : null,
    });
  }, [folderState, mods, pendingRemoved, projectType]);

  const identifiable = useMemo(
    () => libraryEntries.filter(isIdentifiable),
    [libraryEntries],
  );

  const identifyLocal = useCallback(
    async (onlyKeys?: ReadonlySet<string>) => {
      const targets = identifiable.filter(
        (entry) => !onlyKeys || onlyKeys.has(entry.key),
      );
      if (targets.length === 0 || isIdentifying) return;

      setIsIdentifying(true);
      try {
        const folder = await folderNameForType(projectType);
        const requests = (
          await Promise.all(
            targets.map(async (entry) => {
              const file = entry.installed?.version?.files[0];
              if (!file) return null;

              const inFolder =
                instancePath && fileStates.present.has(entry.key)
                  ? await api.path.join(
                      instancePath,
                      folder,
                      fileStates.disabled.has(entry.key)
                        ? `${entry.fileName}.disabled`
                        : entry.fileName,
                    )
                  : "";
              const path =
                inFolder ||
                file.localPath ||
                getLocalPathFromFileUrl(file.url);
              if (!path) return null;

              return {
                key: entry.key,
                path,
                sha1: file.sha1 ?? "",
                projectType: entry.projectType,
                ...(version?.id ? { gameVersion: version.id } : {}),
              };
            }),
          )
        ).filter((request) => request !== null);

        const result = await api.modManager.identifyLocal(requests);

        if (result.matches.length === 0) {
          if (result.unavailable.length > 0) {
            showFailureToast(t("modManager.identifyFailed"), undefined, {
              channels: ["service:modrinth", "service:curseforge"],
            });
          } else {
            toast.info(t("modManager.identifyNone"));
          }
          return;
        }

        setIdentifyReport({
          matches: result.matches,
          fileNames: new Map(targets.map((entry) => [entry.key, entry.fileName])),
          total: requests.length,
          unavailable: result.unavailable,
        });
      } catch (error) {
        showFailureToast(t("modManager.identifyFailed"), error, {
          channels: ["modManager:identifyLocal"],
        });
      } finally {
        setIsIdentifying(false);
      }
    },
    [
      fileStates,
      identifiable,
      instancePath,
      isIdentifying,
      projectType,
      t,
      version?.id,
    ],
  );

  const identifyRef = useRef(identifyLocal);
  useEffect(() => {
    identifyRef.current = identifyLocal;
  }, [identifyLocal]);

  const linkLocal = useCallback(
    (matches: ILocalIdentifyMatch[]) => {
      const result = linkIdentified(
        mods,
        matches,
        fileStates.disabled,
        loader ?? undefined,
      );
      if (result.linked.length === 0) {
        toast.warning(t("modManager.alreadyInstalled"));
        return;
      }

      setMods(result.mods);
      toast.success(
        t("modManager.identifyLinked", { count: result.linked.length }),
      );
    },
    [fileStates.disabled, loader, mods, setMods, t],
  );

  const addForeignFiles = useCallback(async () => {
    if (!instancePath || foreignFiles.length === 0) return;

    const folder = await folderNameForType(projectType);
    const filePaths = await Promise.all(
      foreignFiles.map((name) => api.path.join(instancePath, folder, name)),
    );

    await readLocalFiles(filePaths);
  }, [foreignFiles, instancePath, projectType, readLocalFiles]);

  const trashForeignFiles = useCallback(async () => {
    if (!instancePath || foreignFiles.length === 0) return;

    setIsBusy(true);
    try {
      const moved = await api.modManager.trashFiles(
        instancePath,
        projectType,
        foreignFiles,
      );

      if (moved.length > 0) {
        toast.success(t("modManager.foreignTrashed", { count: moved.length }));
      }
      if (moved.length < foreignFiles.length) {
        showFailureToast(t("modManager.foreignTrashFailed"), undefined, {
          channels: ["modManager:trashFiles"],
        });
      }
    } finally {
      await forgetModFiles(instancePath, projectType);
      setFileRevision((value) => value + 1);
      setIsBusy(false);
    }
  }, [foreignFiles, instancePath, projectType, t]);

  const restorableTrash = useMemo(() => {
    if (trashEntries.length === 0) return trashEntries;

    const known = new Set<string>();
    for (const mod of mods) {
      for (const file of mod.version?.files ?? []) {
        if (file.filename) known.add(file.filename.toLowerCase());
      }
    }

    return trashEntries.filter((entry) => !known.has(entry.name.toLowerCase()));
  }, [mods, trashEntries]);

  useEffect(() => {
    setTrashHiddenAt(instancePath ? readTrashHiddenAt(instancePath) : 0);
  }, [instancePath]);

  const latestTrashAt = useMemo(
    () =>
      restorableTrash.reduce(
        (latest, entry) => Math.max(latest, entry.deletedAt ?? 0),
        0,
      ),
    [restorableTrash],
  );
  const showTrashBar =
    canUseTrash &&
    restorableTrash.length > 0 &&
    (latestTrashAt === 0 || latestTrashAt > trashHiddenAt);

  const hideTrashBar = useCallback(() => {
    if (!instancePath) return;
    const at = latestTrashAt || Date.now();
    writeTrashHiddenAt(instancePath, at);
    setTrashHiddenAt(at);
  }, [instancePath, latestTrashAt]);

  const openTrashFolder = useCallback(async () => {
    if (!instancePath) return;
    try {
      await api.shell.openPath(await trashFolder(instancePath));
    } catch (error) {
      showFailureToast(t("modManager.trashOpenFailed"), error, {
        channels: ["shell:openPath"],
      });
    }
  }, [instancePath, t]);

  const clearTrash = useCallback(async () => {
    if (!instancePath || restorableTrash.length === 0) return;

    setIsBusy(true);
    try {
      const files = await trashPaths(instancePath, restorableTrash);
      const results = await Promise.all(
        files.map((file) => api.fs.rimraf(file.path).catch(() => false)),
      );
      const cleared = results.filter(Boolean).length;

      if (cleared < files.length) {
        toast.warning(t("modManager.trashClearFailed"));
      } else {
        toast.success(t("modManager.trashCleared", { count: cleared }));
      }
    } finally {
      setIsBusy(false);
      setFileRevision((value) => value + 1);
    }
  }, [instancePath, restorableTrash, t]);

  const restoreTrash = useCallback(async () => {
    if (!instancePath || restorableTrash.length === 0) return;

    const files = await trashPaths(instancePath, restorableTrash);
    const byPath = new Map(files.map((file, index) => [file.path, index]));

    await readLocalFiles(
      files.map((file) => file.path),
      {
        names: new Map(files.map((file) => [file.path, file.name])),
        deletedAt: new Map(
          files.map((file) => [
            file.path,
            restorableTrash[byPath.get(file.path) ?? 0]?.deletedAt ?? null,
          ]),
        ),
        reasons: new Map(
          files.map((file) => [
            file.path,
            restorableTrash[byPath.get(file.path) ?? 0]?.reason,
          ]),
        ),
        mode: "restore",
      },
    );
  }, [instancePath, readLocalFiles, restorableTrash]);

  const pickLocalFiles = useCallback(async () => {
    const filePaths = await api.other.openFileDialog(
      false,
      [{ name: "Mods", extensions: LOCAL_IMPORT_EXTENSIONS }],
      true,
    );
    if (!filePaths || filePaths.length === 0) return;
    await readLocalFiles(filePaths);
  }, [readLocalFiles]);

  const installModpack = useCallback(
    async (entry: ContentEntry, modVersion: ModVersion) => {
      const file = modVersion.files[0];
      if (!file) return;

      const detailProject = detail?.project ?? entry.project;
      if (!detailProject) return;

      setIsBusy(true);
      setBusyKey(entry.key);

      try {
        if (file.url.startsWith("blocked::")) {
          setBlockedMods([
            {
              fileName: file.filename,
              hash: file.sha1,
              url: file.url.replace("blocked::", ""),
              projectId: entry.id,
              fileId: Number(modVersion.id) || 0,
              modTitle: entry.title,
            },
          ]);
          return;
        }

        const temp = await api.path.join(paths.launcher, "temp");
        const archivePath = await api.path.join(temp, file.filename);
        const targetPath = await api.path.join(
          temp,
          await api.path.basename(
            file.filename,
            await api.path.extname(file.filename),
          ),
        );

        setModpackStage("download");
        await api.file.download(
          [
            {
              destination: archivePath,
              group: "mods",
              url: file.url,
              sha1: file.sha1,
              size: file.size,
            },
          ],
          settings.downloadLimit,
        );

        setModpackStage("extract");
        await withExtractProgress(archivePath, setExtractPercent, () =>
          api.fs.extractZip(archivePath, targetPath),
        );
        await api.fs.rimraf(archivePath);

        const modpack = await api.modManager.checkModpack(
          targetPath,
          detailProject,
          modVersion,
        );

        if (!modpack) {
          showFailureToast(t("modManager.notModpack"), undefined, {
            channels: ["modManager:checkModpack"],
            fallbackDescription: t("modManager.notModpackHint"),
          });
          return;
        }

        setModpack(modpack);
        onClose(modpack);
      } catch (error) {
        showFailureToast(t("modManager.notModpack"), error, {
          channels: ["modManager:checkModpack", "file:download"],
          fallbackDescription: t("modManager.notModpackHint"),
        });
      } finally {
        setModpackStage(null);
        setIsBusy(false);
        setBusyKey(null);
      }
    },
    [detail, onClose, paths.launcher, setModpack, settings.downloadLimit, t],
  );

  const translateDetail = useCallback(async () => {
    const current = detail;
    if (!current) return;

    const project = current.project;
    if (!project) return;

    const cacheKey = `${current.entry.key}|${lang}`;
    const cached = translationsRef.current.get(cacheKey);

    if (cached) {
      setDetail((prev) =>
        prev && prev.entry.key === current.entry.key && prev.project
          ? {
              ...prev,
              project: {
                ...prev.project,
                description: cached.description ?? prev.project.description,
                body: cached.body ?? prev.project.body,
              },
            }
          : prev,
      );
      return;
    }

    const token = account?.accessToken || "";
    const prompt = (text: string) => {
      const head = `Translate the following text to ${lang}, keep markdown formatting:\n\n`;
      return head + text.slice(0, AI_PROMPT_MAX_CHARS - head.length);
    };

    setIsTranslating(true);

    try {
      const [description, body] = await Promise.all([
        project.description
          ? api.backend.aiComplete(token, prompt(project.description))
          : undefined,
        project.body
          ? api.backend.aiComplete(token, prompt(project.body))
          : undefined,
      ]);

      if (!description && !body) {
        showFailureToast(t("modManager.translateError"), undefined, {
          channels: ["backend:aiComplete"],
        });
        return;
      }

      translationsRef.current.set(cacheKey, {
        description: description ?? undefined,
        body: body ?? undefined,
      });

      setDetail((prev) =>
        prev && prev.entry.key === current.entry.key && prev.project
          ? {
              ...prev,
              project: {
                ...prev.project,
                description: description || prev.project.description,
                body: body || prev.project.body,
              },
            }
          : prev,
      );
    } finally {
      setIsTranslating(false);
    }
  }, [account?.accessToken, detail, lang, t]);

  const canSelectRows = scope === "library" && canEdit && !isModpacks;

  const toggleSelected = useCallback(
    (entry: ContentEntry) => {
      if (!canSelectRows) return;

      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(entry.key)) next.delete(entry.key);
        else next.add(entry.key);
        return next;
      });
    },
    [canSelectRows],
  );

  const rowActions = useMemo(
    () => ({
      onOpen: openDetail,
      onToggleSelected: toggleSelected,
      onInstall: (entry: ContentEntry) => void installProject(entry),
      onUpdate: (entry: ContentEntry) => applyUpdateFor([entry.key]),
      onDelete: (entry: ContentEntry) => removeEntries([entry]),
      onRestore: restoreEntry,
      onToggleEnabled: (entry: ContentEntry, enabled: boolean) =>
        void setEnabledFor([entry], enabled),
    }),
    [
      applyUpdateFor,
      installProject,
      openDetail,
      removeEntries,
      restoreEntry,
      setEnabledFor,
      toggleSelected,
    ],
  );

  const selectedEntries = useMemo(
    () => rows.filter((entry) => selection.has(entry.key)),
    [rows, selection],
  );
  const selectedCheckable = useMemo(
    () =>
      selectedEntries.filter(
        (entry) => entry.installed && isCheckableProject(entry.installed),
      ),
    [selectedEntries],
  );
  const selectionAllPinned =
    selectedCheckable.length > 0 &&
    selectedCheckable.every((entry) => entry.installed?.pinned === true);

  const typeCounts = useMemo(() => {
    const counts = new Map<ProjectType, number>();
    for (const mod of mods) {
      counts.set(mod.projectType, (counts.get(mod.projectType) ?? 0) + 1);
    }
    return counts;
  }, [mods]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = Math.min(
          Math.max(activeIndex + delta, 0),
          Math.max(rows.length - 1, 0),
        );
        setActiveIndex(next);
        rowVirtualizer.scrollToIndex(next, { align: "auto" });
        return;
      }

      if (event.key === "Enter" && rows[activeIndex]) {
        event.preventDefault();
        openDetail(rows[activeIndex]);
        return;
      }

      if (event.key === " " && rows[activeIndex]) {
        event.preventDefault();
        toggleSelected(rows[activeIndex]);
      }
    },
    [activeIndex, openDetail, rows, rowVirtualizer, toggleSelected],
  );

  useEffect(() => {
    const isCoveredByLayer = () => {
      const root = rootRef.current;
      return [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        ),
      ].some((layer) => !root || !layer.contains(root));
    };

    const onGlobalKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      if (event.key === "Escape" && !isTyping) {
        if (isCoveredByLayer()) return;
        if (detail) {
          event.stopPropagation();
          if (detailStack.length > 0) {
            const previous = detailStack[detailStack.length - 1];
            setDetailStack((prev) => prev.slice(0, -1));
            void loadDetail(previous, true);
          } else {
            closeDetail();
          }
          return;
        }
        if (selection.size > 0) {
          event.stopPropagation();
          setSelection(new Set());
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onGlobalKey, true);
    return () => document.removeEventListener("keydown", onGlobalKey, true);
  }, [closeDetail, detail, detailStack, loadDetail, selection.size]);

  const activeFilterChips = useMemo(
    () =>
      buildCatalogChips(
        meta.filters,
        catalogFilters,
        catalogProvider,
        translateCategory,
      ),
    [catalogFilters, catalogProvider, meta.filters, translateCategory],
  );

  const filterChips = useMemo(
    () =>
      scope === "library"
        ? libraryFacets.map((facet) => ({
            key: facet,
            label: t(`modManager.facets.${facet}`),
          }))
        : activeFilterChips,
    [activeFilterChips, libraryFacets, scope, t],
  );

  const removeFilterChip = (key: string) => {
    if (scope === "library") {
      setLibraryFacets((prev) => prev.filter((facet) => facet !== key));
    } else {
      setCatalogFilters((prev) => toggleValue(prev, key));
    }
  };

  const clearFilterChips = () => {
    if (scope === "library") setLibraryFacets([]);
    else setCatalogFilters([]);
  };

  const filterGroups = useMemo(() => {
    const needle = filterQuery.trim().toLowerCase();
    if (!needle) return meta.filters;

    return meta.filters
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          item.name.toLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [filterQuery, meta.filters]);

  const detailBase = detail?.entry ?? null;

  const detailEntry = useMemo(() => {
    if (!detailBase) return null;

    const installed = findInstalled(detailBase) ?? null;
    const removed = pendingRemoved.some(
      (item) => entryKey(item.provider, item.id) === detailBase.key,
    );

    return withInstalled(detailBase, installed, removed);
  }, [detailBase, findInstalled, pendingRemoved]);

  const detailSelectedVersion =
    detail?.versions.find((item) => item.id === detail.selectedVersionId) ??
    null;

  const deletionPlan = useMemo(() => {
    if (!detailEntry?.installed) return { remove: [], blockers: [] };
    return planDeletion(mods, detailEntry.installed);
  }, [detailEntry, mods]);

  const modpackProgress = useMemo<DetailProgress | null>(() => {
    if (!modpackStage) return null;
    if (modpackStage === "extract")
      return { label: t("modManager.extracting"), percent: extractPercent };
    return {
      label: t("downloadProgress.title"),
      percent: downloadInfo?.progressPercent ?? 0,
    };
  }, [downloadInfo, extractPercent, modpackStage, t]);

  const isEmptyLibrary =
    scope === "library" &&
    libraryEntries.length === 0 &&
    !query &&
    libraryFacets.length === 0;

  const hasActiveFilters =
    scope === "library"
      ? libraryFacets.length > 0 || query.length > 0
      : catalogFilters.length > 0 || query.length > 0;

  const resetFilters = () => {
    setRawQuery("");
    setQuery("");
    setLibraryFacets([]);
    setCatalogFilters([]);
  };

  const updatableCount = updateCheck.updatable.size;
  const uncheckedCount = updateCheck.unchecked.size;
  const canShowUpdateBar = scope === "library" && canEdit && !isModpacks;
  const showConnectorHint =
    scope !== "library" &&
    needsConnector(loader, browseLoader) &&
    !hasConnector(mods);

  const bar =
    canSelectRows && selection.size > 0
      ? "selection"
      : canUseTrash && foreignFiles.length > 0
        ? "foreign"
        : canShowUpdateBar && duplicates.groups > 0
          ? "duplicates"
          : canShowUpdateBar && updatableCount > 0
            ? "updates"
            : canShowUpdateBar && uncheckedCount > 0
              ? "unchecked"
              : showConnectorHint
                ? "connector"
                : filterChips.length > 0
                  ? "chips"
                  : null;
  const listBusy =
    scope === "library" ? false : catalog.isLoading || !isCatalogReady;
  const showAddRow =
    scope === "library" && canEdit && canBrowse && !isModpacks && !query;

  return (
    <>
      <div
        ref={rootRef}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <div className="@container flex shrink-0 flex-wrap items-center gap-2 pb-2.5">
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
            {!isModpacks && (
              <ScopeButton
                active={scope === "library"}
                label={t("modManager.library")}
                compact
                count={
                  projectTypes.length > 1 ? undefined : libraryEntries.length
                }
                onClick={() => setScope("library")}
              >
                <Library className="size-4" />
              </ScopeButton>
            )}

            <ScopeButton
              active={scope === Provider.CURSEFORGE}
              label="CurseForge"
              compact
              disabled={!canBrowse}
              onClick={() => setScope(Provider.CURSEFORGE)}
            >
              <SiCurseforge className="size-4" />
            </ScopeButton>

            <ScopeButton
              active={scope === Provider.MODRINTH}
              label="Modrinth"
              compact
              disabled={!canBrowse}
              onClick={() => setScope(Provider.MODRINTH)}
            >
              <SiModrinth className="size-4" />
            </ScopeButton>
          </div>

          {!isModpacks && projectTypes.length > 1 && (
            <div
              role="tablist"
              aria-label={t("modManager.contentType")}
              className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 p-0.5"
            >
              {projectTypes.map((type) => {
                const Icon = PROJECT_TYPE_ICONS[type] ?? Package;
                return (
                  <ScopeButton
                    key={type}
                    active={projectType === type}
                    label={t(`modManager.projectTypes.${type}`)}
                    count={
                      scope === "library" ? (typeCounts.get(type) ?? 0) : undefined
                    }
                    onClick={() => setProjectType(type)}
                  >
                    <Icon className="size-4" />
                  </ScopeButton>
                );
              })}
            </div>
          )}

          {scope !== "library" && loaderOptions.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="shrink-0">
                  <Select
                    value={browseLoader ?? loaderOptions[0]}
                    onValueChange={(value: Loader) =>
                      setCatalogLoader(value === loader ? null : value)
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-32"
                      aria-label={t("modManager.catalogLoader")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {loaderOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          <LoaderLabel loader={item} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                {t("modManager.catalogLoaderHint")}
              </TooltipContent>
            </Tooltip>
          )}

          {isModpacks && (
            <>
              <div className="w-28 shrink-0">
                <VirtualizedSelect
                  size="sm"
                  aria-label={t("versions.version")}
                  value={version?.id || ""}
                  placeholder={t("versions.version")}
                  searchPlaceholder={t("common.search")}
                  emptyText={t("common.notFound")}
                  options={gameVersions.map((item) => ({
                    value: item.id,
                    label: item.id,
                  }))}
                  onValueChange={(value) =>
                    setVersion(gameVersions.find((item) => item.id === value))
                  }
                />
              </div>

              <Select
                value={loader || ""}
                onValueChange={(value: Loader) => setLoader(value)}
              >
                <SelectTrigger size="sm" className="w-32 shrink-0">
                  <SelectValue placeholder={t("versions.loader")} />
                </SelectTrigger>
                <SelectContent>
                  {(["forge", "neoforge", "fabric", "quilt"] as Loader[]).map(
                    (item) => (
                      <SelectItem key={item} value={item}>
                        <LoaderLabel loader={item} />
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </>
          )}

          <div className="relative min-w-32 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
            <Input
              ref={searchRef}
              value={rawQuery}
              className="h-8 pr-8 pl-8"
              placeholder={
                scope === "library"
                  ? t("modManager.searchLibrary")
                  : t("browser.search")
              }
              onChange={(event) => setRawQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && rawQuery) {
                  event.preventDefault();
                  event.stopPropagation();
                  setRawQuery("");
                }
              }}
            />
            {(listBusy || (scope === "library" && updateCheck.isChecking)) && (
              <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-faint" />
            )}
          </div>

          {scope === "library" ? (
            <Select
              value={librarySort}
              onValueChange={(value: LibrarySort) => setLibrarySort(value)}
            >
              <SelectTrigger size="sm" className="w-44 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_SORTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`modManager.librarySorts.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={catalogSort} onValueChange={setCatalogSort}>
              <SelectTrigger size="sm" className="w-40 shrink-0">
                <SelectValue placeholder={t("modManager.sort")} />
              </SelectTrigger>
              <SelectContent>
                {meta.sorts.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`modManager.sorts.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 px-2.5"
                aria-label={t("modManager.filter")}
              >
                <SlidersHorizontal className="size-4" />
                <span className="hidden @5xl:inline">
                  {t("modManager.filter")}
                </span>
                {(scope === "library"
                  ? libraryFacets.length
                  : catalogFilters.length) > 0 && (
                  <span className="ml-0.5 rounded-sm bg-primary-soft px-1 font-mono text-[0.625rem] tabular-nums">
                    {scope === "library"
                      ? libraryFacets.length
                      : catalogFilters.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              {scope === "library" ? (
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {LIBRARY_FACETS.map((facet) => (
                    <button
                      key={facet}
                      type="button"
                      disabled={
                        facetCounts[facet] === 0 &&
                        !libraryFacets.includes(facet)
                      }
                      onClick={() =>
                        setLibraryFacets(
                          (prev) => toggleValue(prev, facet) as LibraryFacet[],
                        )
                      }
                      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-3 disabled:opacity-40"
                    >
                      <Checkbox
                        checked={libraryFacets.includes(facet)}
                        className="pointer-events-none"
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {t(`modManager.facets.${facet}`)}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                        {facetCounts[facet]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="border-b border-border p-1.5">
                    <Input
                      value={filterQuery}
                      className="h-8"
                      placeholder={t("common.search")}
                      onChange={(event) => setFilterQuery(event.target.value)}
                    />
                  </div>
                  <div className="max-h-72 overflow-y-auto p-1.5">
                    {!meta.isReady ? (
                      <div className="flex h-20 items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-faint" />
                      </div>
                    ) : filterGroups.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {t("common.notFound")}
                      </p>
                    ) : (
                      filterGroups.map((group) => (
                        <div key={group.title} className="mb-1">
                          <p className="px-2 py-1 text-[0.6875rem] font-medium text-faint uppercase">
                            {translateCategory(
                              categoryLocaleKey(group.title),
                              humanizeFilterName(group.title),
                            )}
                          </p>
                          {group.items.map((item) => {
                            const key = catalogFilterKey(item, catalogProvider);
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() =>
                                  setCatalogFilters((prev) =>
                                    toggleValue(prev, key),
                                  )
                                }
                                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-surface-3"
                              >
                                <Checkbox
                                  checked={catalogFilters.includes(key)}
                                  className="pointer-events-none"
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {catalogFilterLabel(
                                    item,
                                    catalogProvider,
                                    translateCategory,
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </PopoverContent>
          </Popover>

          {canEdit && !isModpacks && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="size-8 shrink-0"
                  disabled={isBusy}
                  aria-label={t("modManager.selectLocals")}
                  onClick={pickLocalFiles}
                >
                  <FilePlus2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("modManager.selectLocals")}</TooltipContent>
            </Tooltip>
          )}

          {scope === "library" &&
            canEdit &&
            !isModpacks &&
            isOnline &&
            identifiable.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    className="size-8 shrink-0"
                    disabled={isBusy || isIdentifying}
                    aria-label={t("modManager.identifyAction")}
                    onClick={() => void identifyLocal()}
                  >
                    {isIdentifying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanSearch className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isIdentifying
                    ? t("modManager.identifySearching")
                    : t("modManager.identifyAction")}
                </TooltipContent>
              </Tooltip>
            )}

          {scope === "library" && canEdit && !isModpacks && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="size-8 shrink-0"
                  disabled={isBusy || updateCheck.isChecking}
                  aria-label={t("modManager.checkUpdates")}
                  onClick={() => updateCheck.check(true)}
                >
                  {updateCheck.isChecking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCw className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("modManager.checkUpdates")}</TooltipContent>
            </Tooltip>
          )}

          {!isModpacks && (
            <AskAgentButton
              className="size-8 shrink-0"
              prompt={t("agent.prompts.mods", {
                loader: loader ?? "",
                version: version?.id ?? "",
              })}
            />
          )}
        </div>

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
                    {t(selectionAllPinned ? "modManager.unpin" : "modManager.pin")}
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
                  className="relative w-full"
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
                        className="absolute top-0 left-0 w-full"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
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
                            fileStates.ready &&
                            !fileStates.present.has(entry.key)
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
                            needsFileTimes
                              ? changedAt.get(entry.key)
                              : undefined
                          }
                          isBusy={busyKey === entry.key || isBusy}
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
                      onClick={() => setScope(Provider.MODRINTH)}
                    >
                      <PackageOpen className="size-4" />
                      {t("modManager.browseCatalog")}
                    </button>
                  )}
                </div>
              ) : listBusy ? (
                <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("common.searching")}
                </div>
              ) : catalog.error && scope !== "library" ? (
                <EmptyState
                  icon={<CircleAlert className="size-6 text-destructive" />}
                  title={t("modManager.searchFailedTitle")}
                  description={t("modManager.searchFailed")}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={catalog.reload}
                    >
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
                        onClick={() => setScope(Provider.MODRINTH)}
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
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resetFilters}
                      >
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
                setPinnedFor([detailEntry], detailEntry.installed?.pinned !== true)
              }
            />
          )}
        </div>
      </div>

      {isImportOpen && importing.length > 0 && (
        <ImportLocalDialog
          projects={importing}
          mode={importMode}
          lang={lang}
          sizeUnits={sizeUnits}
          onClose={() => {
            setIsImportOpen(false);
            setImporting([]);
          }}
          addProjects={(projects: IProject[]) => {
            const added = projects.map((project) =>
              toLocalProject(project, project.versions[0], {
                keepLocalPath: true,
                disabled: project.versions[0]?.files.some(
                  (file) => file.disabled === true,
                ),
              }),
            );

            setMods([...mods, ...added]);
            setPendingRemoved((prev) =>
              prev.filter(
                (item) =>
                  !added.some((project) => isSameLocalProject(item, project)),
              ),
            );

            const elsewhere = added.filter(
              (project) => project.projectType !== projectType,
            );
            const elsewhereLabels = [
              ...new Set(
                elsewhere.map((project) =>
                  t(`modManager.projectTypes.${project.projectType}`),
                ),
              ),
            ];

            const addedKeys = new Set(
              added.map((project) => entryKey(project.provider, project.id)),
            );

            toast.success(
              importMode === "restore"
                ? t("modManager.restoredCount", { n: added.length })
                : t("modManager.addedMultiple", { count: added.length }),
              {
                description:
                  elsewhereLabels.length > 0
                    ? t("modManager.addedElsewhere", {
                        types: elsewhereLabels.join(", "),
                      })
                    : undefined,
                action:
                  isOnline && importMode === "import"
                    ? {
                        label: t("modManager.identifyShort"),
                        onClick: () => void identifyRef.current(addedKeys),
                      }
                    : undefined,
              },
            );
          }}
        />
      )}

      {isClearTrashOpen && (
        <Confirmation
          title={t("modManager.trashClearTitle")}
          reversible={false}
          content={[
            {
              text: t("modManager.trashClearConfirm", {
                count: restorableTrash.length,
              }),
            },
          ]}
          buttons={[
            {
              text: t("modManager.trashClear"),
              color: "danger",
              onClick: async () => {
                setIsClearTrashOpen(false);
                await clearTrash();
              },
            },
            {
              text: t("common.cancel"),
              color: "secondary",
              onClick: () => setIsClearTrashOpen(false),
            },
          ]}
          onClose={() => setIsClearTrashOpen(false)}
        />
      )}

      {identifyReport && (
        <IdentifyLocalDialog
          report={identifyReport}
          onClose={() => setIdentifyReport(null)}
          onLink={linkLocal}
        />
      )}

      {blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (resolved) => {
            setBlockedMods([]);

            const first = resolved?.[0];
            if (
              !first?.filePath ||
              !detail?.project ||
              !detailSelectedVersion
            ) {
              setIsBusy(false);
              setBusyKey(null);
              return;
            }

            try {
              const temp = await api.path.join(paths.launcher, "temp");
              const targetPath = await api.path.join(
                temp,
                await api.path.basename(
                  first.fileName,
                  await api.path.extname(first.fileName),
                ),
              );

              const archivePath = first.filePath;

              setModpackStage("extract");
              await withExtractProgress(archivePath, setExtractPercent, () =>
                api.fs.extractZip(archivePath, targetPath),
              );

              const modpack = await api.modManager.checkModpack(
                targetPath,
                detail.project,
                detailSelectedVersion,
              );

              if (!modpack) {
                showFailureToast(t("modManager.notModpack"), undefined, {
                  channels: ["modManager:checkModpack"],
                  fallbackDescription: t("modManager.notModpackHint"),
                });
                return;
              }

              setModpack(modpack);
              onClose(modpack);
            } finally {
              setModpackStage(null);
              setIsBusy(false);
              setBusyKey(null);
            }
          }}
        />
      )}
    </>
  );
}

function ScopeButton({
  active,
  label,
  count,
  compact = false,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  count?: number;
  compact?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-pressed={active}
          aria-label={label}
          onClick={onClick}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-surface-3 aria-pressed:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {children}
          {active && (
            <span
              className={
                compact ? "hidden whitespace-nowrap @5xl:inline" : "whitespace-nowrap"
              }
            >
              {label}
            </span>
          )}
          {active && count != null && (
            <span className="rounded-sm bg-surface-1 px-1 font-mono text-[0.6875rem] leading-4 tabular-nums text-foreground">
              {count}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {count != null && !active ? `${label} · ${count}` : label}
      </TooltipContent>
    </Tooltip>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center px-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-surface-3">
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-80 text-xs leading-5 text-balance text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
