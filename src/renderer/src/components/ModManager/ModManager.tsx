import {
  IFilterGroup,
  ILocalProject,
  IProject,
  ProjectType,
  Provider,
  IVersion as ModManagerVersion,
  DependencyType,
  IModpack,
  ISearchData,
  IAddedLocalProject,
  IUpdateProject,
  VersionReleaseType,
} from "@/types/ModManager";
import { DownloaderInfo } from "@/types/Downloader";
import { LoaderLabel } from "../Loaders";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import SVG from "react-inlinesvg";
import { useTranslation } from "react-i18next";
import {
  Boxes,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Earth,
  FileBox,
  Globe,
  Search,
  Settings,
  PackageCheck,
  Trash,
  CircleArrowDown,
  PanelTopOpen,
  Info,
  Languages,
  ListRestart,
  Loader2,
  PackagePlus,
  Ban,
  CircleHelp,
  Heart,
  History,
  Calendar,
  ScrollText,
  FileText,
  X,
} from "lucide-react";
import { useAtom } from "jotai";
import {
  accountAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
} from "@renderer/stores/atoms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VirtualizedSelect } from "@/components/ui/virtualized-select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BlockedMods, IBlockedMod } from "../Modals/BlockedMods";
import { ModBody } from "./ModBody";
import GalleryCarousel from "./Gallery";
import { Loader } from "@/types/Loader";
import { IVersion } from "@/types/IVersion";
import { ModToggleButton } from "./ModToggleButton";
import {
  buildInstalledIndex,
  findInstalledProject,
  getProjectTypes,
  normalizeProjectTitle,
  planDeletion,
  type DeletionPlan,
  type MatchableProject,
} from "@renderer/utilities/mod";
import { ALPModal } from "./AddLocalProjectsModal";
import { UPModal } from "./UpdateProjectsModal";
import { formatBytes } from "@renderer/utilities/file";
import { toFileUrl } from "@renderer/utilities/exportVersion";
import { toast } from "sonner";

const api = window.api;

enum LoadingType {
  SEARCH,
  FILTER,
  INFO,
  DEPENDENCY,
  NEW_VERSION,
  CHECK_AVAILABLE_UPDATE,
  CHECK_LOCAL_MOD,
  GAME_VERSIONS,
  INSTALL,
  QUICK_INSTALL,
  TRANSLATE,
}

const PAGE_LIMIT = 20;

function LoadingIcon({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} size={18} />;
}

function getPageItems(
  current: number,
  total: number,
): (number | "ellipsis-left" | "ellipsis-right")[] {
  if (total <= 9) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total]);
  for (let page = current - 2; page <= current + 2; page++) {
    if (page > 1 && page < total) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | "ellipsis-left" | "ellipsis-right")[] = [];

  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) {
      result.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }
    result.push(page);
  });

  return result;
}

function dependencyBadgeClassName(type: DependencyType): string {
  switch (type) {
    case DependencyType.REQUIRED:
      return "border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]";
    case DependencyType.EMBEDDED:
      return "border-transparent bg-[var(--success)] text-[var(--success-foreground)]";
    case DependencyType.INCOMPATIBLE:
      return "border-transparent bg-destructive text-white";
    case DependencyType.OPTIONAL:
      return "border-border bg-transparent text-muted-foreground";
    default:
      return "border-transparent bg-secondary text-secondary-foreground";
  }
}

function DependencyTypeIcon({
  type,
  className,
}: {
  type: DependencyType;
  className?: string;
}) {
  if (type == DependencyType.REQUIRED)
    return <CircleAlert className={className} />;
  if (type == DependencyType.EMBEDDED)
    return <PackageCheck className={className} />;
  if (type == DependencyType.INCOMPATIBLE) return <Ban className={className} />;
  if (type == DependencyType.OPTIONAL)
    return <CircleHelp className={className} />;
  return null;
}

function formatCompactNumber(
  value: number | undefined | null,
  lang: string,
): string | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  try {
    return new Intl.NumberFormat(lang || "en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return String(value);
  }
}

function formatDate(
  value: string | undefined | null,
  lang: string,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang || "en", { dateStyle: "medium" }).format(
      date,
    );
  } catch {
    return date.toLocaleDateString();
  }
}

function releaseTypeBadgeClassName(type: VersionReleaseType): string {
  switch (type) {
    case "release":
      return "border-transparent bg-[var(--success)] text-[var(--success-foreground)]";
    case "beta":
      return "border-transparent bg-[var(--warning)] text-[var(--warning-foreground)]";
    case "alpha":
      return "border-transparent bg-destructive text-white";
    default:
      return "border-border bg-transparent text-muted-foreground";
  }
}

function getProjectDetailBody(project: IProject) {
  return (project.body || project.description || "").trim();
}

function getProjectGallery(project: IProject) {
  return Array.isArray(project.gallery)
    ? project.gallery.filter((image) => !!image?.url)
    : [];
}

function hasProjectDetails(project: IProject) {
  return (
    getProjectDetailBody(project).length > 0 ||
    getProjectGallery(project).length > 0
  );
}

function shouldShowProjectDetailsPane(
  project: IProject | null,
  changelog?: string | null,
) {
  if (!project) return false;
  if (changelog && changelog.trim().length > 0) return true;
  return project.provider != Provider.LOCAL || hasProjectDetails(project);
}

function isSameLocalProject(
  a: Pick<ILocalProject, "id" | "title">,
  b: Pick<ILocalProject, "id" | "title">,
) {
  return a.id === b.id || a.title.toLowerCase() === b.title.toLowerCase();
}

function isLocalProjectItem(
  project: IProject | ILocalProject,
): project is ILocalProject {
  return "version" in project;
}

function ProjectDetailsPane({
  project,
  notFoundTitle,
  changelog,
  descriptionLabel,
  changelogLabel,
}: {
  project: IProject;
  notFoundTitle: string;
  changelog?: string;
  descriptionLabel: string;
  changelogLabel: string;
}) {
  const detailBody = getProjectDetailBody(project);
  const gallery = getProjectGallery(project);
  const changelogText = changelog?.trim() || "";

  const descriptionView = (
    <>
      {gallery.length > 0 && (
        <div className="shrink-0 border-b border-border p-3">
          <GalleryCarousel gallery={gallery} />
        </div>
      )}

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="min-w-0 p-4">
          {detailBody ? (
            <ModBody
              key={`${project.provider}-${project.id}-${detailBody.length}`}
              body={detailBody}
              baseUrl={project.url}
            />
          ) : (
            <Empty className="min-h-40 border">
              <EmptyHeader>
                <EmptyTitle>{notFoundTitle}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </>
  );

  if (!changelogText) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/80">
        {descriptionView}
      </div>
    );
  }

  return (
    <Tabs
      defaultValue="description"
      className="min-h-0 min-w-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border bg-card/80"
    >
      <TabsList className="mx-3 mt-3 grid h-8 w-fit shrink-0 grid-cols-2">
        <TabsTrigger value="description" className="gap-1.5 px-3 text-xs">
          <FileText className="size-3.5" />
          {descriptionLabel}
        </TabsTrigger>
        <TabsTrigger value="changelog" className="gap-1.5 px-3 text-xs">
          <ScrollText className="size-3.5" />
          {changelogLabel}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="description"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      >
        {descriptionView}
      </TabsContent>

      <TabsContent
        value="changelog"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden"
      >
        <ScrollArea className="min-h-0 min-w-0 flex-1">
          <div className="min-w-0 p-4">
            <ModBody
              key={`changelog-${project.provider}-${project.id}-${changelogText.length}`}
              body={changelogText}
              baseUrl={project.url}
            />
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

async function asyncPool<T, R>(
  poolLimit: number,
  array: T[],
  iteratorFn: (item: T) => Promise<R>,
): Promise<R[]> {
  const ret: Promise<R>[] = [];
  const executing: Promise<void>[] = [];

  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e: Promise<void> = p.then(
        () => undefined,
        () => undefined,
      );
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(ret);
}

export function ModManager({
  mods,
  setMods,
  onClose,
  version,
  loader,
  isModpacks,
  setVersion,
  setLoader,
  setModpack,
  pendingRemovedLocalProjects: controlledPendingRemovedLocalProjects,
  setPendingRemovedLocalProjects: setControlledPendingRemovedLocalProjects,
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
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [browser, setBrowser] = useState<(IProject | ILocalProject)[]>([]);
  const [provider, setProvider] = useState<Provider>(Provider.CURSEFORGE);
  const [isLoading, setLoading] = useState(false);
  const [projectType, setProjectType] = useState<ProjectType>(ProjectType.MOD);
  const [loadingType, setLoadingType] = useState<LoadingType | null>(null);
  const [sortValues, setSortValues] = useState<string[]>([]);
  const [sort, setSort] = useState("");
  const [filters, setFilters] = useState<IFilterGroup[]>([]);
  const [filter, setFilter] = useState<string[]>([]);
  const [project, setProject] = useState<IProject | null>(null);
  const [isInfoModalOpen, setInfoModalOpen] = useState(false);
  const [proccessKey, setProccessKey] = useState(-1);
  const [selectVersion, setSelectVersion] = useState<ModManagerVersion | null>(
    null,
  );
  const [installedProject, setInstalledProject] =
    useState<ILocalProject | null>(null);
  const [isLocal, setLocal] = useState(false);
  const prevProjectsRef = useRef<IProject[]>([]);
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([]);
  const [isAvailableUpdate, setIsAvailableUpdate] = useState(false);
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom);
  const [server] = useAtom(serverAtom);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom);
  const [versions, setVersions] = useState<IVersion[]>([]);
  const [searchData, setSearchData] = useState<ISearchData>();
  const [offset, setOffset] = useState(0);
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([]);
  const [isBlockedMods, setIsBlockedMods] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<DownloaderInfo | null>(null);
  const [isExtractingModpack, setIsExtractingModpack] = useState(false);
  const [paths] = useAtom(pathsAtom);
  const [selectedVersion] = useAtom(selectedVersionAtom);
  const settings = useAtom(settingsAtom)[0];
  const [account] = useAtom(accountAtom);
  const [addingLocalProjects, setAddingLocalProjects] = useState<
    IAddedLocalProject[]
  >([]);
  const [isOpenALPInfo, setIsOpenALPInfo] = useState(false);
  const [readingLocalModsProgress, setReadingLocalModsProgress] =
    useState<number>(0);
  const [updateMods, setUpdateMods] = useState<IUpdateProject[]>([]);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isAutoCheckingUpdates, setIsAutoCheckingUpdates] = useState(false);
  const [isLocalDropActive, setIsLocalDropActive] = useState(false);
  const [
    internalPendingRemovedLocalProjects,
    setInternalPendingRemovedLocalProjects,
  ] = useState<ILocalProject[]>([]);
  const pendingRemovedLocalProjects =
    controlledPendingRemovedLocalProjects ??
    internalPendingRemovedLocalProjects;
  const setPendingRemovedLocalProjects =
    setControlledPendingRemovedLocalProjects ??
    setInternalPendingRemovedLocalProjects;

  const { t } = useTranslation();

  const sizes = useMemo(
    () => [
      t("sizes.0"),
      t("sizes.1"),
      t("sizes.2"),
      t("sizes.3"),
      t("sizes.4"),
    ],
    [t],
  );

  useEffect(() => {
    const unsubscribe = api.events.onDownloaderInfo((info) => {
      setDownloadInfo(info);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const rememberRemovedLocalProject = useCallback((project: ILocalProject) => {
    setPendingRemovedLocalProjects((prev) =>
      prev.some((item) => isSameLocalProject(item, project))
        ? prev
        : [...prev, project],
    );
  }, []);

  const forgetRemovedLocalProject = useCallback((project: ILocalProject) => {
    setPendingRemovedLocalProjects((prev) =>
      prev.filter((item) => !isSameLocalProject(item, project)),
    );
  }, []);

  const defaultSort = useMemo(() => sortValues[0] ?? "", [sortValues]);

  const installedIndex = useMemo(() => buildInstalledIndex(mods), [mods]);

  const findInstalled = useCallback(
    (item: MatchableProject) => findInstalledProject(installedIndex, item),
    [installedIndex],
  );

  const deletionPlan = useMemo<DeletionPlan>(
    () =>
      installedProject
        ? planDeletion(mods, installedProject)
        : { remove: [], blockers: [] },
    [mods, installedProject],
  );

  const filterLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of filters) {
      for (const it of g.items) {
        const key =
          provider === Provider.CURSEFORGE ? (it.id ?? it.name) : it.name;
        map.set(key, it.name);
      }
    }
    return map;
  }, [filters, provider]);

  const requestIdRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationCacheRef = useRef<
    Map<string, { description?: string | null; body?: string | null }>
  >(new Map());
  const clearDebounce = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let pts: ProjectType[] = [];
      if (isModpacks) {
        pts = [ProjectType.MODPACK];
      } else {
        pts = getProjectTypes(loader || "vanilla", server, provider);
      }

      setProjectTypes(pts);
      setProjectType(pts[0]);

      if (isDownloadedVersion || !isOwnerVersion) {
        setLocal(true);
        setOffset(0);

        await search({
          version: undefined,
          loader: undefined,
          query: "",
          provider,
          projectType: pts[0],
          sort: "",
          filter: [],
          isLocal: true,
          offset: 0,
        });

        return;
      }

      setLoading(true);

      const sorts = await api.modManager.getSort(provider);
      if (cancelled) return;
      setSortValues(sorts);
      const firstSort = sorts?.[0] ?? "";
      setSort(firstSort);

      setLoadingType(LoadingType.GAME_VERSIONS);
      const gameVersions = await api.versions.getList("vanilla");
      if (cancelled) return;
      setVersions(gameVersions);

      await getFilters(provider, pts[0]);

      setOffset(0);
      await search({
        version,
        loader,
        query: "",
        provider,
        projectType: pts[0],
        sort: firstSort,
        filter: [],
        isLocal: false,
        offset: 0,
      });
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoadingType(null);
        }
      });

    return () => {
      cancelled = true;
      requestIdRef.current++;
      clearDebounce();
    };
  }, []);

  async function search({
    version,
    loader,
    query,
    provider,
    projectType,
    sort,
    filter,
    isLocal,
    offset,
  }: {
    version: IVersion | undefined;
    loader: Loader | undefined;
    query: string;
    provider: Provider;
    projectType: ProjectType;
    sort: string;
    filter: string[];
    isLocal: boolean;
    offset: number;
  }) {
    const reqId = ++requestIdRef.current;

    if (!isLocal && provider == Provider.LOCAL) {
      setBrowser([]);
      setSearchData(undefined);
      return;
    }

    setLoading(true);
    setLoadingType(LoadingType.SEARCH);

    try {
      if (isLocal) {
        const pendingItems = pendingRemovedLocalProjects.filter(
          (pending) =>
            pending.projectType == projectType &&
            !mods.some((mod) => isSameLocalProject(mod, pending)),
        );
        const items = [
          ...mods.filter((m) => m.projectType == projectType),
          ...pendingItems,
        ];

        let filtered = items;
        const q = query.trim().toLowerCase();
        if (q) {
          filtered = items.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q),
          );
        }

        const total = filtered.length;
        const page = filtered.slice(offset, offset + PAGE_LIMIT);

        if (reqId !== requestIdRef.current) return;

        setBrowser(page);
        setSearchData({
          offset,
          limit: PAGE_LIMIT,
          total,
          projects: [],
        });
      } else {
        const data = await api.modManager.search(
          query,
          provider,
          {
            version: version ? version.id : undefined,
            loader: loader
              ? projectType == ProjectType.PLUGIN && server
                ? (server.core as unknown as Loader)
                : loader
              : undefined,
            projectType,
            sort,
            filter: filter.filter((f) => f !== ""),
          },
          { offset, limit: PAGE_LIMIT },
        );

        if (reqId !== requestIdRef.current) return;

        setSearchData(data);
        setBrowser(data.projects);
        setOffset(data.offset ?? offset);

        if (data.error) toast.error(t("modManager.searchFailed"));
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setLoadingType(null);
      }
    }

    if (searchRef.current) {
      const input = searchRef.current.querySelector("input");
      if (input) setTimeout(() => input.focus(), 100);
    }
  }

  async function getFilters(provider: Provider, projectType: ProjectType) {
    if (provider == Provider.LOCAL) return;

    setLoading(true);
    setLoadingType(LoadingType.FILTER);

    const f = await api.modManager.getFilter(provider, projectType);
    setFilters(f);

    setLoading(false);
    setLoadingType(null);
  }

  function dependencyDisplay(relationType: DependencyType) {
    let dependencyType = {
      title: t("modManager.dependencyTypes.0"),
      color: "default",
    };

    if (relationType == DependencyType.REQUIRED) {
      dependencyType = {
        title: t("modManager.dependencyTypes.1"),
        color: "warning",
      };
    } else if (relationType == DependencyType.OPTIONAL) {
      dependencyType = {
        title: t("modManager.dependencyTypes.2"),
        color: "default",
      };
    } else if (relationType == DependencyType.EMBEDDED) {
      dependencyType = {
        title: t("modManager.dependencyTypes.3"),
        color: "success",
      };
    } else if (relationType == DependencyType.INCOMPATIBLE) {
      dependencyType = {
        title: t("modManager.dependencyTypes.4"),
        color: "danger",
      };
    }

    return dependencyType;
  }

  async function getAvailableUpdate(): Promise<IUpdateProject[]> {
    if (!version) return [];

    const items = mods.filter((m) => m.projectType == projectType);

    const results = await asyncPool(4, items, async (mod) => {
      try {
        if (mod.provider == Provider.LOCAL) return null;

        const vers = await api.modManager.getVersions(mod.provider, mod.id, {
          loader:
            mod.projectType == ProjectType.PLUGIN && server
              ? (server.core as unknown as Loader)
              : loader || "vanilla",
          version: version.id,
          projectType: mod.projectType,
          modUrl: mod.url,
        });

        const latest = vers[0];
        if (!latest) return null;
        if (mod.version?.id == latest.id) return null;

        return {
          project: mod,
          version: latest,
        };
      } catch {
        return null;
      }
    });

    return results.filter(Boolean) as IUpdateProject[];
  }

  useEffect(() => {
    if (!isLocal || isDownloadedVersion || !isOwnerVersion || !version) {
      return;
    }
    const hasRemote = mods.some(
      (m) => m.projectType == projectType && m.provider != Provider.LOCAL,
    );
    if (!hasRemote) {
      setUpdateMods([]);
      return;
    }

    let cancelled = false;
    setIsAutoCheckingUpdates(true);
    getAvailableUpdate()
      .then((res) => {
        if (!cancelled) setUpdateMods(res);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsAutoCheckingUpdates(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocal, projectType, version?.id]);

  async function quickInstall(root: IProject, index: number) {
    if (isModpacks || !version) return;

    clearDebounce();
    setLoading(true);
    setLoadingType(LoadingType.QUICK_INSTALL);
    setProccessKey(index);

    const resolveLoader = (pt: ProjectType): Loader =>
      pt == ProjectType.PLUGIN && server
        ? (server.core as unknown as Loader)
        : loader || "vanilla";

    try {
      const added: ILocalProject[] = [];
      const seenIds = new Set<string>(mods.map((m) => `${m.provider}:${m.id}`));
      const seenTitles = new Set<string>(
        mods.map((m) => normalizeProjectTitle(m.title)).filter(Boolean),
      );

      const isHandled = (project: IProject) => {
        const title = normalizeProjectTitle(project.title);
        return (
          seenIds.has(`${project.provider}:${project.id}`) ||
          (!!title && seenTitles.has(title)) ||
          !!findInstalled(project)
        );
      };

      const queue: IProject[] = [root];
      let rootMissingVersion = false;

      while (queue.length) {
        const project = queue.shift()!;
        if (isHandled(project)) continue;

        const vers = await api.modManager.getVersions(
          project.provider,
          project.id,
          {
            loader: resolveLoader(project.projectType),
            version: version.id,
            projectType: project.projectType,
            modUrl: project.url,
          },
        );

        const latest = vers[0];
        if (!latest) {
          if (project.id == root.id) rootMissingVersion = true;
          continue;
        }

        const resolvedDeps = latest.dependencies.length
          ? await api.modManager.getDependencies(
              project.provider,
              project.id,
              latest.dependencies,
            )
          : [];

        added.push({
          title: project.title,
          description: project.description,
          projectType: project.projectType,
          iconUrl: project.iconUrl,
          url: project.url,
          provider: project.provider,
          id: project.id,
          version: {
            id: latest.id,
            files: latest.files.map((f) => ({
              filename: f.filename,
              size: f.size,
              isServer: f.isServer,
              url: f.url,
              sha1: f.sha1,
            })),
            dependencies: resolvedDeps.map((d) => ({
              title: d.project?.title || "",
              relationType: d.relationType,
            })),
          },
        });

        const title = normalizeProjectTitle(project.title);
        seenIds.add(`${project.provider}:${project.id}`);
        if (title) seenTitles.add(title);

        for (const dep of resolvedDeps) {
          if (
            dep.relationType == DependencyType.REQUIRED &&
            dep.project &&
            !isHandled(dep.project)
          ) {
            queue.push(dep.project);
          }
        }
      }

      if (added.length == 0) {
        if (rootMissingVersion) toast.error(t("modManager.notFoundMod"));
        else toast.warning(t("modManager.alreadyInstalled"));
        return;
      }

      setMods([...mods, ...added]);

      const depCount = added.length - 1;
      if (depCount > 0) {
        toast.success(t("modManager.quickInstalled", { count: depCount }));
      } else {
        toast.success(t("modManager.added"));
      }
    } catch {
      toast.error(t("modManager.notFoundMod"));
    } finally {
      setLoading(false);
      setLoadingType(null);
      setProccessKey(-1);
    }
  }

  const readLocalMods = useCallback(
    async (pathsList: string[]) => {
      setLoading(true);
      setLoadingType(LoadingType.CHECK_LOCAL_MOD);
      setReadingLocalModsProgress(0);

      const localProjects: IAddedLocalProject[] = [];

      for (const path of pathsList) {
        setReadingLocalModsProgress(
          Math.round(((localProjects.length + 1) / pathsList.length) * 100),
        );

        const info = await api.modManager.checkLocalMod(path);
        if (!info) {
          localProjects.push({
            project: {
              description: "",
              iconUrl: null,
              id: "-1",
              projectType,
              provider: Provider.LOCAL,
              title: await api.path.basename(path),
              url: "",
              versions: [],
              body: "",
              gallery: [],
            },
            status: "invalid",
          });
          continue;
        }

        const isDuplicate = Boolean(
          mods.find(
            (m) =>
              m.title.toLowerCase() == info.name.toLowerCase() ||
              m.id == info.id ||
              m.version?.files.find((f) => f.sha1 == info.sha1),
          ),
        );

        const ver: ModManagerVersion = {
          dependencies: [],
          id: info.version || "",
          downloads: -1,
          name: info.version || "",
          files: [
            {
              filename: info.filename,
              isServer: true,
              size: info.size,
              url: toFileUrl(info.path),
              sha1: info.sha1,
            },
          ],
        };

        localProjects.push({
          project: {
            description: info.description,
            iconUrl: info.icon,
            id: info.id,
            projectType,
            provider: Provider.LOCAL,
            title: info.name,
            url: info.url,
            versions: [ver],
            body: "",
            gallery: [],
          },
          status: isDuplicate ? "duplicate" : "valid",
        });
      }

      if (localProjects.length == 0) {
        toast.warning(t("modManager.invalidMod"));
      } else {
        setAddingLocalProjects(localProjects);
      }

      setLoading(false);
      setLoadingType(null);
      setReadingLocalModsProgress(0);
      setIsOpenALPInfo(true);
    },
    [projectType, mods, t],
  );

  const pickLocalMods = async () => {
    clearDebounce();
    const filePaths = await api.other.openFileDialog(
      false,
      [{ name: "Mods", extensions: ["jar", "zip"] }],
      true,
    );
    if (!filePaths || filePaths.length == 0) return;
    await readLocalMods(filePaths);
  };

  const dropLocalMods = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsLocalDropActive(false);

    if (isLoading && loadingType == LoadingType.CHECK_LOCAL_MOD) return;

    const paths = [...event.dataTransfer.files]
      .map((file) => api.other.getPathForFile(file))
      .filter((path) => /\.(jar|zip)$/i.test(path));

    if (paths.length == 0) {
      toast.warning(t("modManager.invalidMod"));
      return;
    }

    await readLocalMods(paths);
  };

  const runSearch = async (queryValue: string, nextOffset = 0) => {
    clearDebounce();
    setOffset(nextOffset);

    await search({
      version,
      loader,
      query: queryValue,
      provider,
      projectType,
      sort,
      filter,
      isLocal,
      offset: nextOffset,
    });
  };

  const selectProvider = async (newProvider: Provider) => {
    if (newProvider === provider) return;
    clearDebounce();
    setProvider(newProvider);
    setLocal(false);
    setSearchData(undefined);
    setOffset(0);
    setFilter([]);

    let pts: ProjectType[] = [];
    if (!isModpacks) {
      pts = getProjectTypes(loader || "vanilla", server, newProvider);
    } else {
      pts = [...projectTypes];
    }

    const nextProjectType = pts.includes(projectType) ? projectType : pts[0];
    setProjectTypes(pts);
    setProjectType(nextProjectType);

    const sorts = await api.modManager.getSort(newProvider);
    setSortValues(sorts);
    const nextSort = sorts?.[0] ?? "";
    setSort(nextSort);

    await getFilters(newProvider, nextProjectType);

    await search({
      version,
      loader,
      query: searchQuery,
      provider: newProvider,
      projectType: nextProjectType,
      sort: nextSort,
      filter: [],
      isLocal: false,
      offset: 0,
    });
  };

  const isSearchLoading = isLoading && loadingType == LoadingType.SEARCH;
  const isSearchInputDisabled = isLoading && loadingType != LoadingType.SEARCH;

  return (
    <TooltipProvider delayDuration={500}>
      <Dialog
        open={true}
        onOpenChange={(open) => {
          if (!open && !isLoading) onClose();
        }}
      >
        {/* Sit below the native window-controls strip (titleBarOverlay) so the
            panel's own close button never lands under the OS min/max/close.
            env(titlebar-area-height) is the overlay height on Windows and 0px
            elsewhere, so other platforms keep the original 1rem inset. */}
        <DialogContent aria-describedby={undefined}
          style={{
            top: "calc(env(titlebar-area-height, 0px) + 1rem)",
            left: "1rem",
            right: "1rem",
            bottom: "1rem",
            width: "auto",
            height: "auto",
            maxWidth: "none",
            maxHeight: "none",
            margin: 0,
          }}
          className="grid grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0"
          onPointerDownOutside={(event) => {
            if (isLoading) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isLoading) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b py-4 pr-12 pl-5">
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="size-5" />
              {t("modManager.title")}
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 min-w-0 w-full overflow-hidden px-5 pb-5">
            <>
              <div className="flex h-full min-w-0 w-full flex-col space-y-2 overflow-hidden">
                <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-hidden rounded-xl border bg-card/70 p-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    {!isLocal && (
                      <div className="flex shrink-0 items-center gap-0.5 rounded-lg border bg-background/40 p-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant={
                                provider == Provider.CURSEFORGE
                                  ? "secondary"
                                  : "ghost"
                              }
                              className="size-7"
                              disabled={isLoading}
                              onClick={() =>
                                selectProvider(Provider.CURSEFORGE)
                              }
                              aria-label="CurseForge"
                            >
                              <SiCurseforge className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>CurseForge</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant={
                                provider == Provider.MODRINTH
                                  ? "secondary"
                                  : "ghost"
                              }
                              className="size-7"
                              disabled={isLoading}
                              onClick={() => selectProvider(Provider.MODRINTH)}
                              aria-label="Modrinth"
                            >
                              <SiModrinth className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modrinth</TooltipContent>
                        </Tooltip>
                        {!isModpacks && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant={
                                  provider == Provider.LOCAL
                                    ? "secondary"
                                    : "ghost"
                                }
                                className="size-7"
                                disabled={isLoading}
                                onClick={() => selectProvider(Provider.LOCAL)}
                                aria-label={t("modManager.local")}
                              >
                                <FileBox className="size-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("modManager.local")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}

                    {!isModpacks && (
                      <div className="w-40 min-w-40">
                        <Select
                          name="projectType"
                          disabled={isLoading}
                          value={projectType}
                          onValueChange={async (value: ProjectType) => {
                            clearDebounce();
                            if (!value) return;

                            setProjectType(value);
                            setOffset(0);

                            if (!isLocal) await getFilters(provider, value);

                            await search({
                              version,
                              loader,
                              query: searchQuery,
                              provider,
                              projectType: value,
                              sort,
                              filter,
                              isLocal,
                              offset: 0,
                            });
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={t("modManager.type")}
                          >
                            <SelectValue placeholder={t("modManager.type")} />
                          </SelectTrigger>
                          <SelectContent>
                            {projectTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {t("modManager.projectTypes." + type)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {isModpacks && (
                    <>
                      <div className="w-28 min-w-28">
                        <VirtualizedSelect
                          size="sm"
                          aria-label={t("versions.version")}
                          disabled={isLoading}
                          value={version?.id || ""}
                          placeholder={t("versions.version")}
                          searchPlaceholder={t("common.search")}
                          emptyText={t("common.notFound")}
                          options={versions.map((v) => ({
                            value: v.id,
                            label: v.id,
                          }))}
                          onValueChange={async (value) => {
                            clearDebounce();
                            const ver = versions.find((v) => v.id == value);
                            setVersion(ver);
                            setOffset(0);

                            await search({
                              loader,
                              version: ver,
                              query: searchQuery,
                              provider,
                              projectType,
                              sort,
                              filter,
                              isLocal,
                              offset: 0,
                            });
                          }}
                        />
                      </div>

                      <div className="w-36 min-w-36">
                        <Select
                          name="loader"
                          disabled={isLoading}
                          value={loader || ""}
                          onValueChange={async (value: Loader) => {
                            clearDebounce();
                            const l = value as Loader;
                            setLoader(l);
                            setOffset(0);

                            await search({
                              version,
                              loader: l,
                              query: searchQuery,
                              provider,
                              projectType,
                              sort,
                              filter,
                              isLocal,
                              offset: 0,
                            });
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={t("versions.loader")}
                          >
                            <SelectValue placeholder={t("versions.loader")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="forge">
                              <LoaderLabel loader="forge" />
                            </SelectItem>
                            <SelectItem value="neoforge">
                              <LoaderLabel loader="neoforge" />
                            </SelectItem>
                            <SelectItem value="fabric">
                              <LoaderLabel loader="fabric" />
                            </SelectItem>
                            <SelectItem value="quilt">
                              <LoaderLabel loader="quilt" />
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {(provider != Provider.LOCAL || isLocal) && (
                    <div
                      ref={searchRef}
                      className="relative min-w-0 flex-1 basis-48"
                    >
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        disabled={isSearchInputDisabled}
                        className="pr-16 pl-9"
                        placeholder={t("browser.search")}
                        value={searchQuery}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSearchQuery(value);

                          clearDebounce();
                          searchDebounceRef.current = setTimeout(async () => {
                            await runSearch(value, 0);
                          }, 500);
                        }}
                        onKeyDown={async (event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            await runSearch(searchQuery, 0);
                          }

                          if (event.key === "Escape" && searchQuery) {
                            event.preventDefault();
                            setSearchQuery("");
                            await runSearch("", 0);
                          }
                        }}
                      />
                      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                        {isSearchLoading && (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        )}

                        {searchQuery && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="size-6 text-muted-foreground hover:text-foreground"
                            disabled={isSearchInputDisabled}
                            onClick={async () => {
                              setSearchQuery("");
                              await runSearch("", 0);
                            }}
                          >
                            <X className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {!isLocal && provider != Provider.LOCAL && (
                    <>
                      <div className="min-w-48 w-48">
                        <Select
                          name="sort"
                          disabled={isLoading}
                          value={sort}
                          onValueChange={async (value) => {
                            clearDebounce();
                            if (!value) return;
                            setSort(value);
                            setOffset(0);

                            await search({
                              version,
                              loader,
                              query: searchQuery,
                              provider,
                              projectType,
                              sort: value,
                              filter,
                              isLocal,
                              offset: 0,
                            });
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-full"
                            aria-label={t("modManager.sort")}
                          >
                            <SelectValue placeholder={t("modManager.sort")} />
                          </SelectTrigger>
                          <SelectContent>
                            {sortValues.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t("modManager.sorts." + s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-44 w-44">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="h-8 w-full justify-between overflow-hidden px-3"
                              disabled={isLoading}
                            >
                              {isLoading &&
                                loadingType == LoadingType.FILTER && (
                                  <LoadingIcon />
                                )}
                              <span className="min-w-0 flex-1 truncate text-left">
                                {filter.length
                                  ? filter
                                      .map((f) => filterLabelMap.get(f) ?? f)
                                      .join(", ")
                                  : t("modManager.filter")}
                              </span>
                              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            className="max-h-80 w-72"
                            align="end"
                          >
                            {filters.map((group, index) => (
                              <div key={index}>
                                {index > 0 && <DropdownMenuSeparator />}
                                <DropdownMenuLabel>
                                  {group.title}
                                </DropdownMenuLabel>
                                {group.items.map((f) => {
                                  const key =
                                    provider === Provider.CURSEFORGE
                                      ? (f.id ?? f.name)
                                      : f.name;
                                  const label =
                                    provider === Provider.CURSEFORGE
                                      ? f.name
                                      : f.name.charAt(0).toUpperCase() +
                                        f.name.slice(1);

                                  return (
                                    <DropdownMenuCheckboxItem
                                      key={key}
                                      checked={filter.includes(key)}
                                      onSelect={(event) =>
                                        event.preventDefault()
                                      }
                                      onCheckedChange={async (checked) => {
                                        clearDebounce();
                                        const values =
                                          checked === true
                                            ? [...filter, key]
                                            : filter.filter((v) => v !== key);
                                        setFilter(values);
                                        setOffset(0);

                                        await search({
                                          version,
                                          loader,
                                          query: searchQuery,
                                          provider,
                                          projectType,
                                          sort,
                                          filter: values,
                                          isLocal,
                                          offset: 0,
                                        });
                                      }}
                                    >
                                      {f.icon?.includes("svg") ? (
                                        <SVG
                                          src={f.icon || ""}
                                          width={16}
                                          height={16}
                                          title={f.name}
                                        />
                                      ) : f.icon ? (
                                        <img
                                          src={f.icon || ""}
                                          width={16}
                                          height={16}
                                          className="size-4 shrink-0 object-cover"
                                          alt=""
                                        />
                                      ) : null}
                                      <span className="truncate text-xs">
                                        {label}
                                      </span>
                                    </DropdownMenuCheckboxItem>
                                  );
                                })}
                              </div>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </>
                  )}

                  {(provider != Provider.LOCAL || isLocal) && (
                    <Button
                      variant="secondary"
                      size="icon"
                      disabled={isLoading}
                      onClick={async () => {
                        clearDebounce();
                        setSearchQuery("");
                        setSort(defaultSort);
                        setFilter([]);
                        setOffset(0);

                        if (isModpacks) {
                          setVersion(undefined);
                          setLoader(undefined);
                        }

                        await search({
                          version: isModpacks ? undefined : version,
                          loader: isModpacks ? undefined : loader,
                          query: "",
                          provider,
                          projectType,
                          sort: defaultSort,
                          filter: [],
                          isLocal,
                          offset: 0,
                        });
                      }}
                    >
                      <ListRestart className="size-4" />
                    </Button>
                  )}

                  {!isDownloadedVersion && isOwnerVersion && !isModpacks && (
                    <div className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5">
                      <Globe className="size-4 text-muted-foreground" />
                      <Switch
                        disabled={isLoading}
                        checked={isLocal}
                        onCheckedChange={async (checked) => {
                          clearDebounce();
                          const nextChecked = checked === true;

                          setLocal(nextChecked);
                          setSearchQuery("");
                          setSort(defaultSort);
                          setFilter([]);
                          setOffset(0);

                          if (!nextChecked)
                            await getFilters(provider, projectType);

                          await search({
                            version,
                            loader,
                            query: "",
                            provider,
                            projectType,
                            sort: defaultSort,
                            filter: [],
                            isLocal: nextChecked,
                            offset: 0,
                          });
                        }}
                      />
                      <PackageCheck className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {isLocal && (
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border bg-card/70 px-3 py-2">
                    <div className="min-w-0 max-w-full">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="shrink-0 tabular-nums"
                        >
                          {
                            mods.filter((m) => m.projectType == projectType)
                              .length
                          }
                        </Badge>
                        <p className="min-w-0 truncate text-sm font-medium">
                          {t("modManager.local")}
                        </p>
                      </div>
                    </div>

                    {!isDownloadedVersion &&
                      isOwnerVersion &&
                      (isAutoCheckingUpdates ? (
                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          <LoadingIcon />
                          {t("modManager.checkingUpdates")}
                        </div>
                      ) : updateMods.length > 0 ? (
                        <Button
                          size="sm"
                          className="min-w-0 shrink-0 border-transparent bg-[var(--warning)] text-[var(--warning-foreground)] hover:bg-[var(--warning)]/90"
                          disabled={isLoading}
                          onClick={() => setIsUpdateModalOpen(true)}
                        >
                          <CircleArrowDown className="size-4" />
                          <span className="min-w-0 truncate">
                            {t("modManager.updateAll")} ({updateMods.length})
                          </span>
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-w-0 shrink-0"
                          disabled={isLoading}
                          onClick={async () => {
                            try {
                              clearDebounce();
                              setLoading(true);
                              setLoadingType(
                                LoadingType.CHECK_AVAILABLE_UPDATE,
                              );

                              const canBeUpdated = await getAvailableUpdate();
                              setUpdateMods(canBeUpdated);

                              if (canBeUpdated.length > 0) {
                                setIsUpdateModalOpen(true);
                                toast.success(
                                  t("modManager.availableUpdates", {
                                    count: canBeUpdated.length,
                                  }),
                                );
                              } else {
                                toast.warning(
                                  t("modManager.noAvailableUpdates"),
                                );
                              }
                            } finally {
                              setLoading(false);
                              setLoadingType(null);
                            }
                          }}
                        >
                          {isLoading &&
                          loadingType == LoadingType.CHECK_AVAILABLE_UPDATE ? (
                            <LoadingIcon />
                          ) : (
                            <PanelTopOpen className="size-4" />
                          )}
                          <span className="min-w-0 truncate">
                            {t("modManager.checkUpdates")}
                          </span>
                        </Button>
                      ))}
                  </div>
                )}

                {!isLocal && provider == Provider.LOCAL ? (
                  <Empty
                    className={`flex-1 rounded-xl border border-dashed bg-muted/20 transition-colors ${
                      isLocalDropActive
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsLocalDropActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = "copy";
                      setIsLocalDropActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (
                        event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        return;
                      setIsLocalDropActive(false);
                    }}
                    onDrop={dropLocalMods}
                  >
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileBox />
                      </EmptyMedia>
                      <EmptyTitle>{t("modManager.selectLocals")}</EmptyTitle>
                      <EmptyDescription>.jar / .zip</EmptyDescription>
                    </EmptyHeader>

                    <EmptyContent>
                      {readingLocalModsProgress > 0 && (
                        <Progress
                          value={readingLocalModsProgress}
                          className="w-64"
                        />
                      )}

                      <Button
                        disabled={
                          isLoading &&
                          loadingType == LoadingType.CHECK_LOCAL_MOD
                        }
                        onClick={pickLocalMods}
                      >
                        {isLoading &&
                        loadingType == LoadingType.CHECK_LOCAL_MOD ? (
                          <LoadingIcon />
                        ) : (
                          <FileBox className="size-4" />
                        )}
                        {t("common.choose")}
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : isLoading &&
                  (loadingType == LoadingType.SEARCH ||
                    loadingType == LoadingType.FILTER ||
                    loadingType == LoadingType.GAME_VERSIONS) ? (
                  <div className="flex justify-center items-center flex-1 min-h-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoadingIcon />
                      {t("common.searching")}
                    </div>
                  </div>
                ) : browser.length > 0 ? (
                  <div className="flex-1 min-h-0">
                    <ScrollArea className="h-full pr-3">
                      {browser.map((item, index) => {
                        const isInstalled = findInstalled(item);
                        const isPendingRemoved =
                          item.provider == Provider.LOCAL &&
                          !isInstalled &&
                          pendingRemovedLocalProjects.some((project) =>
                            isSameLocalProject(project, item),
                          );

                        return (
                          <Card
                            key={`${item.provider}-${item.id}`}
                            className={`mb-2 mr-2 min-w-0 overflow-hidden py-0 shadow-none transition-colors ${
                              isInstalled && !isPendingRemoved && !isLocal
                                ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                                : "hover:bg-accent/25"
                            }`}
                          >
                            <CardContent className="min-w-0 overflow-hidden p-3">
                              <div className="flex min-w-0 items-center justify-between gap-2 overflow-hidden">
                                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                                    {item.iconUrl ? (
                                      <img
                                        src={item.iconUrl}
                                        alt={item.title}
                                        width={56}
                                        height={56}
                                        className="h-full w-full object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <FileBox className="size-5" />
                                    )}
                                  </div>
                                  <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p
                                        className="truncate font-medium text-foreground"
                                        title={item.title}
                                      >
                                        {item.title}
                                      </p>
                                      {isInstalled && !isPendingRemoved && !isLocal && (
                                        <Badge className="h-5 shrink-0 gap-1 border-transparent bg-[var(--success)] px-1.5 text-[0.65rem] font-medium text-[var(--success-foreground)]">
                                          <PackageCheck className="size-2.5" />
                                          {t("modManager.installed")}
                                        </Badge>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="line-clamp-2 min-w-0 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                        {item.description}
                                      </p>
                                    )}

                                    {!isLocal &&
                                      item.provider != Provider.LOCAL &&
                                      (() => {
                                        const stats = (item as IProject).stats;
                                        if (!stats) return null;
                                        const lang = settings.lang || "en";
                                        const downloads = formatCompactNumber(
                                          stats.downloads,
                                          lang,
                                        );
                                        const likes =
                                          item.provider == Provider.MODRINTH &&
                                          stats.follows
                                            ? formatCompactNumber(
                                                stats.follows,
                                                lang,
                                              )
                                            : null;
                                        if (!downloads && !likes) return null;
                                        return (
                                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            {downloads && (
                                              <span
                                                className="inline-flex items-center gap-1"
                                                title={t(
                                                  "modManager.statsDownloads",
                                                )}
                                              >
                                                <Download className="size-3.5 shrink-0" />
                                                <span className="tabular-nums">
                                                  {downloads}
                                                </span>
                                              </span>
                                            )}
                                            {likes && (
                                              <span
                                                className="inline-flex items-center gap-1"
                                                title={t(
                                                  "modManager.statsLikes",
                                                )}
                                              >
                                                <Heart className="size-3.5 shrink-0" />
                                                <span className="tabular-nums">
                                                  {likes}
                                                </span>
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })()}

                                    {isPendingRemoved ? (
                                      <Badge
                                        variant="outline"
                                        className="w-fit gap-1.5"
                                      >
                                        <Trash className="size-3.5" />
                                        {t("modManager.deleted")}
                                      </Badge>
                                    ) : isLocal ? (
                                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                                        {item.provider ==
                                        Provider.CURSEFORGE ? (
                                          <>
                                            <SiCurseforge className="size-3.5 shrink-0" />
                                            CurseForge
                                          </>
                                        ) : item.provider ==
                                          Provider.MODRINTH ? (
                                          <>
                                            <SiModrinth className="size-3.5 shrink-0" />
                                            Modrinth
                                          </>
                                        ) : item.provider == Provider.LOCAL ? (
                                          <>
                                            <FileBox className="size-3.5 shrink-0" />
                                            {t("modManager.local")}
                                          </>
                                        ) : (
                                          <>
                                            <Globe className="size-3.5 shrink-0" />
                                            {t("modManager.other")}
                                          </>
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                  {isPendingRemoved &&
                                  item.provider == Provider.LOCAL &&
                                  isLocalProjectItem(item) ? (
                                    <Button
                                      size="icon-lg"
                                      variant="secondary"
                                      className="shrink-0"
                                      disabled={isLoading}
                                      onClick={() => {
                                        setMods([...mods, item]);
                                        forgetRemovedLocalProject(item);
                                        toast.success(t("modManager.added"));
                                      }}
                                    >
                                      <Download className="size-4" />
                                    </Button>
                                  ) : item.provider != Provider.OTHER &&
                                    item.provider != Provider.LOCAL &&
                                    !isDownloadedVersion &&
                                    isOwnerVersion ? (
                                    <>
                                      {!isModpacks && !isInstalled && (
                                        <Button
                                          className="shrink-0"
                                          disabled={isLoading || !version}
                                          title={t("modManager.quickInstall")}
                                          onClick={() =>
                                            quickInstall(
                                              item as IProject,
                                              index,
                                            )
                                          }
                                        >
                                          {isLoading &&
                                          loadingType ==
                                            LoadingType.QUICK_INSTALL &&
                                          proccessKey == index ? (
                                            <LoadingIcon />
                                          ) : (
                                            <PackagePlus className="size-4" />
                                          )}
                                          {t("modManager.install")}
                                        </Button>
                                      )}
                                      <Button
                                        size="icon-lg"
                                        variant="secondary"
                                        className="shrink-0"
                                        disabled={isLoading}
                                        onClick={async () => {
                                          clearDebounce();
                                          setLoading(true);
                                          setLoadingType(LoadingType.INFO);
                                          setProccessKey(index);

                                          const base = item as IProject;

                                          let detailProject = base;
                                          let body =
                                            base.body || base.description || "";
                                          let gallery: IProject["gallery"] =
                                            (base as IProject).gallery || [];
                                          const vers: ModManagerVersion[] = [];

                                          if (base.provider != Provider.LOCAL) {
                                            const fetched =
                                              await api.modManager.getVersions(
                                                base.provider,
                                                base.id,
                                                {
                                                  loader:
                                                    projectType ==
                                                      ProjectType.PLUGIN &&
                                                    server
                                                      ? (server.core as unknown as Loader)
                                                      : loader,
                                                  version: version
                                                    ? version.id
                                                    : undefined,
                                                  projectType,
                                                  modUrl: base.url,
                                                },
                                              );
                                            vers.push(...fetched);

                                            if (
                                              !vers.length &&
                                              isInstalled?.version
                                            ) {
                                              vers.push({
                                                dependencies: [],
                                                downloads: -1,
                                                id: isInstalled.version.id,
                                                files:
                                                  isInstalled.version.files,
                                                name:
                                                  isInstalled.version.files[0]
                                                    ?.filename ??
                                                  isInstalled.version.id,
                                              });
                                            }
                                          }

                                          if (!vers.length) {
                                            setLoading(false);
                                            setLoadingType(null);
                                            setProccessKey(-1);
                                            toast.error(
                                              t("modManager.notFoundMod"),
                                            );
                                            return;
                                          }

                                          let currentIndex = 0;
                                          if (isInstalled) {
                                            setInstalledProject(isInstalled);
                                            const idx = vers.findIndex(
                                              (v) =>
                                                v.id == isInstalled.version?.id,
                                            );
                                            currentIndex = idx == -1 ? 0 : idx;
                                          } else {
                                            setInstalledProject(null);
                                          }

                                          if (base.provider != Provider.LOCAL) {
                                            const projectInfo =
                                              await api.modManager.getProject(
                                                base.provider,
                                                base.id,
                                              );
                                            if (projectInfo) {
                                              detailProject = {
                                                ...base,
                                                ...projectInfo,
                                              };
                                              body =
                                                projectInfo.body ||
                                                body ||
                                                projectInfo.description ||
                                                "";
                                              gallery =
                                                projectInfo.gallery?.length > 0
                                                  ? projectInfo.gallery
                                                  : gallery;
                                            }
                                          }

                                          let currentVersion =
                                            vers[currentIndex] ?? vers[0];
                                          currentVersion = {
                                            ...currentVersion,
                                            dependencies:
                                              currentVersion.dependencies ?? [],
                                          };

                                          if (
                                            !isModpacks &&
                                            currentVersion.dependencies.length >
                                              0 &&
                                            currentVersion.dependencies.filter(
                                              (d) => d.project,
                                            ).length == 0
                                          ) {
                                            const deps =
                                              await api.modManager.getDependencies(
                                                base.provider,
                                                base.id,
                                                currentVersion.dependencies,
                                              );
                                            currentVersion = {
                                              ...currentVersion,
                                              dependencies: deps,
                                            };
                                            vers[currentIndex] = currentVersion;
                                          }

                                          setProject({
                                            ...detailProject,
                                            versions: vers,
                                            body,
                                            gallery,
                                          });
                                          setSelectVersion(currentVersion);
                                          setIsAvailableUpdate(
                                            currentIndex != 0,
                                          );

                                          setLoading(false);
                                          setLoadingType(null);
                                          setProccessKey(-1);
                                          setInfoModalOpen(true);
                                        }}
                                      >
                                        {isLoading &&
                                        loadingType == LoadingType.INFO &&
                                        proccessKey == index ? (
                                          <LoadingIcon />
                                        ) : isInstalled ? (
                                          <Settings className="size-4" />
                                        ) : (
                                          <Info className="size-4" />
                                        )}
                                      </Button>
                                    </>
                                  ) : (
                                    item.url && (
                                      <Button
                                        variant="secondary"
                                        size="icon"
                                        onClick={() =>
                                          api.shell.openExternal(item.url)
                                        }
                                      >
                                        {item.provider ==
                                        Provider.CURSEFORGE ? (
                                          <SiCurseforge className="size-4" />
                                        ) : item.provider ==
                                          Provider.MODRINTH ? (
                                          <SiModrinth className="size-4" />
                                        ) : (
                                          <Earth className="size-4" />
                                        )}
                                      </Button>
                                    )
                                  )}

                                  {isInstalled &&
                                    isLocal &&
                                    !isDownloadedVersion &&
                                    isOwnerVersion && (
                                      <>
                                        {selectedVersion && (
                                          <ModToggleButton
                                            isLoading={isLoading}
                                            mod={isInstalled}
                                            versionPath={
                                              selectedVersion.versionPath
                                            }
                                          />
                                        )}

                                        <Button
                                          variant="destructive"
                                          size="icon"
                                          disabled={isLoading}
                                          onClick={async () => {
                                            if (
                                              item.provider == Provider.LOCAL &&
                                              isInstalled
                                            ) {
                                              rememberRemovedLocalProject(
                                                isInstalled,
                                              );
                                            }

                                            let newMods = [...mods];
                                            const idx = newMods.findIndex(
                                              (p) => p.id == item.id,
                                            );
                                            if (idx !== -1)
                                              newMods.splice(idx, 1);
                                            setMods([...newMods]);

                                            setInstalledProject(null);
                                            toast.success(
                                              t("modManager.deleted"),
                                            );
                                          }}
                                        >
                                          <Trash className="size-4" />
                                        </Button>
                                      </>
                                    )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </ScrollArea>
                  </div>
                ) : searchData && searchData.total === 0 ? (
                  <div className="flex-1 min-h-0">
                    <Empty className="h-full min-h-72 border border-dashed bg-muted/20">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Search />
                        </EmptyMedia>
                        <EmptyTitle>{t("common.notFound")}</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  <div className="flex justify-center items-center flex-1 min-h-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <LoadingIcon />
                      {t("common.searching")}
                    </div>
                  </div>
                )}

                <div className="flex h-10 shrink-0 items-center justify-center pt-1">
                  {searchData &&
                    searchData.total > 0 &&
                    loadingType != LoadingType.FILTER &&
                    loadingType != LoadingType.GAME_VERSIONS && (
                      <Pagination className="w-auto">
                        <PaginationContent className="gap-1">
                          {(() => {
                            const currentPage =
                              Math.floor(offset / searchData.limit) + 1;
                            const totalPages = Math.ceil(
                              searchData.total / searchData.limit,
                            );
                            const disabled =
                              isLoading && loadingType == LoadingType.SEARCH;
                            const goToPage = async (page: number) => {
                              if (
                                disabled ||
                                page < 1 ||
                                page > totalPages ||
                                page == currentPage
                              )
                                return;

                              clearDebounce();
                              const newOffset = (page - 1) * searchData.limit;
                              setOffset(newOffset);

                              await search({
                                version,
                                loader,
                                query: searchQuery,
                                provider,
                                projectType,
                                sort,
                                filter,
                                isLocal,
                                offset: newOffset,
                              });
                            };

                            return (
                              <>
                                <PaginationItem>
                                  <PaginationLink
                                    href="#"
                                    size="icon"
                                    aria-label="Previous page"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      void goToPage(currentPage - 1);
                                    }}
                                  >
                                    <ChevronLeft className="size-4" />
                                  </PaginationLink>
                                </PaginationItem>
                                {getPageItems(currentPage, totalPages).map(
                                  (page) =>
                                    typeof page === "number" ? (
                                      <PaginationItem key={page}>
                                        <PaginationLink
                                          href="#"
                                          isActive={page == currentPage}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            void goToPage(page);
                                          }}
                                        >
                                          {page}
                                        </PaginationLink>
                                      </PaginationItem>
                                    ) : (
                                      <PaginationItem key={page}>
                                        <PaginationEllipsis />
                                      </PaginationItem>
                                    ),
                                )}
                                <PaginationItem>
                                  <PaginationLink
                                    href="#"
                                    size="icon"
                                    aria-label="Next page"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      void goToPage(currentPage + 1);
                                    }}
                                  >
                                    <ChevronRight className="size-4" />
                                  </PaginationLink>
                                </PaginationItem>
                              </>
                            );
                          })()}
                        </PaginationContent>
                      </Pagination>
                    )}
                </div>
              </div>

              <Dialog
                open={isInfoModalOpen}
                onOpenChange={(open) => {
                  if (open) return;
                  if (isLoading) return;

                  const stack = prevProjectsRef.current;
                  if (stack.length === 0) {
                    setInfoModalOpen(false);
                    setTimeout(() => {
                      setInstalledProject(null);
                      setProject(null);
                    }, 300);
                    return;
                  }

                  const prevProject = stack.pop();
                  if (!prevProject) return;

                  const installed = findInstalled(prevProject) ?? null;
                  setInstalledProject(installed);
                  setProvider(prevProject.provider);
                  setProject(prevProject);

                  const idx = installed
                    ? prevProject.versions.findIndex(
                        (v) => v.id == installed.version?.id,
                      )
                    : 0;

                  const safeIdx = idx == -1 ? 0 : idx;
                  setIsAvailableUpdate(safeIdx != 0);
                  setSelectVersion(prevProject.versions[safeIdx]);
                }}
              >
                <DialogContent aria-describedby={undefined}
                  className={`grid h-[min(48rem,calc(100vh-4rem))] max-h-[calc(100vh-4rem)] ${
                    shouldShowProjectDetailsPane(project, selectVersion?.changelog)
                      ? "w-[min(92rem,calc(100vw-2rem))] sm:max-w-[min(92rem,calc(100vw-2rem))]"
                      : "w-[min(36rem,calc(100vw-2rem))] sm:max-w-[min(36rem,calc(100vw-2rem))]"
                  } max-w-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden`}
                  onPointerDownOutside={(event) => {
                    if (isLoading) event.preventDefault();
                  }}
                  onEscapeKeyDown={(event) => {
                    if (isLoading) event.preventDefault();
                  }}
                >
                  <DialogHeader className="shrink-0">
                    <DialogTitle>{t("common.installation")}</DialogTitle>
                  </DialogHeader>

                  <div className="min-h-0 overflow-hidden">
                    {project ? (
                      <div
                        key={`${project.provider}-${project.id}`}
                        className={
                          shouldShowProjectDetailsPane(project, selectVersion?.changelog)
                            ? "grid h-full min-h-0 min-w-0 grid-cols-[22rem_minmax(0,1fr)] gap-4 overflow-hidden"
                            : "flex h-full min-h-0 min-w-0 overflow-hidden"
                        }
                      >
                        {(() => {
                          const showDetailsPane =
                            shouldShowProjectDetailsPane(project, selectVersion?.changelog);

                          return (
                            <>
                              <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden pr-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 text-muted-foreground">
                                    {project.iconUrl ? (
                                      <img
                                        src={project.iconUrl || ""}
                                        alt={project.title}
                                        width={64}
                                        height={64}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <FileBox className="size-6" />
                                    )}
                                  </div>
                                  <div className="flex flex-col gap-1 min-w-0">
                                    <p className="break-words [overflow-wrap:anywhere]">
                                      {project.title}
                                    </p>
                                    {project.description && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <p className="line-clamp-3 min-w-0 cursor-help break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                            {project.description}
                                          </p>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-h-64 max-w-sm overflow-y-auto">
                                          <p className="break-words text-xs leading-relaxed [overflow-wrap:anywhere]">
                                            {project.description}
                                          </p>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {project.url && (
                                    <Button
                                      variant="secondary"
                                      className="min-w-0 max-w-full"
                                      onClick={async () => {
                                        await api.shell.openExternal(
                                          project.url,
                                        );
                                      }}
                                    >
                                      {project.provider ==
                                      Provider.CURSEFORGE ? (
                                        <SiCurseforge size={20} />
                                      ) : project.provider ==
                                        Provider.MODRINTH ? (
                                        <SiModrinth size={20} />
                                      ) : (
                                        <Globe size={20} />
                                      )}
                                      <span className="min-w-0 truncate">
                                        {t("modManager.goToWebsite")}
                                      </span>
                                    </Button>
                                  )}

                                  {settings.lang != "en" &&
                                    account?.type != "plain" && (
                                      <Button
                                        variant="secondary"
                                        size="icon"
                                        disabled={
                                          isLoading &&
                                          loadingType == LoadingType.TRANSLATE
                                        }
                                        onClick={async () => {
                                          const lang = settings.lang;
                                          const token =
                                            account?.accessToken || "";
                                          const translatePrompt = (
                                            text: string,
                                          ) =>
                                            `Translate the following text to ${lang}, keep markdown formatting:\n\n${text}`;

                                          const descKey = `${project.provider}-${project.id}-${lang}`;
                                          const changelogKey = selectVersion?.id
                                            ? `${project.provider}-${project.id}-${selectVersion.id}-changelog-${lang}`
                                            : null;

                                          const cachedDesc =
                                            translationCacheRef.current.get(
                                              descKey,
                                            );
                                          const cachedChangelog = changelogKey
                                            ? translationCacheRef.current.get(
                                                changelogKey,
                                              )
                                            : undefined;

                                          const needDesc = !cachedDesc;
                                          const needChangelog =
                                            !!selectVersion?.changelog &&
                                            !cachedChangelog;

                                          if (!needDesc && !needChangelog) {
                                            if (cachedDesc)
                                              setProject({
                                                ...project,
                                                description:
                                                  cachedDesc.description ||
                                                  project.description,
                                                body:
                                                  cachedDesc.body ||
                                                  project.body,
                                              });
                                            if (cachedChangelog && selectVersion)
                                              setSelectVersion({
                                                ...selectVersion,
                                                changelog:
                                                  cachedChangelog.body ||
                                                  selectVersion.changelog,
                                              });
                                            return;
                                          }

                                          setLoading(true);
                                          setLoadingType(LoadingType.TRANSLATE);

                                          const [
                                            translatedDescription,
                                            translatedBody,
                                            translatedChangelog,
                                          ] = await Promise.all([
                                            needDesc && project.description
                                              ? api.backend.aiComplete(
                                                  token,
                                                  translatePrompt(
                                                    project.description,
                                                  ),
                                                )
                                              : undefined,
                                            needDesc && project.body
                                              ? api.backend.aiComplete(
                                                  token,
                                                  translatePrompt(project.body),
                                                )
                                              : undefined,
                                            needChangelog &&
                                            selectVersion?.changelog
                                              ? api.backend.aiComplete(
                                                  token,
                                                  translatePrompt(
                                                    selectVersion.changelog,
                                                  ),
                                                )
                                              : undefined,
                                          ]);

                                          if (needDesc) {
                                            translationCacheRef.current.set(
                                              descKey,
                                              {
                                                description:
                                                  translatedDescription,
                                                body: translatedBody,
                                              },
                                            );
                                            setProject({
                                              ...project,
                                              description:
                                                translatedDescription ||
                                                project.description,
                                              body:
                                                translatedBody || project.body,
                                            });
                                          } else if (cachedDesc) {
                                            setProject({
                                              ...project,
                                              description:
                                                cachedDesc.description ||
                                                project.description,
                                              body:
                                                cachedDesc.body || project.body,
                                            });
                                          }

                                          if (
                                            needChangelog &&
                                            changelogKey &&
                                            selectVersion
                                          ) {
                                            translationCacheRef.current.set(
                                              changelogKey,
                                              { body: translatedChangelog },
                                            );
                                            setSelectVersion({
                                              ...selectVersion,
                                              changelog:
                                                translatedChangelog ||
                                                selectVersion.changelog,
                                            });
                                          } else if (
                                            cachedChangelog &&
                                            selectVersion
                                          ) {
                                            setSelectVersion({
                                              ...selectVersion,
                                              changelog:
                                                cachedChangelog.body ||
                                                selectVersion.changelog,
                                            });
                                          }

                                          setLoading(false);
                                          setLoadingType(null);
                                        }}
                                      >
                                        {isLoading &&
                                        loadingType == LoadingType.TRANSLATE ? (
                                          <LoadingIcon />
                                        ) : (
                                          <Languages size={20} />
                                        )}
                                      </Button>
                                    )}
                                </div>

                                {project.stats &&
                                  (() => {
                                    const lang = settings.lang || "en";
                                    const downloads = formatCompactNumber(
                                      project.stats.downloads,
                                      lang,
                                    );
                                    const likes =
                                      project.provider == Provider.MODRINTH &&
                                      project.stats.follows
                                        ? formatCompactNumber(
                                            project.stats.follows,
                                            lang,
                                          )
                                        : null;
                                    const updated = formatDate(
                                      project.stats.dateModified,
                                      lang,
                                    );
                                    const created = formatDate(
                                      project.stats.dateCreated,
                                      lang,
                                    );

                                    if (
                                      !downloads &&
                                      !likes &&
                                      !updated &&
                                      !created
                                    )
                                      return null;

                                    return (
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                                        {downloads && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={t(
                                              "modManager.statsDownloads",
                                            )}
                                          >
                                            <Download className="size-3.5 shrink-0" />
                                            <span className="tabular-nums">
                                              {downloads}
                                            </span>
                                          </span>
                                        )}
                                        {likes && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={t("modManager.statsLikes")}
                                          >
                                            <Heart className="size-3.5 shrink-0" />
                                            <span className="tabular-nums">
                                              {likes}
                                            </span>
                                          </span>
                                        )}
                                        {updated && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={t("modManager.statsUpdated")}
                                          >
                                            <History className="size-3.5 shrink-0" />
                                            {updated}
                                          </span>
                                        )}
                                        {created && (
                                          <span
                                            className="inline-flex items-center gap-1"
                                            title={t("modManager.statsCreated")}
                                          >
                                            <Calendar className="size-3.5 shrink-0" />
                                            {created}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}

                                <div className="flex flex-col gap-2">
                                  {selectVersion && selectVersion.id != "" && (
                                    <div className="max-w-80">
                                      <VirtualizedSelect
                                        size="sm"
                                        aria-label={t("versions.version")}
                                        className={
                                          isAvailableUpdate
                                            ? "border-[var(--warning)]/60 ring-[var(--warning)]/20"
                                            : ""
                                        }
                                        disabled={
                                          isLoading ||
                                          project.provider == Provider.LOCAL
                                        }
                                        value={selectVersion?.id || ""}
                                        placeholder={t("versions.version")}
                                        searchPlaceholder={t("common.search")}
                                        emptyText={t("common.notFound")}
                                        options={project.versions.map((v) => ({
                                          value: v.id,
                                          label: v.name,
                                          badge: v.releaseType
                                            ? {
                                                label: t(
                                                  "modManager.releaseTypes." +
                                                    v.releaseType,
                                                ),
                                                className:
                                                  releaseTypeBadgeClassName(
                                                    v.releaseType,
                                                  ),
                                              }
                                            : undefined,
                                          secondaryLabel:
                                            formatDate(
                                              v.datePublished,
                                              settings.lang || "en",
                                            ) ?? undefined,
                                        }))}
                                        onValueChange={async (value) => {
                                          if (!value) return;

                                          const idx =
                                            project.versions.findIndex(
                                              (v) => v.id == value,
                                            );
                                          const safeIdx = idx == -1 ? 0 : idx;
                                          setIsAvailableUpdate(safeIdx != 0);

                                          const v = project.versions[safeIdx];
                                          if (!v) return;

                                          setLoading(true);
                                          setLoadingType(
                                            LoadingType.NEW_VERSION,
                                          );

                                          let next = {
                                            ...v,
                                            dependencies: v.dependencies ?? [],
                                          };

                                          if (
                                            !isModpacks &&
                                            next.dependencies.length > 0 &&
                                            next.dependencies.filter(
                                              (d) => d.project,
                                            ).length == 0
                                          ) {
                                            const deps =
                                              await api.modManager.getDependencies(
                                                project.provider,
                                                project.id,
                                                next.dependencies,
                                              );
                                            next = {
                                              ...next,
                                              dependencies: deps,
                                            };
                                          }

                                          setSelectVersion(next);

                                          setLoading(false);
                                          setLoadingType(null);
                                        }}
                                      />
                                      {isAvailableUpdate && (
                                        <Alert
                                          variant="warning"
                                          className="mt-2 px-3 py-2"
                                        >
                                          <CircleAlert />
                                          <AlertTitle className="line-clamp-none min-h-0 text-xs leading-5">
                                            {t("modManager.availableUpdate")}
                                            {project.versions[0]?.name
                                              ? `: ${project.versions[0].name}`
                                              : ""}
                                          </AlertTitle>
                                        </Alert>
                                      )}
                                    </div>
                                  )}

                                  <div className="flex flex-wrap items-center gap-2">
                                    {!installedProject ? (
                                      <Button
                                        disabled={
                                          isLoading ||
                                          mods
                                            .filter(
                                              (m) =>
                                                m.provider == Provider.LOCAL,
                                            )
                                            .some((m) =>
                                              m.version?.files.some(
                                                (f) =>
                                                  f.sha1 ==
                                                  selectVersion?.files[0]?.sha1,
                                              ),
                                            )
                                        }
                                        onClick={async () => {
                                          if (!selectVersion) return;

                                          setLoading(true);
                                          setLoadingType(LoadingType.INSTALL);

                                          if (isModpacks) {
                                            const temp = await api.path.join(
                                              paths.launcher,
                                              "temp",
                                            );

                                            const file = selectVersion.files[0];
                                            if (!file) {
                                              setLoading(false);
                                              setLoadingType(null);
                                              return;
                                            }

                                            const filename = file.filename;

                                            if (
                                              file.url.startsWith("blocked::")
                                            ) {
                                              setBlockedMods([
                                                {
                                                  fileName: filename,
                                                  hash: file.sha1,
                                                  url: file.url.replace(
                                                    "blocked::",
                                                    "",
                                                  ),
                                                  projectId: project.id,
                                                },
                                              ]);
                                              setIsBlockedMods(true);
                                              return;
                                            }

                                            const modpackPath =
                                              await api.path.join(
                                                temp,
                                                await api.path.basename(
                                                  filename,
                                                  await api.path.extname(
                                                    filename,
                                                  ),
                                                ),
                                              );

                                            const archivePath =
                                              await api.path.join(
                                                temp,
                                                filename,
                                              );

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

                                            setIsExtractingModpack(true);
                                            try {
                                              await api.fs.extractZip(
                                                archivePath,
                                                modpackPath,
                                              );
                                              await api.fs.rimraf(archivePath);
                                            } finally {
                                              setIsExtractingModpack(false);
                                            }

                                            const modpack =
                                              await api.modManager.checkModpack(
                                                modpackPath,
                                                project,
                                                selectVersion,
                                              );
                                            if (!modpack) {
                                              toast.error(
                                                t("modManager.notModpack"),
                                              );
                                              setLoading(false);
                                              setLoadingType(null);
                                              return;
                                            }

                                            setModpack(modpack);
                                            onClose(modpack);

                                            setLoading(false);
                                            setLoadingType(null);
                                            return;
                                          }

                                          const newProject: ILocalProject = {
                                            title: project.title,
                                            description: project.description,
                                            projectType: project.projectType,
                                            iconUrl: project.iconUrl,
                                            url: project.url,
                                            provider: project.provider,
                                            id: project.id,
                                            version: {
                                              id: selectVersion.id,
                                              files: selectVersion.files.map(
                                                (f) => ({
                                                  filename: f.filename,
                                                  size: f.size,
                                                  isServer: f.isServer,
                                                  url: f.url,
                                                  sha1: f.sha1,
                                                  localPath:
                                                    project.provider ==
                                                    Provider.LOCAL
                                                      ? f.localPath
                                                      : undefined,
                                                }),
                                              ),
                                              dependencies:
                                                selectVersion.dependencies.map(
                                                  (d) => ({
                                                    title:
                                                      d.project?.title || "",
                                                    relationType:
                                                      d.relationType,
                                                  }),
                                                ),
                                            },
                                          };

                                          setMods([...mods, newProject]);
                                          if (
                                            newProject.provider ==
                                            Provider.LOCAL
                                          ) {
                                            forgetRemovedLocalProject(
                                              newProject,
                                            );
                                          }
                                          setInstalledProject(newProject);

                                          setLoading(false);
                                          setLoadingType(null);

                                          toast.success(t("modManager.added"));
                                        }}
                                      >
                                        {isLoading &&
                                        loadingType == LoadingType.INSTALL ? (
                                          <LoadingIcon />
                                        ) : (
                                          <Download size={20} />
                                        )}
                                        {t("common.install")}
                                      </Button>
                                    ) : (
                                      <>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div>
                                              <Button
                                                variant="destructive"
                                                disabled={
                                                  deletionPlan.blockers.length >
                                                    0 || isLoading
                                                }
                                                onClick={() => {
                                                  const removeKeys = new Set(
                                                    deletionPlan.remove.map(
                                                      (m) =>
                                                        `${m.provider}:${m.id}`,
                                                    ),
                                                  );

                                                  for (const removed of deletionPlan.remove) {
                                                    if (
                                                      removed.provider ==
                                                      Provider.LOCAL
                                                    ) {
                                                      rememberRemovedLocalProject(
                                                        removed,
                                                      );
                                                    }
                                                  }

                                                  setMods(
                                                    mods.filter(
                                                      (m) =>
                                                        !removeKeys.has(
                                                          `${m.provider}:${m.id}`,
                                                        ),
                                                    ),
                                                  );
                                                  setInstalledProject(null);

                                                  toast.success(
                                                    deletionPlan.remove.length >
                                                      1
                                                      ? t(
                                                          "modManager.deletedMultiple",
                                                          {
                                                            count:
                                                              deletionPlan
                                                                .remove.length,
                                                          },
                                                        )
                                                      : t("modManager.deleted"),
                                                  );
                                                }}
                                              >
                                                <Trash size={20} />
                                                {t("common.delete")}
                                              </Button>
                                            </div>
                                          </TooltipTrigger>
                                          {deletionPlan.blockers.length > 0 ? (
                                            <TooltipContent>
                                              <div className="flex flex-col gap-1 p-1">
                                                {t("modManager.requiredBy")}
                                                <ScrollArea className="max-h-[180px] pr-3">
                                                  <div className="flex flex-col gap-1">
                                                    {deletionPlan.blockers.map(
                                                      (b, i) => (
                                                        <Badge
                                                          className={`gap-1 ${dependencyBadgeClassName(
                                                            DependencyType.REQUIRED,
                                                          )}`}
                                                          key={i}
                                                        >
                                                          {b.title}
                                                        </Badge>
                                                      ),
                                                    )}
                                                  </div>
                                                </ScrollArea>
                                              </div>
                                            </TooltipContent>
                                          ) : deletionPlan.remove.length > 1 ? (
                                            <TooltipContent>
                                              <div className="flex flex-col gap-1 p-1">
                                                {t("modManager.alsoRemoves")}
                                                <ScrollArea className="max-h-[180px] pr-3">
                                                  <div className="flex flex-col gap-1">
                                                    {deletionPlan.remove
                                                      .filter(
                                                        (m) =>
                                                          m.id !=
                                                          installedProject.id,
                                                      )
                                                      .map((m, i) => (
                                                        <Badge
                                                          variant="secondary"
                                                          key={i}
                                                        >
                                                          {m.title}
                                                        </Badge>
                                                      ))}
                                                  </div>
                                                </ScrollArea>
                                              </div>
                                            </TooltipContent>
                                          ) : null}
                                        </Tooltip>

                                        {project.provider != Provider.LOCAL && (
                                          <Button
                                            variant="secondary"
                                            disabled={
                                              selectVersion?.id ==
                                                installedProject.version?.id ||
                                              isLoading
                                            }
                                            onClick={() => {
                                              if (!selectVersion) return;

                                              let newMods = [...mods];

                                              const updated: ILocalProject = {
                                                title: project.title,
                                                description:
                                                  project.description,
                                                projectType:
                                                  project.projectType,
                                                iconUrl: project.iconUrl,
                                                url: project.url,
                                                provider: project.provider,
                                                id: project.id,
                                                version: {
                                                  id: selectVersion.id,
                                                  files:
                                                    selectVersion.files.map(
                                                      (f) => ({
                                                        filename: f.filename,
                                                        size: f.size,
                                                        url: f.url,
                                                        isServer: f.isServer,
                                                        sha1: f.sha1,
                                                      }),
                                                    ),
                                                  dependencies:
                                                    selectVersion.dependencies.map(
                                                      (d) => ({
                                                        title:
                                                          d.project?.title ||
                                                          "",
                                                        relationType:
                                                          d.relationType,
                                                      }),
                                                    ),
                                                },
                                              };

                                              const idx = newMods.findIndex(
                                                (p) => p.id == project.id,
                                              );
                                              if (idx !== -1)
                                                newMods.splice(idx, 1, updated);

                                              setMods([...newMods]);
                                              setInstalledProject(updated);

                                              toast.success(
                                                t("modManager.updated"),
                                              );
                                            }}
                                          >
                                            <CircleArrowDown size={20} />
                                            {t("common.update")}
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </div>

                                  {isModpacks &&
                                    isLoading &&
                                    loadingType == LoadingType.INSTALL &&
                                    (isExtractingModpack || downloadInfo) && (
                                      <div className="rounded-lg border bg-muted/15 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <div className="flex min-w-0 items-center gap-2">
                                            {isExtractingModpack ? (
                                              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                                            ) : (
                                              <Download className="size-4 shrink-0 text-muted-foreground" />
                                            )}
                                            <span className="truncate text-sm font-medium">
                                              {isExtractingModpack
                                                ? t("modManager.extracting")
                                                : t("downloadProgress.title")}
                                            </span>
                                          </div>
                                          {!isExtractingModpack &&
                                            downloadInfo && (
                                              <Badge
                                                variant="outline"
                                                className="w-14 shrink-0 justify-center bg-muted/40 tabular-nums"
                                              >
                                                {downloadInfo.progressPercent}%
                                              </Badge>
                                            )}
                                        </div>

                                        <Progress
                                          value={
                                            isExtractingModpack
                                              ? 100
                                              : Math.max(
                                                  0,
                                                  Math.min(
                                                    100,
                                                    downloadInfo?.progressPercent ??
                                                      0,
                                                  ),
                                                )
                                          }
                                          max={100}
                                          className={
                                            isExtractingModpack
                                              ? "[&_[data-slot=progress-indicator]]:animate-pulse"
                                              : undefined
                                          }
                                        />

                                        {!isExtractingModpack &&
                                          downloadInfo &&
                                          downloadInfo.totalBytes > 0 && (
                                            <p className="mt-2 truncate text-xs tabular-nums text-muted-foreground">
                                              {formatBytes(
                                                downloadInfo.downloadedBytes,
                                                sizes,
                                              )}{" "}
                                              /{" "}
                                              {formatBytes(
                                                downloadInfo.totalBytes,
                                                sizes,
                                              )}
                                              {downloadInfo.downloadSpeed &&
                                              downloadInfo.downloadSpeed > 0
                                                ? ` · ${formatBytes(
                                                    downloadInfo.downloadSpeed,
                                                    sizes,
                                                  )}/${t("timeUnits.0")}`
                                                : ""}
                                            </p>
                                          )}
                                      </div>
                                    )}
                                </div>

                                {!isModpacks &&
                                  project.provider != Provider.LOCAL && (
                                    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                                      <div className="flex shrink-0 items-center gap-2">
                                        <p className="font-medium">
                                          {t("modManager.dependencies")}
                                        </p>
                                        {isLoading &&
                                          loadingType ==
                                            LoadingType.NEW_VERSION && (
                                            <LoadingIcon />
                                          )}
                                      </div>

                                      <ScrollArea className="min-h-0 flex-1 pr-3">
                                        <div className="flex min-h-full flex-col gap-2">
                                          {selectVersion?.dependencies &&
                                            selectVersion.dependencies.length >
                                              0 &&
                                            loadingType !=
                                              LoadingType.NEW_VERSION &&
                                            selectVersion.dependencies.map(
                                              (d, index) => {
                                                if (!d.project) return null;

                                                const depInstalled =
                                                  findInstalled(d.project);

                                                const depType =
                                                  dependencyDisplay(
                                                    d.relationType,
                                                  );

                                                return (
                                                  <div
                                                    key={index}
                                                    className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-card/60 p-2"
                                                  >
                                                    <div className="flex min-w-0 items-center gap-2">
                                                      <img
                                                        src={
                                                          d.project.iconUrl ||
                                                          ""
                                                        }
                                                        alt={d.project.title}
                                                        width={32}
                                                        height={32}
                                                        className="size-8 shrink-0 rounded object-cover"
                                                      />
                                                      <div className="flex min-w-0 flex-col">
                                                        <p
                                                          className="truncate text-sm"
                                                          title={d.project.title}
                                                        >
                                                          {d.project.title}
                                                        </p>
                                                        {depInstalled && (
                                                          <span className="flex items-center gap-1 text-xs font-medium text-[var(--success)]">
                                                            <PackageCheck className="size-3 shrink-0" />
                                                            {t(
                                                              "modManager.installed",
                                                            )}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>

                                                    <div className="flex shrink-0 items-center gap-1">
                                                      <Badge
                                                        className={`max-w-28 justify-center gap-1 truncate whitespace-nowrap ${dependencyBadgeClassName(
                                                          d.relationType,
                                                        )}`}
                                                        title={depType.title}
                                                      >
                                                        <DependencyTypeIcon
                                                          type={d.relationType}
                                                          className="size-3 shrink-0"
                                                        />
                                                        {depType.title}
                                                      </Badge>

                                                      {d.relationType !=
                                                        DependencyType.INCOMPATIBLE &&
                                                      d.relationType !=
                                                        DependencyType.EMBEDDED ? (
                                                        <Button
                                                          size="icon-sm"
                                                          variant="secondary"
                                                          disabled={isLoading}
                                                          onClick={async () => {
                                                            if (
                                                              !d.project ||
                                                              !version
                                                            )
                                                              return;

                                                            setLoading(true);
                                                            setLoadingType(
                                                              LoadingType.DEPENDENCY,
                                                            );
                                                            setProccessKey(
                                                              index,
                                                            );

                                                            const newProj: IProject =
                                                              d.project;

                                                            const vers =
                                                              await api.modManager.getVersions(
                                                                newProj.provider,
                                                                newProj.id,
                                                                {
                                                                  loader:
                                                                    projectType ==
                                                                      ProjectType.PLUGIN &&
                                                                    server
                                                                      ? (server.core as unknown as Loader)
                                                                      : loader ||
                                                                        "vanilla",
                                                                  version:
                                                                    version.id,
                                                                  projectType:
                                                                    newProj.projectType,
                                                                  modUrl:
                                                                    newProj.url,
                                                                },
                                                              );

                                                            if (!vers.length) {
                                                              setLoading(false);
                                                              setLoadingType(
                                                                null,
                                                              );
                                                              setProccessKey(
                                                                -1,
                                                              );
                                                              toast.error(
                                                                t(
                                                                  "modManager.notFoundMod",
                                                                ),
                                                              );
                                                              return;
                                                            }

                                                            let currentIndex = 0;
                                                            if (depInstalled) {
                                                              const idx =
                                                                vers.findIndex(
                                                                  (v) =>
                                                                    v.id ==
                                                                    depInstalled
                                                                      .version
                                                                      ?.id,
                                                                );
                                                              currentIndex =
                                                                idx == -1
                                                                  ? 0
                                                                  : idx;
                                                            }

                                                            let detailProject =
                                                              newProj;
                                                            let body =
                                                              newProj.body ||
                                                              newProj.description ||
                                                              "";
                                                            let gallery: IProject["gallery"] =
                                                              newProj.gallery ||
                                                              [];

                                                            if (
                                                              newProj.provider !=
                                                              Provider.LOCAL
                                                            ) {
                                                              const info =
                                                                await api.modManager.getProject(
                                                                  newProj.provider,
                                                                  newProj.id,
                                                                );
                                                              if (info) {
                                                                detailProject =
                                                                  {
                                                                    ...newProj,
                                                                    ...info,
                                                                  };
                                                                body =
                                                                  info.body ||
                                                                  body ||
                                                                  info.description ||
                                                                  "";
                                                                gallery =
                                                                  info.gallery
                                                                    ?.length > 0
                                                                    ? info.gallery
                                                                    : gallery;
                                                              }
                                                            }

                                                            let currentVersion =
                                                              vers[
                                                                currentIndex
                                                              ] ?? vers[0];
                                                            if (
                                                              currentVersion
                                                                .dependencies
                                                                ?.length > 0
                                                            ) {
                                                              const deps =
                                                                await api.modManager.getDependencies(
                                                                  newProj.provider,
                                                                  newProj.id,
                                                                  currentVersion.dependencies,
                                                                );
                                                              currentVersion = {
                                                                ...currentVersion,
                                                                dependencies:
                                                                  deps,
                                                              };
                                                              vers[
                                                                currentIndex
                                                              ] =
                                                                currentVersion;
                                                            }

                                                            if (project)
                                                              prevProjectsRef.current.push(
                                                                project,
                                                              );

                                                            setInstalledProject(
                                                              depInstalled
                                                                ? depInstalled
                                                                : null,
                                                            );
                                                            setIsAvailableUpdate(
                                                              currentIndex != 0,
                                                            );
                                                            setProvider(
                                                              newProj.provider,
                                                            );
                                                            setSelectVersion(
                                                              currentVersion,
                                                            );
                                                            setProject({
                                                              ...detailProject,
                                                              versions: vers,
                                                              body,
                                                              gallery,
                                                            });

                                                            setLoading(false);
                                                            setLoadingType(
                                                              null,
                                                            );
                                                            setProccessKey(-1);

                                                            setInfoModalOpen(
                                                              true,
                                                            );
                                                          }}
                                                        >
                                                          {isLoading &&
                                                          loadingType ==
                                                            LoadingType.DEPENDENCY &&
                                                          proccessKey ==
                                                            index ? (
                                                            <LoadingIcon />
                                                          ) : depInstalled ? (
                                                            <Settings className="size-4" />
                                                          ) : (
                                                            <Download className="size-4" />
                                                          )}
                                                        </Button>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                );
                                              },
                                            )}

                                          {!isModpacks &&
                                            selectVersion?.dependencies
                                              .length == 0 &&
                                            loadingType !=
                                              LoadingType.NEW_VERSION && (
                                              <Empty className="min-h-full flex-1 rounded-xl border border-dashed bg-muted/20">
                                                <EmptyHeader>
                                                  <EmptyMedia variant="icon">
                                                    <CircleAlert />
                                                  </EmptyMedia>
                                                  <EmptyTitle>
                                                    {t(
                                                      "modManager.noDependencies",
                                                    )}
                                                  </EmptyTitle>
                                                </EmptyHeader>
                                              </Empty>
                                            )}
                                        </div>
                                      </ScrollArea>
                                    </div>
                                  )}
                              </div>

                              {showDetailsPane && (
                                <ProjectDetailsPane
                                  project={project}
                                  notFoundTitle={t("common.notFound")}
                                  changelog={selectVersion?.changelog}
                                  descriptionLabel={t("common.description")}
                                  changelogLabel={t("modManager.changelog")}
                                />
                              )}
                            </>
                          );
                        })()}
                      </div>
                    ) : undefined}
                  </div>
                </DialogContent>
              </Dialog>
            </>
          </div>
        </DialogContent>
      </Dialog>

      {isBlockedMods && blockedMods.length > 0 && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (bMods) => {
            setBlockedMods(bMods);
            setIsBlockedMods(false);

            const mod = bMods[0];
            if (!mod || !mod.filePath || !project || !selectVersion) {
              setLoading(false);
              setLoadingType(null);
              return;
            }

            const temp = await api.path.join(paths.launcher, "temp");

            const modpackPath = await api.path.join(
              temp,
              await api.path.basename(
                mod.fileName,
                await api.path.extname(mod.fileName),
              ),
            );

            await api.fs.extractZip(mod.filePath, modpackPath);

            const modpack = await api.modManager.checkModpack(
              modpackPath,
              project,
              selectVersion,
            );
            if (!modpack) {
              toast.error(t("modManager.notModpack"));
              setLoading(false);
              setLoadingType(null);
              return;
            }

            setModpack(modpack);
            onClose(modpack);

            setLoading(false);
            setLoadingType(null);
          }}
        />
      )}

      {isOpenALPInfo && addingLocalProjects.length > 0 && (
        <ALPModal
          projects={addingLocalProjects}
          onClose={() => {
            setIsOpenALPInfo(false);
            setAddingLocalProjects([]);
          }}
          addProjects={(projects: IProject[]) => {
            const localProjects: ILocalProject[] = [];

            projects.forEach((p) => {
              const newProject: ILocalProject = {
                title: p.title,
                description: p.description,
                projectType: p.projectType,
                iconUrl: p.iconUrl,
                url: p.url,
                provider: p.provider,
                id: p.id,
                version: {
                  id: p.versions[0].id,
                  files: p.versions[0].files.map((f) => ({
                    ...f,
                  })),
                  dependencies: p.versions[0].dependencies.map((d) => ({
                    title: d.project?.title || "",
                    relationType: d.relationType,
                  })),
                },
              };

              localProjects.push(newProject);
            });

            setMods([...mods, ...localProjects]);
            setPendingRemovedLocalProjects((prev) =>
              prev.filter(
                (item) =>
                  !localProjects.some((project) =>
                    isSameLocalProject(item, project),
                  ),
              ),
            );
            toast.success(
              t("modManager.addedMultiple", { count: projects.length }),
            );
          }}
        />
      )}

      {isUpdateModalOpen && updateMods.length > 0 && (
        <UPModal
          projects={updateMods}
          onClose={() => {
            setIsUpdateModalOpen(false);
            setUpdateMods([]);
          }}
          updateProjects={(projects: IUpdateProject[]) => {
            const updateMods: ILocalProject[] = structuredClone(mods);

            for (const m of updateMods) {
              const update = projects.find((p) => p.project.id == m.id);
              if (!update) continue;

              m.version = {
                dependencies: update.version.dependencies.map((d) => ({
                  title: d.project?.title || "",
                  relationType: d.relationType,
                })),
                files: update.version.files,
                id: update.version.id,
              };
            }

            setMods([...updateMods]);
            toast.success(
              t("modManager.updatedMultiple", {
                count: projects.length,
              }),
            );
          }}
        />
      )}
    </TooltipProvider>
  );
}
