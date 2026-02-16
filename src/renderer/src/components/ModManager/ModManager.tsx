import {
  IFilterGroup,
  ILocalProject,
  IProject,
  ProjectType,
  Provider,
  IVersion as ModManagerVersion,
  DependencyType,
  ILocalDependency,
  IModpack,
  ISearchData,
  IAddedLocalProject,
  IUpdateProject,
} from "@/types/ModManager";
import { loaders } from "../Loaders";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiCurseforge, SiModrinth } from "react-icons/si";
import SVG from "react-inlinesvg";
import { useTranslation } from "react-i18next";
import {
  CircleAlert,
  Download,
  Earth,
  FileBox,
  Globe,
  Search,
  Settings,
  X,
  PackageCheck,
  Trash,
  CircleArrowDown,
  PanelTopOpen,
  Info,
  Languages,
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
import {
  addToast,
  Alert,
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Select,
  SelectItem,
  SelectSection,
  Spinner,
  Switch,
  Tooltip,
  Image,
  Card,
  CardBody,
  ScrollShadow,
  Pagination,
  Progress,
} from "@heroui/react";
import { BlockedMods, IBlockedMod } from "../Modals/BlockedMods";
import { ModBody } from "./ModBody";
import GalleryCarousel from "./Gallery";
import { Loader } from "@/types/Loader";
import { IVersion } from "@/types/IVersion";
import { ModToggleButton } from "./ModToggleButton";
import { getProjectTypes } from "@renderer/utilities/mod";
import { ALPModal } from "./AddLocalProjectsModal";
import { UPModal } from "./UpdateProjectsModal";

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
  TRANSLATE,
}

const PAGE_LIMIT = 20;

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
  const [dependency, setDependency] = useState<ILocalDependency[]>([]);
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

  const { t } = useTranslation();

  const defaultSort = useMemo(() => sortValues[0] ?? "", [sortValues]);

  const installedById = useMemo(() => {
    const m = new Map<string, ILocalProject>();
    for (const mod of mods) m.set(mod.id, mod);
    return m;
  }, [mods]);

  const installedByTitle = useMemo(() => {
    const m = new Map<string, ILocalProject>();
    for (const mod of mods) m.set(mod.title.toLowerCase(), mod);
    return m;
  }, [mods]);

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
        const items = mods.filter((m) => m.projectType == projectType);

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

  function getLocalDependencies(title: string) {
    const dependencies: ILocalDependency[] = [];

    for (let index = 0; index < mods.length; index++) {
      const mod = mods[index];
      const dep = mod.version?.dependencies.find((d) => d.title == title);
      if (!dep) continue;

      dependencies.push({
        title: mod.title,
        relationType: dep.relationType,
      });
    }

    return dependencies;
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
              url: `file://${info.path}`,
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
        addToast({ title: t("modManager.invalidMod"), color: "warning" });
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

  return (
    <>
      <Modal
        size="full"
        isOpen={true}
        onClose={() => {
          if (isLoading) return;
          onClose();
        }}
      >
        <ModalContent className="h-full w-full">
          <ModalHeader>{t("modManager.title")}</ModalHeader>

          <ModalBody className="flex flex-1 min-h-0 w-full">
            <>
              <div className="flex flex-col space-y-2 h-full w-full">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    {!isLocal && (
                      <Tooltip
                        delay={1000}
                        isDisabled={
                          provider != Provider.CURSEFORGE &&
                          provider != Provider.MODRINTH
                        }
                        content={
                          provider == Provider.CURSEFORGE
                            ? "CurseForge"
                            : "Modrinth"
                        }
                        color={
                          provider == Provider.CURSEFORGE
                            ? "warning"
                            : provider == Provider.MODRINTH
                              ? "success"
                              : "default"
                        }
                      >
                        <Button
                          variant="flat"
                          isIconOnly
                          color={
                            provider == Provider.CURSEFORGE
                              ? "warning"
                              : provider == Provider.MODRINTH
                                ? "success"
                                : "default"
                          }
                          isDisabled={isLoading}
                          onPress={async () => {
                            clearDebounce();
                            const newProvider =
                              provider == Provider.CURSEFORGE
                                ? Provider.MODRINTH
                                : provider == Provider.MODRINTH
                                  ? !isModpacks
                                    ? Provider.LOCAL
                                    : Provider.CURSEFORGE
                                  : Provider.CURSEFORGE;

                            setProvider(newProvider);
                            setSearchData(undefined);
                            setOffset(0);
                            setFilter([]);

                            let pts: ProjectType[] = [];
                            if (!isModpacks) {
                              pts = getProjectTypes(
                                loader || "vanilla",
                                server,
                                newProvider,
                              );
                            } else {
                              pts = [...projectTypes];
                            }

                            const nextProjectType = pts.includes(projectType)
                              ? projectType
                              : pts[0];
                            setProjectTypes(pts);
                            setProjectType(nextProjectType);

                            const sorts =
                              await api.modManager.getSort(newProvider);
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
                              isLocal,
                              offset: 0,
                            });
                          }}
                        >
                          {provider == Provider.CURSEFORGE ? (
                            <SiCurseforge size={22} />
                          ) : provider == Provider.MODRINTH ? (
                            <SiModrinth size={22} />
                          ) : (
                            <FileBox size={22} />
                          )}
                        </Button>
                      </Tooltip>
                    )}

                    {!isModpacks && (
                      <Select
                        size="sm"
                        label={t("modManager.type")}
                        isDisabled={isLoading}
                        selectedKeys={[projectType]}
                        className="w-40 min-w-40"
                        onChange={async (event) => {
                          clearDebounce();
                          const value = event.target.value as ProjectType;
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
                        {projectTypes.map((type) => (
                          <SelectItem key={type}>
                            {t("modManager.projectTypes." + type)}
                          </SelectItem>
                        ))}
                      </Select>
                    )}
                  </div>

                  {isModpacks && (
                    <>
                      <Select
                        label={t("versions.version")}
                        size="sm"
                        className="w-28 min-w-28"
                        startContent={
                          isLoading &&
                          loadingType == LoadingType.GAME_VERSIONS ? (
                            <Spinner size="sm" />
                          ) : (
                            ""
                          )
                        }
                        isDisabled={isLoading}
                        selectedKeys={[version?.id || ""]}
                        onChange={async (event) => {
                          clearDebounce();
                          const ver = versions.find(
                            (v) => v.id == event.target.value,
                          );
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
                      >
                        {versions.map((v) => (
                          <SelectItem key={v.id}>{v.id}</SelectItem>
                        ))}
                      </Select>

                      <Select
                        label={t("versions.loader")}
                        size="sm"
                        className="w-36 min-w-36"
                        isDisabled={isLoading}
                        selectedKeys={[loader ? loader : ""]}
                        onChange={async (event) => {
                          clearDebounce();
                          const l = event.target.value as Loader;
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
                        <SelectItem key="forge">
                          {loaders["forge"].name}
                        </SelectItem>
                        <SelectItem key="neoforge">
                          {loaders["neoforge"].name}
                        </SelectItem>
                        <SelectItem key="fabric">
                          {loaders["fabric"].name}
                        </SelectItem>
                        <SelectItem key="quilt">
                          {loaders["quilt"].name}
                        </SelectItem>
                      </Select>
                    </>
                  )}

                  {(provider != Provider.LOCAL || isLocal) && (
                    <Input
                      isDisabled={isLoading}
                      baseRef={searchRef}
                      startContent={<Search size={22} />}
                      value={searchQuery}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSearchQuery(value);

                        clearDebounce();
                        searchDebounceRef.current = setTimeout(async () => {
                          setOffset(0);
                          await search({
                            version,
                            loader,
                            query: value,
                            provider,
                            projectType,
                            sort,
                            filter,
                            isLocal,
                            offset: 0,
                          });
                        }, 800);
                      }}
                    />
                  )}

                  {isLocal && (
                    <>
                      {isLocal && !isDownloadedVersion && isOwnerVersion && (
                        <div>
                          <Button
                            variant="flat"
                            isLoading={
                              isLoading &&
                              loadingType == LoadingType.CHECK_AVAILABLE_UPDATE
                            }
                            onPress={async () => {
                              try {
                                clearDebounce();
                                setLoading(true);
                                setLoadingType(
                                  LoadingType.CHECK_AVAILABLE_UPDATE,
                                );

                                const canBeUpdated = await getAvailableUpdate();
                                setUpdateMods(canBeUpdated);
                                setIsUpdateModalOpen(true);

                                if (canBeUpdated.length > 0) {
                                  addToast({
                                    color: "success",
                                    title: t("modManager.availableUpdates", {
                                      count: canBeUpdated.length,
                                    }),
                                  });
                                } else {
                                  addToast({
                                    color: "warning",
                                    title: t("modManager.noAvailableUpdates"),
                                  });
                                }
                              } finally {
                                setLoading(false);
                                setLoadingType(null);
                              }
                            }}
                          >
                            {t("modManager.checkUpdates")}
                          </Button>
                        </div>
                      )}

                      <div className="flex items-center gap-1">
                        <PanelTopOpen size={22} />
                        <p>
                          {
                            mods.filter((m) => m.projectType == projectType)
                              .length
                          }
                        </p>
                      </div>
                    </>
                  )}

                  {!isLocal && provider != Provider.LOCAL && (
                    <>
                      <Select
                        label={t("modManager.sort")}
                        size="sm"
                        className="min-w-48 w-48"
                        isDisabled={isLoading}
                        selectedKeys={[sort]}
                        onChange={async (event) => {
                          clearDebounce();
                          const value = event.target.value;
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
                        {sortValues.map((s) => (
                          <SelectItem key={s}>
                            {t("modManager.sorts." + s)}
                          </SelectItem>
                        ))}
                      </Select>

                      <Select
                        label={t("modManager.filter")}
                        size="sm"
                        className="min-w-40 w-40"
                        isDisabled={isLoading}
                        selectionMode="multiple"
                        startContent={
                          isLoading && loadingType == LoadingType.FILTER ? (
                            <Spinner size="sm" />
                          ) : undefined
                        }
                        selectedKeys={filter}
                        onChange={async (event) => {
                          clearDebounce();
                          const values = event.target.value
                            .split(",")
                            .filter(Boolean);
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
                        renderValue={() => {
                          const labels = filter
                            .filter((f) => f !== "")
                            .map((f) => filterLabelMap.get(f) ?? f);
                          return <p>{labels.join(", ")}</p>;
                        }}
                      >
                        {filters.map((group, index) => (
                          <SelectSection key={index} title={group.title}>
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
                                <SelectItem key={key}>
                                  <div className="flex items-center gap-2">
                                    {f.icon?.includes("svg") ? (
                                      <SVG
                                        src={f.icon || ""}
                                        width={16}
                                        height={16}
                                        title={f.name}
                                      />
                                    ) : (
                                      <Image
                                        src={f.icon || ""}
                                        width={16}
                                        height={16}
                                        className="min-h-4 min-w-4"
                                        alt=""
                                      />
                                    )}

                                    <p className="text-xs">{label}</p>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectSection>
                        ))}
                      </Select>
                    </>
                  )}

                  {(provider != Provider.LOCAL || isLocal) && (
                    <Button
                      variant="flat"
                      isIconOnly
                      isDisabled={isLoading}
                      onPress={async () => {
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
                      <X size={22} />
                    </Button>
                  )}

                  {!isDownloadedVersion && isOwnerVersion && !isModpacks && (
                    <Switch
                      startContent={<Globe size={22} />}
                      size="lg"
                      endContent={<PackageCheck size={22} />}
                      isDisabled={isLoading}
                      isSelected={isLocal}
                      onChange={async (event) => {
                        clearDebounce();
                        const checked = event.target.checked;

                        setLocal(checked);
                        setSearchQuery("");
                        setSort(defaultSort);
                        setFilter([]);
                        setOffset(0);

                        if (!checked) await getFilters(provider, projectType);

                        await search({
                          version,
                          loader,
                          query: "",
                          provider,
                          projectType,
                          sort: defaultSort,
                          filter: [],
                          isLocal: checked,
                          offset: 0,
                        });
                      }}
                    />
                  )}
                </div>

                {!isLocal && provider == Provider.LOCAL ? (
                  <>
                    <span>
                      <Alert
                        variant="bordered"
                        title={t("modManager.selectLocals")}
                      />
                    </span>

                    {readingLocalModsProgress > 0 && (
                      <Progress size="sm" value={readingLocalModsProgress} />
                    )}

                    <Button
                      variant="flat"
                      color="primary"
                      startContent={<FileBox size={22} />}
                      isLoading={
                        isLoading && loadingType == LoadingType.CHECK_LOCAL_MOD
                      }
                      onPress={async () => {
                        clearDebounce();
                        const filePaths = await api.other.openFileDialog(
                          false,
                          [{ name: "Mods", extensions: ["jar", "zip"] }],
                          true,
                        );
                        if (!filePaths || filePaths.length == 0) return;
                        await readLocalMods(filePaths);
                      }}
                    >
                      {t("common.choose")}
                    </Button>
                  </>
                ) : isLoading &&
                  (loadingType == LoadingType.SEARCH ||
                    loadingType == LoadingType.FILTER ||
                    loadingType == LoadingType.GAME_VERSIONS) ? (
                  <div className="flex justify-center items-center flex-1 min-h-0">
                    <Spinner size="sm" label={t("common.searching")} />
                  </div>
                ) : browser.length > 0 ? (
                  <div className="flex-1 min-h-0">
                    <ScrollShadow className="h-full">
                      {browser.map((item, index) => {
                        const isInstalled =
                          installedById.get(item.id) ??
                          installedByTitle.get(item.title.toLowerCase());

                        return (
                          <Card
                            key={index}
                            className="mb-2 border-white/20 border-1 mr-2"
                          >
                            <CardBody>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  {item.iconUrl && (
                                    <Image
                                      src={item.iconUrl}
                                      alt={item.title}
                                      width={64}
                                      height={64}
                                      className="rounded-md min-w-16 min-h-16 shrink-0"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="flex flex-col gap-1">
                                    <p>{item.title}</p>
                                    {item.description && (
                                      <p className="text-xs text-gray-400">
                                        {item.description}
                                      </p>
                                    )}

                                    {isInstalled ? (
                                      <Chip
                                        variant="flat"
                                        size="sm"
                                        color={
                                          isInstalled.provider ==
                                          Provider.CURSEFORGE
                                            ? "warning"
                                            : isInstalled.provider ==
                                                Provider.MODRINTH
                                              ? "success"
                                              : isInstalled.provider ==
                                                  Provider.LOCAL
                                                ? "primary"
                                                : "default"
                                        }
                                      >
                                        <div className="flex items-center gap-2">
                                          {isInstalled.provider ==
                                          Provider.CURSEFORGE ? (
                                            <>
                                              <SiCurseforge size={16} />
                                              <p className="text-xs">
                                                CurseForge
                                              </p>
                                            </>
                                          ) : isInstalled.provider ==
                                            Provider.MODRINTH ? (
                                            <>
                                              <SiModrinth size={16} />
                                              <p className="text-xs">
                                                Modrinth
                                              </p>
                                            </>
                                          ) : isInstalled.provider ==
                                            Provider.LOCAL ? (
                                            <>
                                              <FileBox size={16} />
                                              <p className="text-xs">
                                                {t("modManager.local")}
                                              </p>
                                            </>
                                          ) : (
                                            <p className="text-xs">
                                              {t("modManager.other")}
                                            </p>
                                          )}
                                        </div>
                                      </Chip>
                                    ) : undefined}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  {item.provider != Provider.OTHER &&
                                  !isDownloadedVersion &&
                                  isOwnerVersion ? (
                                    <Button
                                      isIconOnly
                                      variant="flat"
                                      isDisabled={isLoading}
                                      isLoading={
                                        isLoading &&
                                        loadingType == LoadingType.INFO &&
                                        proccessKey == index
                                      }
                                      onPress={async () => {
                                        clearDebounce();
                                        setLoading(true);
                                        setLoadingType(LoadingType.INFO);
                                        setProccessKey(index);

                                        const base = (isInstalled
                                          ? isInstalled
                                          : item) as unknown as IProject;

                                        let body = "";
                                        let gallery: IProject["gallery"] = [];
                                        const vers: ModManagerVersion[] = [];

                                        if (base.provider != Provider.LOCAL) {
                                          const fetched =
                                            await api.modManager.getVersions(
                                              base.provider,
                                              base.id,
                                              {
                                                loader:
                                                  projectType ==
                                                    ProjectType.PLUGIN && server
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
                                              files: isInstalled.version.files,
                                              name:
                                                isInstalled.version.files[0]
                                                  ?.filename ??
                                                isInstalled.version.id,
                                            });
                                          }
                                        } else {
                                          if ("version" in (base as any)) {
                                            vers.push({
                                              dependencies: [],
                                              downloads: -1,
                                              files: [],
                                              id:
                                                (base as any)?.version?.id ||
                                                "",
                                              name:
                                                (base as any)?.version?.id ||
                                                "",
                                            });
                                          }
                                        }

                                        if (!vers.length) {
                                          setLoading(false);
                                          setLoadingType(null);
                                          setProccessKey(-1);
                                          addToast({
                                            color: "danger",
                                            title: t("modManager.notFoundMod"),
                                          });
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
                                          const projectInfo =
                                            await api.modManager.getProject(
                                              base.provider,
                                              base.id,
                                            );
                                          if (projectInfo) {
                                            body = projectInfo.body;
                                            gallery = projectInfo.gallery;
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
                                          ...base,
                                          versions: vers,
                                          body,
                                          gallery,
                                        });
                                        setSelectVersion(currentVersion);
                                        setIsAvailableUpdate(currentIndex != 0);
                                        setDependency(
                                          isInstalled
                                            ? getLocalDependencies(base.title)
                                            : [],
                                        );

                                        setLoading(false);
                                        setLoadingType(null);
                                        setProccessKey(-1);
                                        setInfoModalOpen(true);
                                      }}
                                    >
                                      {isInstalled ? (
                                        <Settings size={22} />
                                      ) : (
                                        <Info size={22} />
                                      )}
                                    </Button>
                                  ) : (
                                    item.url && (
                                      <Button
                                        variant="flat"
                                        isIconOnly
                                        onPress={() =>
                                          api.shell.openExternal(item.url)
                                        }
                                      >
                                        {item.provider ==
                                        Provider.CURSEFORGE ? (
                                          <SiCurseforge size={22} />
                                        ) : item.provider ==
                                          Provider.MODRINTH ? (
                                          <SiModrinth size={22} />
                                        ) : (
                                          <Earth size={22} />
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
                                          color="danger"
                                          variant="flat"
                                          isIconOnly
                                          isDisabled={isLoading}
                                          onPress={async () => {
                                            let newMods = [...mods];
                                            const idx = newMods.findIndex(
                                              (p) => p.id == item.id,
                                            );
                                            if (idx !== -1)
                                              newMods.splice(idx, 1);
                                            setMods([...newMods]);

                                            if (
                                              item.provider == Provider.LOCAL
                                            ) {
                                              setBrowser(
                                                browser.filter(
                                                  (p) => p.id != item.id,
                                                ),
                                              );
                                            }

                                            setInstalledProject(null);
                                            addToast({
                                              color: "success",
                                              title: t("modManager.deleted"),
                                            });
                                          }}
                                        >
                                          <Trash size={22} />
                                        </Button>
                                      </>
                                    )}
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        );
                      })}
                    </ScrollShadow>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <Alert title={t("common.notFound")} />
                  </div>
                )}

                {searchData &&
                  searchData.total > 0 &&
                  loadingType != LoadingType.FILTER &&
                  loadingType != LoadingType.GAME_VERSIONS && (
                    <div className="mx-auto">
                      <Pagination
                        showControls
                        siblings={1}
                        initialPage={1}
                        isDisabled={
                          isLoading && loadingType == LoadingType.SEARCH
                        }
                        page={Math.floor(offset / searchData.limit) + 1}
                        total={Math.ceil(searchData.total / searchData.limit)}
                        onChange={async (page) => {
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
                        }}
                      />
                    </div>
                  )}
              </div>

              <Modal
                size={project?.body == "" ? "md" : "5xl"}
                isDismissable={false}
                isKeyboardDismissDisabled={true}
                isOpen={isInfoModalOpen}
                onClose={() => {
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

                  const installed = installedById.get(prevProject.id) ?? null;
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

                  setDependency(
                    installed ? getLocalDependencies(prevProject.title) : [],
                  );
                }}
              >
                <ModalContent>
                  <ModalHeader>{t("common.installation")}</ModalHeader>

                  <ModalBody>
                    {project ? (
                      <div className="flex space-x-4 justify-between">
                        <div
                          className={`flex flex-col gap-4 min-w-0 ${project.body != "" ? "w-4/12" : ""}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {project.iconUrl && (
                              <Image
                                src={project.iconUrl || ""}
                                alt={project.title}
                                width={64}
                                height={64}
                                className="min-w-16 min-h-16 rounded-md"
                              />
                            )}
                            <div className="flex flex-col gap-1 min-w-0">
                              <p className="break-words">{project.title}</p>
                              <Tooltip
                                className="min-w-0"
                                size="sm"
                                delay={500}
                                content={
                                  <p className="truncate min-w-0">
                                    {project.description}
                                  </p>
                                }
                              >
                                {project.description && (
                                  <p className="text-xs text-gray-400 truncate flex-grow max-w-96">
                                    {project.description}
                                  </p>
                                )}
                              </Tooltip>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {project.url && (
                              <Button
                                variant="flat"
                                startContent={
                                  project.provider == Provider.CURSEFORGE ? (
                                    <SiCurseforge size={22} />
                                  ) : project.provider == Provider.MODRINTH ? (
                                    <SiModrinth size={22} />
                                  ) : (
                                    <Globe size={22} />
                                  )
                                }
                                onPress={async () => {
                                  await api.shell.openExternal(project.url);
                                }}
                              >
                                {t("modManager.goToWebsite")}
                              </Button>
                            )}

                            {settings.lang != "en" &&
                              account?.type != "plain" && (
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  isLoading={
                                    isLoading &&
                                    loadingType == LoadingType.TRANSLATE
                                  }
                                  onPress={async () => {
                                    setLoading(true);
                                    setLoadingType(LoadingType.TRANSLATE);

                                    const [
                                      translatedDescription,
                                      translatedBody,
                                    ] = await Promise.all([
                                      project.description
                                        ? await api.backend.aiComplete(
                                            account?.accessToken || "",
                                            `Translate the following text to ${settings.lang}:\n\n${project.description}`,
                                          )
                                        : undefined,
                                      project.body
                                        ? await api.backend.aiComplete(
                                            account?.accessToken || "",
                                            `Translate the following text to ${settings.lang}:\n\n${project.body}`,
                                          )
                                        : undefined,
                                    ]);

                                    setProject({
                                      ...project,
                                      description:
                                        translatedDescription ||
                                        project.description,
                                      body: translatedBody || project.body,
                                    });

                                    setLoading(false);
                                    setLoadingType(null);
                                  }}
                                >
                                  <Languages size={22} />
                                </Button>
                              )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {selectVersion && selectVersion.id != "" && (
                              <Select
                                size="sm"
                                label={t("versions.version")}
                                className="max-w-80"
                                isDisabled={
                                  isLoading ||
                                  project.provider == Provider.LOCAL
                                }
                                selectedKeys={[selectVersion?.id || ""]}
                                startContent={
                                  isAvailableUpdate && (
                                    <Tooltip
                                      content={t("modManager.availableUpdate")}
                                    >
                                      <CircleAlert
                                        size={20}
                                        className="min-w-5 min-h-5 text-warning"
                                      />
                                    </Tooltip>
                                  )
                                }
                                onChange={async (event) => {
                                  const value = event.target.value;
                                  if (!value) return;

                                  const idx = project.versions.findIndex(
                                    (v) => v.id == value,
                                  );
                                  const safeIdx = idx == -1 ? 0 : idx;
                                  setIsAvailableUpdate(safeIdx != 0);

                                  const v = project.versions[safeIdx];
                                  if (!v) return;

                                  setLoading(true);
                                  setLoadingType(LoadingType.NEW_VERSION);

                                  let next = {
                                    ...v,
                                    dependencies: v.dependencies ?? [],
                                  };

                                  if (
                                    !isModpacks &&
                                    next.dependencies.length > 0 &&
                                    next.dependencies.filter((d) => d.project)
                                      .length == 0
                                  ) {
                                    const deps =
                                      await api.modManager.getDependencies(
                                        project.provider,
                                        project.id,
                                        next.dependencies,
                                      );
                                    next = { ...next, dependencies: deps };
                                  }

                                  setSelectVersion(next);

                                  setLoading(false);
                                  setLoadingType(null);
                                }}
                              >
                                {project.versions.map((v) => (
                                  <SelectItem textValue={v.name} key={v.id}>
                                    <p>{v.name}</p>
                                  </SelectItem>
                                ))}
                              </Select>
                            )}

                            <div className="flex items-center gap-2">
                              {!installedProject ? (
                                <Button
                                  variant="flat"
                                  color="success"
                                  startContent={<Download size={22} />}
                                  isLoading={
                                    isLoading &&
                                    loadingType == LoadingType.INSTALL
                                  }
                                  isDisabled={
                                    isLoading ||
                                    mods
                                      .filter(
                                        (m) => m.provider == Provider.LOCAL,
                                      )
                                      .some((m) =>
                                        m.version?.files.some(
                                          (f) =>
                                            f.sha1 ==
                                            selectVersion?.files[0]?.sha1,
                                        ),
                                      )
                                  }
                                  onPress={async () => {
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

                                      if (file.url.startsWith("blocked::")) {
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

                                      const modpackPath = await api.path.join(
                                        temp,
                                        await api.path.basename(
                                          filename,
                                          await api.path.extname(filename),
                                        ),
                                      );

                                      await api.file.download(
                                        [
                                          {
                                            destination: await api.path.join(
                                              temp,
                                              filename,
                                            ),
                                            group: "mods",
                                            url: file.url,
                                            sha1: file.sha1,
                                            size: file.size,
                                            options: {
                                              extract: true,
                                              extractDelete: true,
                                              extractFolder: modpackPath,
                                            },
                                          },
                                        ],
                                        settings.downloadLimit,
                                      );

                                      const modpack =
                                        await api.modManager.checkModpack(
                                          modpackPath,
                                          project,
                                          selectVersion,
                                        );
                                      if (!modpack) {
                                        addToast({
                                          color: "danger",
                                          title: t("modManager.notModpack"),
                                        });
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
                                        files: selectVersion.files.map((f) => ({
                                          filename: f.filename,
                                          size: f.size,
                                          isServer: f.isServer,
                                          url: f.url,
                                          sha1: f.sha1,
                                        })),
                                        dependencies:
                                          selectVersion.dependencies.map(
                                            (d) => ({
                                              title: d.project?.title || "",
                                              relationType: d.relationType,
                                            }),
                                          ),
                                      },
                                    };

                                    setMods([...mods, newProject]);
                                    setInstalledProject(newProject);
                                    setDependency(
                                      getLocalDependencies(newProject.title),
                                    );

                                    setLoading(false);
                                    setLoadingType(null);

                                    addToast({
                                      color: "success",
                                      title: t("modManager.added"),
                                    });
                                  }}
                                >
                                  {t("common.install")}
                                </Button>
                              ) : (
                                <>
                                  <Tooltip
                                    isDisabled={dependency.length == 0}
                                    content={
                                      <div className="flex flex-col gap-1 p-1">
                                        {t("modManager.addiction")}
                                        <ScrollShadow className="flex flex-col gap-1 max-h-[180px] pr-1">
                                          {dependency.map((d, i) => (
                                            <Chip
                                              variant="flat"
                                              size="sm"
                                              key={i}
                                              color={
                                                dependencyDisplay(
                                                  d.relationType,
                                                ).color as
                                                  | "default"
                                                  | "warning"
                                                  | "success"
                                                  | "danger"
                                                  | "primary"
                                                  | "secondary"
                                                  | undefined
                                              }
                                            >
                                              {d.title}
                                            </Chip>
                                          ))}
                                        </ScrollShadow>
                                      </div>
                                    }
                                  >
                                    <div>
                                      <Button
                                        variant="flat"
                                        color="danger"
                                        startContent={<Trash size={22} />}
                                        isDisabled={
                                          dependency.filter(
                                            (d) =>
                                              d.relationType ==
                                              DependencyType.REQUIRED,
                                          ).length > 0 || isLoading
                                        }
                                        onPress={() => {
                                          let newMods = [...mods];
                                          const idx = newMods.findIndex(
                                            (p) => p.id == project.id,
                                          );
                                          if (idx !== -1)
                                            newMods.splice(idx, 1);

                                          setMods([...newMods]);
                                          setInstalledProject(null);

                                          addToast({
                                            color: "success",
                                            title: t("modManager.deleted"),
                                          });
                                        }}
                                      >
                                        {t("common.delete")}
                                      </Button>
                                    </div>
                                  </Tooltip>

                                  {project.provider != Provider.LOCAL && (
                                    <Button
                                      variant="flat"
                                      color="primary"
                                      startContent={
                                        <CircleArrowDown size={22} />
                                      }
                                      isDisabled={
                                        selectVersion?.id ==
                                          installedProject.version?.id ||
                                        isLoading
                                      }
                                      onPress={() => {
                                        if (!selectVersion) return;

                                        let newMods = [...mods];

                                        const updated: ILocalProject = {
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
                                                url: f.url,
                                                isServer: f.isServer,
                                                sha1: f.sha1,
                                              }),
                                            ),
                                            dependencies:
                                              selectVersion.dependencies.map(
                                                (d) => ({
                                                  title: d.project?.title || "",
                                                  relationType: d.relationType,
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

                                        addToast({
                                          color: "success",
                                          title: t("modManager.updated"),
                                        });
                                      }}
                                    >
                                      {t("common.update")}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {!isModpacks &&
                            project.provider != Provider.LOCAL && (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold">
                                    {t("modManager.dependencies")}
                                  </p>
                                  {isLoading &&
                                    loadingType == LoadingType.NEW_VERSION && (
                                      <Spinner size="sm" />
                                    )}
                                </div>

                                <ScrollShadow className="flex flex-col space-y-2 max-h-[200px] pr-1">
                                  {selectVersion?.dependencies &&
                                    selectVersion.dependencies.length > 0 &&
                                    loadingType != LoadingType.NEW_VERSION &&
                                    selectVersion.dependencies.map(
                                      (d, index) => {
                                        if (!d.project) return null;

                                        const depInstalled =
                                          installedById.get(d.project.id) ??
                                          installedByTitle.get(
                                            d.project.title.toLowerCase(),
                                          );

                                        const depType = dependencyDisplay(
                                          d.relationType,
                                        );

                                        return (
                                          <div
                                            key={index}
                                            className="flex items-center justify-between gap-2"
                                          >
                                            <div className="flex items-center space-x-2 min-w-0">
                                              <Image
                                                src={d.project.iconUrl || ""}
                                                alt={d.project.title}
                                                width={32}
                                                height={32}
                                                className="min-w-8 min-h-8 rounded-md"
                                              />
                                              <p className="text-sm truncate flex-grow">
                                                {d.project.title}
                                              </p>
                                            </div>

                                            <div className="flex items-center space-x-1">
                                              <Chip
                                                variant="flat"
                                                size="sm"
                                                color={
                                                  depType.color as
                                                    | "default"
                                                    | "warning"
                                                    | "success"
                                                    | "danger"
                                                    | "primary"
                                                    | "secondary"
                                                    | undefined
                                                }
                                              >
                                                {depType.title}
                                              </Chip>

                                              {d.relationType !=
                                                DependencyType.INCOMPATIBLE &&
                                              d.relationType !=
                                                DependencyType.EMBEDDED ? (
                                                <Button
                                                  size="sm"
                                                  variant="flat"
                                                  isIconOnly
                                                  isDisabled={isLoading}
                                                  isLoading={
                                                    isLoading &&
                                                    loadingType ==
                                                      LoadingType.DEPENDENCY &&
                                                    proccessKey == index
                                                  }
                                                  onPress={async () => {
                                                    if (!d.project || !version)
                                                      return;

                                                    setLoading(true);
                                                    setLoadingType(
                                                      LoadingType.DEPENDENCY,
                                                    );
                                                    setProccessKey(index);

                                                    let newProj: IProject =
                                                      d.project;
                                                    if (depInstalled) {
                                                      newProj = {
                                                        ...depInstalled,
                                                        versions: [],
                                                        body: "",
                                                        gallery: [],
                                                      } as unknown as IProject;
                                                    }

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
                                                          version: version.id,
                                                          projectType:
                                                            newProj.projectType,
                                                          modUrl: newProj.url,
                                                        },
                                                      );

                                                    if (!vers.length) {
                                                      setLoading(false);
                                                      setLoadingType(null);
                                                      setProccessKey(-1);
                                                      addToast({
                                                        color: "danger",
                                                        title: t(
                                                          "modManager.notFoundMod",
                                                        ),
                                                      });
                                                      return;
                                                    }

                                                    let currentIndex = 0;
                                                    if (depInstalled) {
                                                      const idx =
                                                        vers.findIndex(
                                                          (v) =>
                                                            v.id ==
                                                            depInstalled.version
                                                              ?.id,
                                                        );
                                                      currentIndex =
                                                        idx == -1 ? 0 : idx;
                                                    }

                                                    let body = "";
                                                    let gallery: IProject["gallery"] =
                                                      [];

                                                    if (!depInstalled) {
                                                      const info =
                                                        await api.modManager.getProject(
                                                          newProj.provider,
                                                          newProj.id,
                                                        );
                                                      if (info) {
                                                        body = info.body;
                                                        gallery = info.gallery;
                                                      }
                                                    }

                                                    let currentVersion =
                                                      vers[currentIndex] ??
                                                      vers[0];
                                                    if (
                                                      currentVersion
                                                        .dependencies?.length >
                                                      0
                                                    ) {
                                                      const deps =
                                                        await api.modManager.getDependencies(
                                                          newProj.provider,
                                                          newProj.id,
                                                          currentVersion.dependencies,
                                                        );
                                                      currentVersion = {
                                                        ...currentVersion,
                                                        dependencies: deps,
                                                      };
                                                      vers[currentIndex] =
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
                                                    setDependency(
                                                      depInstalled
                                                        ? getLocalDependencies(
                                                            newProj.title,
                                                          )
                                                        : [],
                                                    );
                                                    setProject({
                                                      ...newProj,
                                                      versions: vers,
                                                      body,
                                                      gallery,
                                                    });

                                                    setLoading(false);
                                                    setLoadingType(null);
                                                    setProccessKey(-1);

                                                    setInfoModalOpen(true);
                                                  }}
                                                >
                                                  {depInstalled ? (
                                                    <Settings size={22} />
                                                  ) : (
                                                    <Download size={22} />
                                                  )}
                                                </Button>
                                              ) : null}
                                            </div>
                                          </div>
                                        );
                                      },
                                    )}

                                  {!isModpacks &&
                                    selectVersion?.dependencies.length == 0 &&
                                    loadingType != LoadingType.NEW_VERSION && (
                                      <div>
                                        <Alert
                                          title={t("modManager.noDependencies")}
                                        />
                                      </div>
                                    )}
                                </ScrollShadow>
                              </div>
                            )}
                        </div>

                        {project.body != "" && (
                          <div className="flex flex-col w-8/12 space-y-2 h-full">
                            <ScrollShadow
                              className={`${project.gallery.length > 0 ? "max-h-[355px]" : "max-h-[435px]"} pr-1`}
                            >
                              <ModBody body={project.body} />
                            </ScrollShadow>

                            <GalleryCarousel gallery={project.gallery} />
                          </div>
                        )}
                      </div>
                    ) : undefined}
                  </ModalBody>
                </ModalContent>
              </Modal>
            </>
          </ModalBody>
        </ModalContent>
      </Modal>

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
              addToast({ color: "danger", title: t("modManager.notModpack") });
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
            addToast({
              color: "success",
              title: t("modManager.addedMultiple", { count: projects.length }),
            });
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
            addToast({
              color: "success",
              title: t("modManager.updatedMultiple", {
                count: projects.length,
              }),
            });
          }}
        />
      )}
    </>
  );
}
