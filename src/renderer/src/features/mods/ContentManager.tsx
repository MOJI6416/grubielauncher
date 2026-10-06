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
import { toast } from "sonner";
import {
  DependencyType,
  IAddedLocalProject,
  ILocalIdentifyMatch,
  ILocalProject,
  LocalModDependencyIndex,
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
  planDeletion,
  sharesFile,
} from "@renderer/utilities/mod";
import { showFailureToast } from "@renderer/utilities/failures";
import {
  getLocalPathFromFileUrl,
  toFileUrl,
} from "@renderer/utilities/exportVersion";
import { IBlockedMod } from "@renderer/components/Modals/BlockedMods";
import { AI_PROMPT_MAX_CHARS } from "@/shared/config";
import { splitOrnitheGeneration } from "@/shared/profileLoaders";
import {
  ContentEntry,
  buildLibraryEntries,
  entryKey,
  fromCatalogProject,
  isSameLocalProject,
  withInstalled,
} from "./entries";
import {
  LibraryFacet,
  LibrarySort,
  buildCatalogChips,
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
import { useCatalogAvailability } from "./useCatalogAvailability";
import {
  BROWSE_PREFERENCE,
  CATALOG_PROVIDERS,
  CatalogProvider,
  CatalogTarget,
  libraryTypes,
  providerTypes,
} from "./catalogAvailability";
import { createOrnitheVersionGuard } from "./ornitheVersions";
import { useUpdateCheck } from "./useUpdateCheck";
import { toggleModFile, useModFileStates } from "./useModFileStates";
import {
  folderNameForType,
  forgetAllModFiles,
  forgetModFiles,
  listModFiles,
} from "./modFiles";
import { TrashEntry, listTrash, trashFolder, trashPaths } from "./trash";
import { useDetailPanelWidth } from "./detailWidth";
import { installQueue } from "@renderer/features/install/installQueue";
import { ROW_HEIGHT } from "./ContentRow";
import { DetailProgress } from "./ContentDetails";
import { withExtractProgress } from "@renderer/utilities/archiveProgress";
import { ImportMode } from "./ImportLocalDialog";
import { IdentifyReport } from "./IdentifyLocalDialog";
import { isIdentifiable, linkIdentified } from "./identify";
import {
  catalogLoaderOptions,
  hasConnector,
  needsConnector,
  sharedTagLoader,
  skipsDependencies,
} from "./catalogLoader";
import {
  LOCAL_IMPORT_EXTENSIONS,
  buildImportEntry,
  buildInvalidEntry,
  findForeignFiles,
  mapWithConcurrency,
} from "./localImport";
import { useSlidingIndicator } from "@renderer/utilities/useSlidingIndicator";
import { useEntranceWave } from "@renderer/utilities/useEntranceWave";
import { type DetailState, type Scope } from "./contentManagerParts";
import { ContentToolbar } from "./ContentToolbar";
import { ContentStatusBar } from "./ContentStatusBar";
import { ContentDialogs } from "./ContentDialogs";
import { ContentListPane } from "./ContentListPane";

const api = window.api;

const RUNNING_ALLOWED_TYPES = [ProjectType.RESOURCEPACK, ProjectType.SHADER];

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
  const scopeIndicator = useSlidingIndicator<HTMLDivElement>();
  const typeIndicator = useSlidingIndicator<HTMLDivElement>();
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

  const typeCounts = useMemo(() => {
    const counts = new Map<ProjectType, number>();
    for (const mod of mods) {
      counts.set(mod.projectType, (counts.get(mod.projectType) ?? 0) + 1);
    }
    return counts;
  }, [mods]);

  const catalogTarget = useMemo<CatalogTarget>(
    () => ({ loader, server, mcVersion: version?.id }),
    [loader, server, version?.id],
  );
  const availability = useCatalogAvailability(
    catalogTarget,
    !isModpacks && canBrowse,
  );

  const typesForScope = useCallback(
    (target: Scope): ProjectType[] => {
      if (isModpacks) return [ProjectType.MODPACK];
      const types =
        target === "library"
          ? libraryTypes(catalogTarget, availability, typeCounts)
          : providerTypes(
              target as CatalogProvider,
              catalogTarget,
              availability,
            );
      return running
        ? types.filter((type) => RUNNING_ALLOWED_TYPES.includes(type))
        : types;
    },
    [availability, catalogTarget, isModpacks, running, typeCounts],
  );

  const visibleProviders = useMemo(
    () =>
      isModpacks
        ? [...CATALOG_PROVIDERS]
        : CATALOG_PROVIDERS.filter(
            (provider) => typesForScope(provider).length > 0,
          ),
    [isModpacks, typesForScope],
  );

  const [scope, setScope] = useState<Scope>(
    isModpacks ? Provider.CURSEFORGE : "library",
  );
  const projectTypes = useMemo(
    () => typesForScope(scope),
    [scope, typesForScope],
  );
  const [projectType, setProjectType] = useState<ProjectType>(
    () => projectTypes[0] ?? ProjectType.MOD,
  );

  const changeScope = useCallback(
    (next: Scope) => {
      setScope(next);
      const types = typesForScope(next);
      if (types.length > 0 && !types.includes(projectType)) {
        setProjectType(types[0]);
      }
    },
    [projectType, typesForScope],
  );

  const browseScope: Scope =
    BROWSE_PREFERENCE.find(
      (provider) =>
        visibleProviders.includes(provider) &&
        typesForScope(provider).includes(projectType),
    ) ??
    visibleProviders[0] ??
    Provider.MODRINTH;
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
  const [pendingDeletion, setPendingDeletion] = useState<ContentEntry[] | null>(
    null,
  );
  const [localDependencyScan, setLocalDependencyScan] = useState<{
    path: string;
    index: LocalModDependencyIndex;
  } | null>(null);
  const localDependencies =
    localDependencyScan && localDependencyScan.path === instancePath
      ? localDependencyScan.index
      : undefined;
  const deletionRequestRef = useRef(0);
  const checkingDeletionRef = useRef(false);
  useEffect(
    () => () => {
      deletionRequestRef.current++;
    },
    [instancePath],
  );
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
    if (scope === "library") return;
    if (!canBrowse || !visibleProviders.includes(scope as CatalogProvider)) {
      setScope("library");
    }
  }, [canBrowse, scope, visibleProviders]);

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

  const ornitheLoaderId = isSelectedInstance
    ? selectedVersion?.version.loader.version?.id
    : undefined;
  const ornitheGuard = useMemo(
    () =>
      loader === "ornithe" && version?.id && !isModpacks
        ? createOrnitheVersionGuard({
            minecraftVersion: version.id,
            instanceGeneration: splitOrnitheGeneration(ornitheLoaderId ?? "")
              .generation,
            probe: api.modManager.ornitheGeneration,
          })
        : undefined,
    [isModpacks, loader, ornitheLoaderId, version?.id],
  );

  const updateCheck = useUpdateCheck({
    mods,
    projectType,
    gameVersion: version?.id,
    loader: resolvedLoader ?? "vanilla",
    enabled: scope === "library" && canEdit && isOnline && !isModpacks,
    keepsUpdate: ornitheGuard?.keepsGeneration,
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
                      item.id === selected.id
                        ? { ...item, dependencies }
                        : item,
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
      pickVersion: ornitheGuard?.pick,
      fetchVersions: async (project: IProject) => {
        const request = (target: Loader) =>
          api.modManager
            .getVersions(project.provider, project.id, {
              loader: target,
              version: version?.id,
              projectType: project.projectType,
              modUrl: project.url,
            })
            .catch(() => [] as ModVersion[]);

        const primary =
          project.projectType === ProjectType.PLUGIN && server
            ? (server.core as unknown as Loader)
            : overrideLoader || loader || "vanilla";
        const versions = await request(primary);
        const fallback = sharedTagLoader(loader, primary, project.projectType);
        return versions.length > 0 || !fallback ? versions : request(fallback);
      },
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
    [loader, ornitheGuard, overrideLoader, server, version?.id],
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
          const skipDependencies = skipsDependencies(loader, installLoader);
          if (skipDependencies && uninstalled.length > 0) {
            skippedDepsRef.current = true;
          }
          const missing = skipDependencies ? [] : uninstalled;

          for (const dep of missing) {
            if (!dep.project) continue;
            const plan = await planQuickInstall(dep.project, next, fetchers, {
              requiredBy: explicit,
            });
            next = [...next, ...plan.added];
            added.push(...plan.added);
          }
        } else {
          const plan = await planQuickInstall(
            source,
            next,
            fetchers,
            overrideLoader
              ? {
                  loader: overrideLoader,
                  dependencies: !skipsDependencies(loader, overrideLoader),
                }
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
      loader,
      overrideLoader,
      setMods,
      t,
      version,
    ],
  );

  const applyDeletion = useCallback(
    (
      targets: ContentEntry[],
      mode: "selected" | "dependencies" | "dependents",
      dependencyIndex = localDependencies,
    ) => {
      if (
        !canEdit ||
        isBusy ||
        (running &&
          targets.some(
            (entry) => !RUNNING_ALLOWED_TYPES.includes(entry.projectType),
          ))
      )
        return;
      const targetKeys = new Set(targets.map((entry) => entry.key));
      const installed = mods.filter((item) =>
        targetKeys.has(entryKey(item.provider, item.id)),
      );
      const plan = planDeletion(mods, installed, {
        includeDependents: mode === "dependents",
        removeDependencies: mode !== "selected",
        localDependencies: dependencyIndex,
      });
      if (mode !== "selected" && plan.blockers.length > 0) return;
      const keys = new Set(
        plan.remove.map((item) => entryKey(item.provider, item.id)),
      );
      if (keys.size === 0) return;
      setMods(
        mods.filter((item) => !keys.has(entryKey(item.provider, item.id))),
      );
      for (const item of plan.remove) rememberRemoved(item);
      setPendingDeletion(null);
      toast.success(
        plan.remove.length > 1
          ? t("modManager.deletedMultiple", { count: plan.remove.length })
          : t("modManager.deleted"),
      );
    },
    [
      canEdit,
      isBusy,
      localDependencies,
      mods,
      rememberRemoved,
      running,
      setMods,
      t,
    ],
  );

  const removeEntries = useCallback(
    async (targets: ContentEntry[]) => {
      if (
        !canEdit ||
        isBusy ||
        checkingDeletionRef.current ||
        (running &&
          targets.some(
            (entry) => !RUNNING_ALLOWED_TYPES.includes(entry.projectType),
          ))
      )
        return;
      checkingDeletionRef.current = true;
      const request = ++deletionRequestRef.current;
      setIsBusy(true);
      try {
        const index =
          instancePath &&
          targets.some((entry) => entry.projectType === ProjectType.MOD)
            ? await api.modManager.localDependencies(instancePath)
            : undefined;
        if (request !== deletionRequestRef.current) return;
        if (instancePath && index)
          setLocalDependencyScan({ path: instancePath, index });
        const targetKeys = new Set(targets.map((entry) => entry.key));
        const installed = mods.filter((item) =>
          targetKeys.has(entryKey(item.provider, item.id)),
        );
        const plan = planDeletion(mods, installed, {
          localDependencies: index,
        });
        if (plan.blockers.length > 0 || plan.remove.length > installed.length) {
          setPendingDeletion(targets);
          return;
        }
        applyDeletion(targets, "dependencies", index);
      } catch (error) {
        showFailureToast(t("modManager.deleteTitle"), error, {
          channels: ["modManager:localDependencies"],
        });
      } finally {
        checkingDeletionRef.current = false;
        setIsBusy(false);
      }
    },
    [applyDeletion, canEdit, instancePath, isBusy, mods, running, t],
  );

  const pendingDeletionTargets = useMemo(
    () =>
      mods.filter((item) =>
        pendingDeletion?.some(
          (entry) => entry.key === entryKey(item.provider, item.id),
        ),
      ),
    [mods, pendingDeletion],
  );
  const pendingDeletionPlan = useMemo(
    () =>
      pendingDeletion
        ? planDeletion(mods, pendingDeletionTargets, { localDependencies })
        : { remove: [], blockers: [] },
    [localDependencies, mods, pendingDeletion, pendingDeletionTargets],
  );
  const cascadeDeletionPlan = useMemo(
    () =>
      pendingDeletion
        ? planDeletion(mods, pendingDeletionTargets, {
            includeDependents: true,
            localDependencies,
          })
        : { remove: [], blockers: [] },
    [localDependencies, mods, pendingDeletion, pendingDeletionTargets],
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
          .filter(
            (entry) => entry.installed && isCheckableProject(entry.installed),
          )
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
    scope === "library" && canEdit && !isModpacks && Boolean(instancePath);

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
                inFolder || file.localPath || getLocalPathFromFileUrl(file.url);
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
          fileNames: new Map(
            targets.map((entry) => [entry.key, entry.fileName]),
          ),
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
  const isResultWave = useEntranceWave(listBusy, scope !== "library");
  const showAddRow =
    scope === "library" && canEdit && canBrowse && !isModpacks && !query;

  return (
    <>
      <div
        ref={rootRef}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <ContentToolbar
          browseLoader={browseLoader}
          canBrowse={canBrowse}
          canEdit={canEdit}
          catalogFilters={catalogFilters}
          catalogProvider={catalogProvider}
          catalogSort={catalogSort}
          facetCounts={facetCounts}
          filterGroups={filterGroups}
          filterQuery={filterQuery}
          gameVersions={gameVersions}
          identifiable={identifiable}
          identifyLocal={identifyLocal}
          isBusy={isBusy}
          isIdentifying={isIdentifying}
          isModpacks={isModpacks}
          isOnline={isOnline}
          libraryEntries={libraryEntries}
          libraryFacets={libraryFacets}
          librarySort={librarySort}
          listBusy={listBusy}
          loader={loader}
          loaderOptions={loaderOptions}
          meta={meta}
          pickLocalFiles={pickLocalFiles}
          projectType={projectType}
          projectTypes={projectTypes}
          providers={visibleProviders}
          rawQuery={rawQuery}
          scope={scope}
          scopeIndicator={scopeIndicator}
          searchRef={searchRef}
          setCatalogFilters={setCatalogFilters}
          setCatalogLoader={setCatalogLoader}
          setCatalogSort={setCatalogSort}
          setFilterQuery={setFilterQuery}
          setLibraryFacets={setLibraryFacets}
          setLibrarySort={setLibrarySort}
          setLoader={setLoader}
          setProjectType={setProjectType}
          setRawQuery={setRawQuery}
          setScope={changeScope}
          setVersion={setVersion}
          t={t}
          translateCategory={translateCategory}
          typeCounts={typeCounts}
          typeIndicator={typeIndicator}
          updateCheck={updateCheck}
          version={version}
        />

        <ContentStatusBar
          addForeignFiles={addForeignFiles}
          applyUpdateFor={applyUpdateFor}
          bar={bar}
          clearFilterChips={clearFilterChips}
          duplicates={duplicates}
          filterChips={filterChips}
          foreignFiles={foreignFiles}
          isBusy={isBusy}
          libraryEntries={libraryEntries}
          libraryFacets={libraryFacets}
          loader={loader}
          projectType={projectType}
          removeDuplicateRecords={removeDuplicateRecords}
          removeEntries={removeEntries}
          removeFilterChip={removeFilterChip}
          selectedCheckable={selectedCheckable}
          selectedEntries={selectedEntries}
          selection={selection}
          selectionAllPinned={selectionAllPinned}
          setCatalogLoader={setCatalogLoader}
          setEnabledFor={setEnabledFor}
          setLibraryFacets={setLibraryFacets}
          setPinnedFor={setPinnedFor}
          setQuery={setQuery}
          setRawQuery={setRawQuery}
          setSelection={setSelection}
          t={t}
          trashForeignFiles={trashForeignFiles}
          uncheckedCount={uncheckedCount}
          updatableCount={updatableCount}
          updateCheck={updateCheck}
        />

        <ContentListPane
          account={account}
          activeIndex={activeIndex}
          busyKey={busyKey}
          canBrowse={canBrowse}
          canEdit={canEdit}
          canSelectRows={canSelectRows}
          catalog={catalog}
          changedAt={changedAt}
          closeDetail={closeDetail}
          deletionPlan={deletionPlan}
          detail={detail}
          detailEntry={detailEntry}
          detailSelectedVersion={detailSelectedVersion}
          detailStack={detailStack}
          detailWidth={detailWidth}
          duplicates={duplicates}
          fileStates={fileStates}
          findInstalled={findInstalled}
          handleKeyDown={handleKeyDown}
          hasActiveFilters={hasActiveFilters}
          hideTrashBar={hideTrashBar}
          importMode={importMode}
          importProgress={importProgress}
          installModpack={installModpack}
          installProject={installProject}
          instancePath={instancePath}
          isBusy={isBusy}
          isDropActive={isDropActive}
          isEmptyLibrary={isEmptyLibrary}
          isModpacks={isModpacks}
          isResultWave={isResultWave}
          isTranslating={isTranslating}
          lang={lang}
          listBusy={listBusy}
          loadDetail={loadDetail}
          loader={loader}
          modpackProgress={modpackProgress}
          needsFileTimes={needsFileTimes}
          openTrashFolder={openTrashFolder}
          projectType={projectType}
          readLocalFiles={readLocalFiles}
          removeEntries={removeEntries}
          resetFilters={resetFilters}
          restorableTrash={restorableTrash}
          restoreTrash={restoreTrash}
          rowActions={rowActions}
          rows={rows}
          rowVirtualizer={rowVirtualizer}
          scope={scope}
          selectDetailVersion={selectDetailVersion}
          selection={selection}
          setDetailStack={setDetailStack}
          setIsClearTrashOpen={setIsClearTrashOpen}
          setIsDropActive={setIsDropActive}
          setListElement={setListElement}
          setPinnedFor={setPinnedFor}
          setScope={changeScope}
          browseScope={browseScope}
          showAddRow={showAddRow}
          showTrashBar={showTrashBar}
          sizeUnits={sizeUnits}
          splitRef={splitRef}
          t={t}
          translateDetail={translateDetail}
          updateCheck={updateCheck}
          version={version}
          virtualItems={virtualItems}
        />
      </div>

      <ContentDialogs
        applyDeletion={applyDeletion}
        blockedMods={blockedMods}
        cascadeDeletionPlan={cascadeDeletionPlan}
        clearTrash={clearTrash}
        detail={detail}
        detailSelectedVersion={detailSelectedVersion}
        identifyRef={identifyRef}
        identifyReport={identifyReport}
        importing={importing}
        importMode={importMode}
        isClearTrashOpen={isClearTrashOpen}
        isImportOpen={isImportOpen}
        isOnline={isOnline}
        lang={lang}
        linkLocal={linkLocal}
        mods={mods}
        onClose={onClose}
        paths={paths}
        pendingDeletion={pendingDeletion}
        pendingDeletionPlan={pendingDeletionPlan}
        pendingDeletionTargets={pendingDeletionTargets}
        projectType={projectType}
        restorableTrash={restorableTrash}
        setBlockedMods={setBlockedMods}
        setBusyKey={setBusyKey}
        setExtractPercent={setExtractPercent}
        setIdentifyReport={setIdentifyReport}
        setImporting={setImporting}
        setIsBusy={setIsBusy}
        setIsClearTrashOpen={setIsClearTrashOpen}
        setIsImportOpen={setIsImportOpen}
        setModpack={setModpack}
        setModpackStage={setModpackStage}
        setMods={setMods}
        setPendingDeletion={setPendingDeletion}
        setPendingRemoved={setPendingRemoved}
        sizeUnits={sizeUnits}
        t={t}
      />
    </>
  );
}
