const api = window.api

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
  IAddedLocalProject
} from '@/types/ModManager'
import { loaders } from '../Loaders'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SiCurseforge, SiModrinth } from 'react-icons/si'
import SVG from 'react-inlinesvg'
import { useTranslation } from 'react-i18next'
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
  Languages
} from 'lucide-react'
import { useAtom } from 'jotai'
import {
  accountAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom
} from '@renderer/stores/atoms'
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
  Progress
} from '@heroui/react'
import { BlockedMods, IBlockedMod } from '../Modals/BlockedMods'
import { ModBody } from './ModBody'
import GalleryCarousel from './Gallery'
import { Loader } from '@/types/Loader'
import { IVersion } from '@/types/IVersion'
import { ModToggleButton } from './ModToggleButton'
import { getProjectTypes } from '@renderer/utilities/mod'
import { ALPModal } from './AddLocalProjectsModal'

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
  TRANSLATE
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
  setModpack
}: {
  mods: ILocalProject[]
  setMods: (mods: ILocalProject[]) => void
  onClose: (modpack?: IModpack) => void
  version: IVersion | undefined
  loader: Loader | undefined
  isModpacks: boolean
  setVersion: (version: IVersion | undefined) => void
  setLoader: (loader: Loader | undefined) => void
  setModpack: (modpack: IModpack) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [browser, setBrowser] = useState<(IProject | ILocalProject)[]>([])
  const [provider, setProvider] = useState<Provider>(Provider.CURSEFORGE)
  const [isLoading, setLoading] = useState(false)
  const [projectType, setProjectType] = useState<ProjectType>(ProjectType.MOD)
  const [loadingType, setLoadingType] = useState<LoadingType | null>(null)
  const [sortValues, setSortValues] = useState<string[]>([])
  const [sort, setSort] = useState('')
  const [filters, setFilters] = useState<IFilterGroup[]>([])
  const [filter, setFilter] = useState<string[]>([])
  const [project, setProject] = useState<IProject | null>(null)
  const [isInfoModalOpen, setInfoModalOpen] = useState(false)
  const [proccessKey, setProccessKey] = useState(-1)
  const [selectVersion, setSelectVersion] = useState<ModManagerVersion | null>(null)
  const [installedProject, setInstalledProject] = useState<ILocalProject | null>(null)
  const [sTimeout, setSTimeout] = useState<NodeJS.Timeout>()
  const [isLocal, setLocal] = useState(false)
  const [prevProjects, setPrevProjects] = useState<IProject[]>([])
  const [projectTypes, setProjectTypes] = useState<ProjectType[]>([])
  const [dependency, setDependency] = useState<ILocalDependency[]>([])
  const [isAvailableUpdate, setIsAvailableUpdate] = useState(false)
  const [isCheckedAvailableUpdate, setIsCheckedAvailableUpdate] = useState(false)
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom)
  const [server] = useAtom(serverAtom)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [versions, setVersions] = useState<IVersion[]>([])
  const [searchData, setSearchData] = useState<ISearchData>()
  const [offset, setOffset] = useState(0)
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([])
  const [isBlockedMods, setIsBlockedMods] = useState(false)
  const [paths] = useAtom(pathsAtom)
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const settings = useAtom(settingsAtom)[0]
  const [account] = useAtom(accountAtom)
  const [addingLocalProjects, setAddingLocalProjects] = useState<IAddedLocalProject[]>([])
  const [isOpenALPInfo, setIsOpenALPInfo] = useState(false)
  const [readingLocalModsProgress, setReadingLocalModsProgress] = useState<number>(0)

  const { t } = useTranslation()

  useEffect(() => {
    let pts: ProjectType[] = []
    if (isModpacks) {
      pts = [ProjectType.MODPACK]
    } else {
      pts = getProjectTypes(loader || 'vanilla', server, provider)
    }

    setProjectTypes(pts)
    setProjectType(pts[0])

    async function localInit() {
      setLocal(true)
      await search({
        version: undefined,
        loader: undefined,
        query: searchQuery,
        provider,
        projectType: pts[0],
        sort,
        filter,
        isLocal: true,
        offset: 0
      })
    }

    if (isDownloadedVersion || !isOwnerVersion) {
      localInit()
      return
    }

    ;(async () => {
      const sortValues = await api.modManager.getSort(provider)
      setSortValues(sortValues)
      setSort(sortValues[0])
    })()

    async function getVersions() {
      setLoading(true)
      setLoadingType(LoadingType.GAME_VERSIONS)

      const versions = await api.versions.getList('vanilla')
      setVersions(versions)
    }

    async function init() {
      await getVersions()
      await getFilters(provider, pts[0])
      await search({
        version,
        loader,
        query: searchQuery,
        provider,
        projectType: pts[0],
        sort: sortValues[0],
        filter,
        isLocal,
        offset: 0
      })
    }

    init()
  }, [])

  async function search({
    version,
    loader,
    query,
    provider,
    projectType,
    sort,
    filter,
    isLocal,
    offset
  }: {
    version: IVersion | undefined
    loader: Loader | undefined
    query: string
    provider: Provider
    projectType: ProjectType
    sort: string
    filter: string[]
    isLocal: boolean
    offset: number
  }) {
    if (!isLocal && provider == Provider.LOCAL) {
      setBrowser([])
      return
    }

    setLoading(true)
    setLoadingType(LoadingType.SEARCH)

    if (isLocal) {
      let total = mods.filter((m) => m.projectType == projectType).length
      if (query == '')
        setBrowser(mods.filter((m) => m.projectType == projectType).slice(offset, offset + 20))
      else {
        const projects = mods.filter(
          (p) =>
            (p.title.toLowerCase().includes(query.toLowerCase()) ||
              p.description.toLowerCase().includes(query.toLowerCase())) &&
            p.projectType == projectType
        )
        total = projects.length
        setBrowser(projects.filter((m) => m.projectType == projectType).slice(offset, offset + 20))
      }

      setSearchData({
        offset: 0,
        limit: 20,
        total,
        projects: []
      })
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
          filter: filter
            .filter((f) => f != '')
            .map((f) =>
              provider == Provider.CURSEFORGE
                ? filters
                    .map((g) => g.items)
                    .flat()
                    .find((i) => i.name == f)?.id || ''
                : f
            )
        },
        {
          offset,
          limit: 20
        }
      )

      setSearchData(data)
      setBrowser(data.projects)
    }

    setTimeout(() => {
      setLoading(false)
      setLoadingType(null)
    }, 0)

    if (searchRef.current) {
      const input = searchRef.current.querySelector('input')

      if (input)
        setTimeout(() => {
          input.focus()
        }, 50)
    }
  }

  async function getFilters(provider: Provider, projectType: ProjectType) {
    if (provider == Provider.LOCAL) return

    setLoading(true)
    setLoadingType(LoadingType.FILTER)

    const filters = await api.modManager.getFilter(provider, projectType)
    setFilters(filters)
  }

  function getLocalDependencies(title: string) {
    const dependencies: ILocalDependency[] = []

    for (let index = 0; index < mods.length; index++) {
      const mod = mods[index]

      const dependency = mod.version?.dependencies.find((d) => d.title == title)
      if (!dependency) continue

      dependencies.push({
        title: mod.title,
        relationType: dependency.relationType
      })
    }

    return dependencies
  }

  function dependencyDisplay(relationType: DependencyType) {
    let dependencyType = {
      title: t('modManager.dependencyTypes.0'),
      color: 'default'
    }

    if (relationType == DependencyType.REQUIRED) {
      dependencyType = {
        title: t('modManager.dependencyTypes.1'),
        color: 'warning'
      }
    } else if (relationType == DependencyType.OPTIONAL) {
      dependencyType = {
        title: t('modManager.dependencyTypes.2'),
        color: 'default'
      }
    } else if (relationType == DependencyType.EMBEDDED) {
      dependencyType = {
        title: t('modManager.dependencyTypes.3'),
        color: 'success'
      }
    } else if (relationType == DependencyType.INCOMPATIBLE) {
      dependencyType = {
        title: t('modManager.dependencyTypes.4'),
        color: 'danger'
      }
    }

    return dependencyType
  }

  async function getAvailableUpdate() {
    if (!version) return []

    const canBeUpdated: ILocalProject[] = []
    const items = mods.filter((m) => m.projectType == projectType)

    for (let index = 0; index < items.length; index++) {
      try {
        const mod = items[index]

        if (mod.provider == Provider.LOCAL) continue

        const versions = await api.modManager.getVersions(mod.provider, mod.id, {
          loader:
            mod.projectType == ProjectType.PLUGIN && server
              ? (server.core as unknown as Loader)
              : loader || 'vanilla',
          version: version.id,
          projectType: mod.projectType,
          modUrl: mod.url
        })

        const latestVersion = versions[0]
        if (mod.version?.id == latestVersion.id) continue

        canBeUpdated.push(mod)
      } catch (error) {
        continue
      }
    }

    return canBeUpdated
  }

  const readLocalMods = useCallback(
    async (paths: string[]) => {
      setLoading(true)
      setLoadingType(LoadingType.CHECK_LOCAL_MOD)
      setReadingLocalModsProgress(0)

      const localProjects: IAddedLocalProject[] = []
      for (const path of paths) {
        setReadingLocalModsProgress(Math.round(((localProjects.length + 1) / paths.length) * 100))

        const info = await api.modManager.checkLocalMod(path)
        if (!info) {
          localProjects.push({
            project: {
              description: '',
              iconUrl: null,
              id: '-1',
              projectType,
              provider: Provider.LOCAL,
              title: await api.path.basename(path),
              url: '',
              versions: [],
              body: '',
              gallery: []
            },
            status: 'invalid'
          })

          continue
        }

        let isDuplicate = false
        if (
          mods.find(
            (m) =>
              m.title.toLocaleLowerCase() == info.name.toLocaleLowerCase() ||
              m.id == info.id ||
              m.version?.files.find((f) => f.sha1 == info.sha1)
          )
        )
          isDuplicate = true

        const version: ModManagerVersion = {
          dependencies: [],
          id: info.version || '',
          downloads: -1,
          name: info.version || '',
          files: [
            {
              filename: info.filename,
              isServer: true,
              size: info.size,
              url: `file://${info.path}`,
              sha1: info.sha1
            }
          ]
        }

        localProjects.push({
          project: {
            description: info.description,
            iconUrl: info.icon,
            id: info.id,
            projectType,
            provider: Provider.LOCAL,
            title: info.name,
            url: info.url,
            versions: [version],
            body: '',
            gallery: []
          },
          status: isDuplicate ? 'duplicate' : 'valid'
        })
      }

      if (localProjects.length == 0) {
        addToast({
          title: t('modManager.invalidMod'),
          color: 'warning'
        })
      } else setAddingLocalProjects(localProjects)

      setLoading(false)
      setLoadingType(null)
      setReadingLocalModsProgress(0)

      setIsOpenALPInfo(true)
    },
    [projectType, mods]
  )

  return (
    <>
      <Modal
        size="full"
        isOpen={true}
        onClose={() => {
          if (isLoading) return
          onClose()
        }}
      >
        <ModalContent className="h-full w-full">
          <ModalHeader>{t('modManager.title')}</ModalHeader>

          <ModalBody className="flex flex-1 min-h-0 w-full">
            <>
              <div className="flex flex-col space-y-2 h-full w-full">
                <div className="flex items-center gap-2 justify-between">
                  <div className="flex items-center gap-2">
                    {!isLocal && (
                      <Tooltip
                        delay={1000}
                        isDisabled={
                          provider != Provider.CURSEFORGE && provider != Provider.MODRINTH
                        }
                        content={provider == Provider.CURSEFORGE ? 'CurseForge' : 'Modrinth'}
                        color={
                          provider == Provider.CURSEFORGE
                            ? 'warning'
                            : provider == Provider.MODRINTH
                              ? 'success'
                              : 'default'
                        }
                      >
                        <Button
                          variant="flat"
                          isIconOnly
                          color={
                            provider == Provider.CURSEFORGE
                              ? 'warning'
                              : provider == Provider.MODRINTH
                                ? 'success'
                                : 'default'
                          }
                          isDisabled={isLoading}
                          onPress={async () => {
                            const newProvider =
                              provider == Provider.CURSEFORGE
                                ? Provider.MODRINTH
                                : provider == Provider.MODRINTH
                                  ? !isModpacks
                                    ? Provider.LOCAL
                                    : Provider.CURSEFORGE
                                  : Provider.CURSEFORGE

                            setProvider(newProvider)
                            setSearchData(undefined)

                            let pts: ProjectType[] = []
                            if (!isModpacks) {
                              pts = getProjectTypes(loader || 'vanilla', server, newProvider)
                              setProjectTypes(pts)

                              if (!pts.includes(projectType)) setProjectType(pts[0])
                            } else {
                              pts = [...projectTypes]
                            }

                            const sortValues = await api.modManager.getSort(newProvider)
                            setSortValues(sortValues)
                            setSort(sortValues[0])

                            await getFilters(newProvider, projectType)
                            setFilter([])

                            setOffset(0)

                            await search({
                              version,
                              loader,
                              query: searchQuery,
                              provider: newProvider,
                              projectType: pts.includes(projectType) ? projectType : pts[0],
                              sort: sortValues[0],
                              filter: [],
                              isLocal,
                              offset: 0
                            })
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
                        label={t('modManager.type')}
                        isDisabled={isLoading}
                        selectedKeys={[projectType]}
                        className="w-40 min-w-40"
                        onChange={async (event) => {
                          const value = event.target.value as ProjectType
                          if (!value) return

                          setProjectType(value)
                          setIsCheckedAvailableUpdate(false)

                          if (!isLocal) await getFilters(provider, value as ProjectType)

                          setOffset(searchData ? searchData.limit : 0)
                          await search({
                            version,
                            loader,
                            query: searchQuery,
                            provider,
                            projectType: value as ProjectType,
                            sort,
                            filter,
                            isLocal,
                            offset: 0
                          })
                        }}
                      >
                        {projectTypes.map((type) => {
                          return (
                            <SelectItem key={type}>
                              {t('modManager.projectTypes.' + type)}
                            </SelectItem>
                          )
                        })}
                      </Select>
                    )}
                  </div>

                  {isModpacks && (
                    <>
                      <Select
                        label={t('versions.version')}
                        size="sm"
                        className="w-28 min-w-28"
                        startContent={
                          isLoading && loadingType == LoadingType.GAME_VERSIONS ? (
                            <Spinner size="sm" />
                          ) : (
                            ''
                          )
                        }
                        isDisabled={isLoading}
                        selectedKeys={[version?.id || '']}
                        onChange={async (event) => {
                          let ver = versions.find((v) => v.id == event.target.value)
                          if (!ver) {
                            ver = undefined
                          }

                          setVersion(ver)

                          setOffset(searchData ? searchData.limit : 0)
                          await search({
                            loader,
                            version: ver,
                            query: searchQuery,
                            provider,
                            projectType,
                            sort,
                            filter,
                            isLocal,
                            offset: 0
                          })
                        }}
                      >
                        {versions.map((v) => {
                          return <SelectItem key={v.id}>{v.id}</SelectItem>
                        })}
                      </Select>

                      <Select
                        label={t('versions.loader')}
                        size="sm"
                        className="w-36 min-w-36"
                        isDisabled={isLoading}
                        selectedKeys={[loader ? loader : '']}
                        onChange={async (event) => {
                          const l = event.target.value as Loader
                          setLoader(l)
                          setOffset(searchData ? searchData.limit : 0)
                          await search({
                            version,
                            loader: l,
                            query: searchQuery,
                            provider,
                            projectType,
                            sort,
                            filter,
                            isLocal,
                            offset: 0
                          })
                        }}
                      >
                        <SelectItem key="forge">{loaders['forge'].name}</SelectItem>
                        <SelectItem key="neoforge">{loaders['neoforge'].name}</SelectItem>
                        <SelectItem key="fabric">{loaders['fabric'].name}</SelectItem>
                        <SelectItem key="quilt">{loaders['quilt'].name}</SelectItem>
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
                        setSearchQuery(event.target.value)

                        if (sTimeout) clearTimeout(sTimeout)
                        setSTimeout(
                          setTimeout(async () => {
                            setOffset(searchData ? searchData.limit : 0)
                            await search({
                              version,
                              loader,
                              query: event.target.value,
                              provider,
                              projectType,
                              sort,
                              filter,
                              isLocal,
                              offset: 0
                            })
                          }, 500)
                        )
                      }}
                    />
                  )}

                  {isLocal && (
                    <>
                      {isLocal &&
                        !isCheckedAvailableUpdate &&
                        !isDownloadedVersion &&
                        isOwnerVersion && (
                          <div>
                            <Button
                              variant="flat"
                              isLoading={
                                isLoading && loadingType == LoadingType.CHECK_AVAILABLE_UPDATE
                              }
                              onPress={async () => {
                                try {
                                  setLoading(true)
                                  setLoadingType(LoadingType.CHECK_AVAILABLE_UPDATE)

                                  const canBeUpdated = await getAvailableUpdate()
                                  setBrowser(canBeUpdated)
                                  setIsCheckedAvailableUpdate(true)
                                } catch {
                                } finally {
                                  setLoading(false)
                                  setLoadingType(null)
                                }
                              }}
                            >
                              {t('modManager.checkUpdates')}
                            </Button>
                          </div>
                        )}
                      {isCheckedAvailableUpdate && !isDownloadedVersion && isOwnerVersion && (
                        <div>
                          <Button
                            variant="flat"
                            onPress={async () => {
                              setBrowser(mods.filter((m) => m.projectType == projectType))
                              setIsCheckedAvailableUpdate(false)
                            }}
                          >
                            {t('modManager.viewAllMods')}
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <PanelTopOpen size={22} />
                        <p>{mods.filter((m) => m.projectType == projectType).length}</p>
                      </div>
                    </>
                  )}

                  {!isLocal && provider != Provider.LOCAL && (
                    <>
                      <Select
                        label={t('modManager.sort')}
                        size="sm"
                        className="min-w-48 w-48"
                        isDisabled={isLoading}
                        selectedKeys={[sort]}
                        onChange={async (event) => {
                          const value = event.target.value
                          if (!value) return
                          setSort(value)
                          setOffset(searchData ? searchData.limit : 0)
                          await search({
                            version,
                            loader,
                            query: searchQuery,
                            provider,
                            projectType,
                            sort: value,
                            filter,
                            isLocal,
                            offset: 0
                          })
                        }}
                      >
                        {sortValues.map((s) => {
                          return <SelectItem key={s}>{t('modManager.sorts.' + s)}</SelectItem>
                        })}
                      </Select>

                      <Select
                        label={t('modManager.filter')}
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
                          const values = event.target.value.split(',')

                          setFilter(values)
                          setOffset(searchData ? searchData.limit : 0)
                          await search({
                            version,
                            loader,
                            query: searchQuery,
                            provider,
                            projectType,
                            sort,
                            filter: values,
                            isLocal,
                            offset: 0
                          })
                        }}
                        renderValue={() => {
                          return <p>{filter.filter((f) => f != '').join(', ')}</p>
                        }}
                      >
                        {filters.map((group, index) => {
                          return (
                            <SelectSection key={index} title={group.title}>
                              {group.items.map((f) => (
                                <SelectItem key={f.name}>
                                  <div className="flex items-center gap-2">
                                    {f.icon?.includes('svg') ? (
                                      <SVG
                                        src={f.icon || ''}
                                        width={16}
                                        height={16}
                                        title={f.name}
                                      />
                                    ) : (
                                      <Image
                                        src={f.icon || ''}
                                        width={16}
                                        height={16}
                                        className="min-h-4 min-w-4"
                                        alt=""
                                      />
                                    )}

                                    <p className="text-xs">
                                      {provider == Provider.CURSEFORGE
                                        ? f.name
                                        : f.name.charAt(0).toUpperCase() + f.name.slice(1)}
                                    </p>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectSection>
                          )
                        })}
                      </Select>
                    </>
                  )}
                  {(provider != Provider.LOCAL || isLocal) && (
                    <Button
                      variant="flat"
                      isIconOnly
                      isDisabled={isLoading}
                      onPress={async () => {
                        setSearchQuery('')
                        setSort(sortValues[0])
                        setFilter([])

                        if (isModpacks) {
                          setVersion(undefined)
                          setLoader(undefined)
                        }

                        setOffset(searchData ? searchData.limit : 0)
                        await search({
                          version: isModpacks ? undefined : version,
                          loader: isModpacks ? undefined : loader,
                          query: '',
                          provider,
                          projectType,
                          sort: sortValues[0],
                          filter: [],
                          isLocal,
                          offset: 0
                        })
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
                        const checked = event.target.checked

                        setLocal(checked)
                        setSearchQuery('')
                        setSort(sortValues[0])
                        setIsCheckedAvailableUpdate(false)
                        if (!checked) await getFilters(provider, projectType)
                        setFilter([])

                        setOffset(searchData ? searchData.limit : 0)
                        await search({
                          version,
                          loader,
                          query: '',
                          provider,
                          projectType,
                          sort: sortValues[0],
                          filter: [],
                          isLocal: checked,
                          offset: 0
                        })
                      }}
                    />
                  )}
                </div>

                {!isLocal && provider == Provider.LOCAL ? (
                  <>
                    <span>
                      <Alert variant="bordered" title={t('modManager.selectLocals')} />
                    </span>

                    {readingLocalModsProgress > 0 && (
                      <Progress size="sm" value={readingLocalModsProgress} />
                    )}

                    <Button
                      variant="flat"
                      color="primary"
                      startContent={<FileBox size={22} />}
                      isLoading={isLoading && loadingType == LoadingType.CHECK_LOCAL_MOD}
                      onPress={async () => {
                        const filePaths = await api.other.openFileDialog(
                          false,
                          [
                            {
                              name: 'Mods',
                              extensions: ['jar', 'zip']
                            }
                          ],
                          true
                        )

                        if (!filePaths || filePaths.length == 0) return
                        await readLocalMods(filePaths)
                      }}
                    >
                      {t('common.choose')}
                    </Button>
                  </>
                ) : isLoading &&
                  (loadingType == LoadingType.SEARCH ||
                    loadingType == LoadingType.FILTER ||
                    loadingType == LoadingType.GAME_VERSIONS) ? (
                  <div className="flex justify-center items-center flex-1 min-h-0">
                    <Spinner size="sm" label={t('common.searching')} />
                  </div>
                ) : browser.length > 0 ? (
                  <div className="flex-1 min-h-0">
                    <ScrollShadow className="h-full">
                      {browser.map((project, index) => {
                        const isInstalled = mods.find(
                          (p) =>
                            p.id == project.id ||
                            p.title.toLowerCase() == project.title.toLowerCase()
                        )

                        return (
                          <Card key={index} className="mb-2">
                            <CardBody>
                              <div className="flex items-center justify-between space-x-2">
                                <div className="flex items-center gap-2">
                                  {project.iconUrl && (
                                    <Image
                                      src={project.iconUrl}
                                      alt={project.title}
                                      width={64}
                                      height={64}
                                      className="rounded-md min-w-16 min-h-16"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="flex flex-col gap-1">
                                    <p>{project.title}</p>
                                    {project.description && (
                                      <p className="text-xs text-gray-400">{project.description}</p>
                                    )}
                                    {isInstalled ? (
                                      <Chip
                                        variant="flat"
                                        size="sm"
                                        color={
                                          isInstalled.provider == Provider.CURSEFORGE
                                            ? 'warning'
                                            : isInstalled.provider == Provider.MODRINTH
                                              ? 'success'
                                              : isInstalled.provider == Provider.LOCAL
                                                ? 'primary'
                                                : 'default'
                                        }
                                      >
                                        <div className="flex items-center gap-2">
                                          {isInstalled.provider == Provider.CURSEFORGE ? (
                                            <>
                                              <SiCurseforge size={16} />
                                              <p className="text-xs">CurseForge</p>
                                            </>
                                          ) : isInstalled.provider == Provider.MODRINTH ? (
                                            <>
                                              <SiModrinth size={16} />
                                              <p className="text-xs">Modrinth</p>
                                            </>
                                          ) : isInstalled.provider == Provider.LOCAL ? (
                                            <>
                                              <FileBox size={16} />
                                              <p className="text-xs">{t('modManager.local')}</p>
                                            </>
                                          ) : (
                                            <>
                                              <p className="text-xs">{t('modManager.other')}</p>
                                            </>
                                          )}
                                        </div>
                                      </Chip>
                                    ) : undefined}
                                  </div>
                                </div>

                                <div className="flex items-center gap-1">
                                  {project.provider != Provider.OTHER &&
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
                                        setLoading(true)
                                        setLoadingType(LoadingType.INFO)
                                        setProccessKey(index)

                                        // tab1

                                        if (isInstalled) {
                                          project = isInstalled
                                        }

                                        let body: string = ''
                                        let gallery: IProject['gallery'] = []

                                        let versions: ModManagerVersion[] = []
                                        if (project.provider != Provider.LOCAL) {
                                          versions.push(
                                            ...(await api.modManager.getVersions(
                                              project.provider,
                                              project.id,
                                              {
                                                loader:
                                                  projectType == ProjectType.PLUGIN && server
                                                    ? (server.core as unknown as Loader)
                                                    : loader,
                                                version: version ? version.id : undefined,
                                                projectType,
                                                modUrl: project.url
                                              }
                                            ))
                                          )

                                          if (!versions.length && isInstalled?.version) {
                                            versions.push({
                                              dependencies: [],
                                              downloads: -1,
                                              id: isInstalled.version.id,
                                              files: isInstalled.version.files,
                                              name: isInstalled.version.files[0].filename
                                            })
                                          }
                                        } else {
                                          if ('version' in project)
                                            versions.push({
                                              dependencies: [],
                                              downloads: -1,
                                              files: [],
                                              id: project?.version?.id || '',
                                              name: project?.version?.id || ''
                                            })
                                        }

                                        let currentVersion = versions[0]
                                        let currentIndex = 0

                                        if (isInstalled) {
                                          setInstalledProject(isInstalled)

                                          currentIndex = versions.findIndex(
                                            (v) => v.id == isInstalled.version?.id
                                          )

                                          currentIndex = currentIndex == -1 ? 0 : currentIndex
                                          currentVersion = versions[currentIndex]
                                        } else {
                                          const projectInfo = await api.modManager.getProject(
                                            project.provider,
                                            project.id
                                          )

                                          if (projectInfo) {
                                            body = projectInfo.body
                                            gallery = projectInfo.gallery
                                          }
                                        }

                                        if (!currentVersion?.dependencies) {
                                          currentVersion = {
                                            ...currentVersion,
                                            dependencies: []
                                          }
                                        }

                                        if (
                                          !isModpacks &&
                                          currentVersion.dependencies.length > 0 &&
                                          currentVersion.dependencies.filter((d) => d.project)
                                            .length == 0
                                        ) {
                                          const dependensies = await api.modManager.getDependencies(
                                            project.provider,
                                            project.id,
                                            currentVersion.dependencies
                                          )

                                          currentVersion.dependencies = dependensies
                                          versions[currentIndex] = currentVersion
                                        }

                                        setProject({
                                          ...project,
                                          versions: versions,
                                          body,
                                          gallery
                                        })
                                        setSelectVersion(currentVersion)
                                        setIsAvailableUpdate(currentIndex != 0)
                                        setDependency(
                                          isInstalled ? getLocalDependencies(project.title) : []
                                        )

                                        setLoading(false)
                                        setLoadingType(null)
                                        setProccessKey(-1)

                                        setInfoModalOpen(true)
                                      }}
                                    >
                                      {isInstalled ? <Settings size={22} /> : <Info size={22} />}
                                    </Button>
                                  ) : (
                                    project.url && (
                                      <Button
                                        variant="flat"
                                        isIconOnly
                                        onPress={() => {
                                          api.shell.openExternal(project.url)
                                        }}
                                      >
                                        {project.provider == Provider.CURSEFORGE ? (
                                          <SiCurseforge size={22} />
                                        ) : project.provider == Provider.MODRINTH ? (
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
                                            versionPath={selectedVersion.versionPath}
                                          />
                                        )}
                                        <Button
                                          color="danger"
                                          variant="flat"
                                          isIconOnly
                                          isDisabled={isLoading}
                                          onPress={async () => {
                                            let newMods = [...mods]

                                            const index = newMods.findIndex(
                                              (p) => p.id == project.id
                                            )
                                            newMods.splice(index, 1)

                                            setMods([...newMods])
                                            if (project.provider == Provider.LOCAL) {
                                              setBrowser(browser.filter((p) => p.id != project.id))
                                            }

                                            setInstalledProject(null)

                                            addToast({
                                              color: 'success',
                                              title: t('modManager.deleted')
                                            })
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
                        )
                      })}
                    </ScrollShadow>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <Alert title={t('common.notFound')} />
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
                        isDisabled={isLoading && loadingType == LoadingType.SEARCH}
                        page={offset / searchData.limit}
                        total={Math.ceil(searchData.total / searchData.limit)}
                        onChange={async (page) => {
                          setOffset(page * searchData.limit)

                          await search({
                            version,
                            loader,
                            query: searchQuery,
                            provider,
                            projectType,
                            sort,
                            filter,
                            isLocal,
                            offset: (page - 1) * searchData.limit
                          })
                        }}
                      />
                    </div>
                  )}
              </div>
              <Modal
                size={project?.body == '' ? 'md' : '5xl'}
                isDismissable={false}
                isKeyboardDismissDisabled={true}
                isOpen={isInfoModalOpen}
                onClose={() => {
                  if (isLoading) return

                  if (prevProjects.length == 0) {
                    setInfoModalOpen(false)
                    setTimeout(() => {
                      setInstalledProject(null)
                      setProject(null)
                    }, 500)
                  }

                  // tab3

                  const prevProject = prevProjects.pop()
                  if (!prevProject) return

                  const isInstalled = mods.find((p) => p.id == prevProject.id)
                  setInstalledProject(isInstalled || null)
                  setProvider(prevProject.provider)
                  setProject(prevProject)

                  const index = isInstalled
                    ? prevProject.versions.findIndex((v) => v.id == isInstalled.version?.id)
                    : 0

                  setIsAvailableUpdate(index != 0)
                  setSelectVersion(prevProject.versions[index])

                  if (isInstalled) {
                    setDependency(getLocalDependencies(prevProject.title))
                  } else setDependency([])
                }}
              >
                <ModalContent>
                  <ModalHeader>{t('common.installation')}</ModalHeader>

                  <ModalBody>
                    {project ? (
                      <div className="flex space-x-4 justify-between">
                        <div
                          className={`flex flex-col gap-4 min-w-0 ${project.body != '' ? 'w-4/12' : ''}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {project.iconUrl && (
                              <Image
                                src={project.iconUrl || ''}
                                alt={project.title}
                                width={64}
                                height={64}
                                className="min-w-16 min-h-16 rounded-md"
                              />
                            )}
                            <div className="flex flex-col gap-1 min-w-0">
                              <p>{project.title}</p>
                              <Tooltip
                                className="min-w-0"
                                size="sm"
                                delay={500}
                                content={<p className="truncate min-w-0">{project.description}</p>}
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
                                  await api.shell.openExternal(project.url)
                                }}
                              >
                                {t('modManager.goToWebsite')}
                              </Button>
                            )}

                            {settings.lang != 'en' && account?.type != 'plain' && (
                              <Button
                                variant="flat"
                                isIconOnly
                                isLoading={isLoading && loadingType == LoadingType.TRANSLATE}
                                onPress={async () => {
                                  setLoading(true)
                                  setLoadingType(LoadingType.TRANSLATE)

                                  const [translatedDescription, translatedBody] = await Promise.all(
                                    [
                                      project.description
                                        ? await api.backend.aiComplete(
                                            account?.accessToken || '',
                                            `Translate the following text to ${settings.lang}:\n\n${project.description}`
                                          )
                                        : undefined,
                                      project.body
                                        ? await api.backend.aiComplete(
                                            account?.accessToken || '',
                                            `Translate the following text to ${settings.lang}:\n\n${project.body}`
                                          )
                                        : undefined
                                    ]
                                  )

                                  setProject({
                                    ...project,
                                    description: translatedDescription || project.description,
                                    body: translatedBody || project.body
                                  })

                                  setLoading(false)
                                  setLoadingType(null)
                                }}
                              >
                                <Languages size={22} />
                              </Button>
                            )}
                          </div>

                          <div className="flex flex-col gap-2">
                            {selectVersion && selectVersion.id != '' && (
                              <Select
                                size="sm"
                                label={t('versions.version')}
                                className="max-w-80"
                                isDisabled={isLoading || project.provider == Provider.LOCAL}
                                selectedKeys={[selectVersion?.id || '']}
                                startContent={
                                  isAvailableUpdate && (
                                    <Tooltip content={t('modManager.availableUpdate')}>
                                      <CircleAlert
                                        size={20}
                                        className="min-w-5 min-h-5 text-warning"
                                      />
                                    </Tooltip>
                                  )
                                }
                                onChange={async (event) => {
                                  const value = event.target.value
                                  if (!value) return

                                  const index = project.versions.findIndex((v) => v.id == value)

                                  setIsAvailableUpdate(index != 0)

                                  if (index == -1) return
                                  const version = project.versions[index]

                                  if (!version) return

                                  setLoading(true)
                                  setLoadingType(LoadingType.NEW_VERSION)

                                  if (
                                    !isModpacks &&
                                    version.dependencies.length > 0 &&
                                    version.dependencies.filter((d) => d.project).length == 0
                                  ) {
                                    const dependensies = await api.modManager.getDependencies(
                                      project.provider,
                                      project.id,
                                      version.dependencies
                                    )

                                    version.dependencies = dependensies
                                  }

                                  setSelectVersion(version)

                                  setLoading(false)
                                  setLoadingType(null)
                                }}
                              >
                                {project.versions.map((version) => {
                                  return (
                                    <SelectItem textValue={version.name} key={version.id}>
                                      <p>{version.name}</p>
                                    </SelectItem>
                                  )
                                })}
                              </Select>
                            )}
                            <div className="flex items-center gap-2">
                              {!installedProject ? (
                                <Button
                                  variant="flat"
                                  color="success"
                                  startContent={<Download size={22} />}
                                  isLoading={isLoading && loadingType == LoadingType.INSTALL}
                                  isDisabled={
                                    isLoading ||
                                    mods
                                      .filter((m) => m.provider == Provider.LOCAL)
                                      .some((m) =>
                                        m.version?.files.some(
                                          (f) => f.sha1 == selectVersion?.files[0].sha1
                                        )
                                      )
                                  }
                                  onPress={async () => {
                                    if (!selectVersion) return

                                    setLoading(true)
                                    setLoadingType(LoadingType.INSTALL)

                                    if (isModpacks) {
                                      const temp = await api.path.join(paths.launcher, 'temp')

                                      const file = selectVersion.files[0]
                                      if (!file) {
                                        setLoading(false)
                                        setLoadingType(null)
                                        return
                                      }

                                      const filename = file.filename

                                      if (file.url.startsWith('blocked::')) {
                                        setBlockedMods([
                                          {
                                            fileName: filename,
                                            hash: file.sha1,
                                            url: file.url.replace('blocked::', ''),
                                            projectId: project.id
                                          }
                                        ])
                                        setIsBlockedMods(true)

                                        return
                                      }

                                      const modpackPath = await api.path.join(
                                        temp,
                                        await api.path.basename(
                                          filename,
                                          await api.path.extname(filename)
                                        )
                                      )

                                      await api.file.download(
                                        [
                                          {
                                            destination: await api.path.join(temp, filename),
                                            group: 'mods',
                                            url: file.url,
                                            sha1: file.sha1,
                                            size: file.size,
                                            options: {
                                              extract: true,
                                              extractDelete: true,
                                              extractFolder: modpackPath
                                            }
                                          }
                                        ],
                                        settings.downloadLimit
                                      )

                                      const modpack = await api.modManager.checkModpack(
                                        modpackPath,
                                        project,
                                        selectVersion
                                      )
                                      if (!modpack) {
                                        addToast({
                                          color: 'danger',
                                          title: t('modManager.notModpack')
                                        })

                                        setLoading(false)
                                        setLoadingType(null)
                                        return
                                      }

                                      setModpack(modpack)
                                      onClose(modpack)

                                      setLoading(false)
                                      setLoadingType(null)
                                      return
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
                                          sha1: f.sha1
                                        })),
                                        dependencies: selectVersion.dependencies.map((d) => ({
                                          title: d.project?.title || '',
                                          relationType: d.relationType
                                        }))
                                      }
                                    }

                                    setMods([...mods, newProject])
                                    setInstalledProject(newProject)

                                    setDependency(getLocalDependencies(newProject.title))

                                    setLoading(false)
                                    setLoadingType(null)

                                    addToast({
                                      color: 'success',
                                      title: t('modManager.added')
                                    })
                                  }}
                                >
                                  {t('common.install')}
                                </Button>
                              ) : (
                                <>
                                  <Tooltip
                                    isDisabled={dependency.length == 0}
                                    content={
                                      <div className="flex flex-col gap-1 p-1">
                                        {t('modManager.addiction')}
                                        <ScrollShadow className="flex flex-col gap-1 max-h-[180px] pr-1">
                                          {dependency.map((d, i) => (
                                            <Chip
                                              variant="flat"
                                              size="sm"
                                              key={i}
                                              color={
                                                dependencyDisplay(d.relationType).color as
                                                  | 'default'
                                                  | 'warning'
                                                  | 'success'
                                                  | 'danger'
                                                  | 'primary'
                                                  | 'secondary'
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
                                            (d) => d.relationType == DependencyType.REQUIRED
                                          ).length > 0 || isLoading
                                        }
                                        onPress={() => {
                                          let newMods = [...mods]

                                          const index = newMods.findIndex((p) => p.id == project.id)
                                          newMods.splice(index, 1)

                                          setMods([...newMods])
                                          setInstalledProject(null)

                                          addToast({
                                            color: 'success',
                                            title: t('modManager.deleted')
                                          })
                                        }}
                                      >
                                        {t('common.delete')}
                                      </Button>
                                    </div>
                                  </Tooltip>

                                  {project.provider != Provider.LOCAL && (
                                    <Button
                                      variant="flat"
                                      color="primary"
                                      startContent={<CircleArrowDown size={22} />}
                                      isDisabled={
                                        selectVersion?.id == installedProject.version?.id ||
                                        isLoading
                                      }
                                      onPress={() => {
                                        if (!selectVersion) return

                                        let newMods = [...mods]

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
                                              url: f.url,
                                              isServer: f.isServer,
                                              sha1: f.sha1
                                            })),
                                            dependencies: selectVersion.dependencies.map((d) => ({
                                              title: d.project?.title || '',
                                              relationType: d.relationType
                                            }))
                                          }
                                        }

                                        const index = newMods.findIndex((p) => p.id == project.id)
                                        newMods.splice(index, 1, newProject)

                                        setMods([...newMods])
                                        setInstalledProject(newProject)

                                        addToast({
                                          color: 'success',
                                          title: t('modManager.updated')
                                        })
                                      }}
                                    >
                                      {t('common.update')}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>

                          {!isModpacks && project.provider != Provider.LOCAL && (
                            <div className="flex flex-col gap-1.5">
                              <p className="font-bold">{t('modManager.dependencies')}</p>
                              <ScrollShadow className="flex flex-col space-y-2 max-h-[200px] pr-1">
                                {selectVersion?.dependencies &&
                                  selectVersion.dependencies.length > 0 &&
                                  loadingType != LoadingType.NEW_VERSION &&
                                  selectVersion.dependencies.map((d, index) => {
                                    if (!d.project) return

                                    const isInstalled = mods.find(
                                      (p) =>
                                        p.id == d.project?.id ||
                                        p.title.toLowerCase() == d.project?.title.toLowerCase()
                                    )

                                    const dependencyType = dependencyDisplay(d.relationType)
                                    return (
                                      <div
                                        key={index}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <div className="flex items-center space-x-2 min-w-0">
                                          <Image
                                            src={d.project.iconUrl || ''}
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
                                              dependencyType.color as
                                                | 'default'
                                                | 'warning'
                                                | 'success'
                                                | 'danger'
                                                | 'primary'
                                                | 'secondary'
                                                | undefined
                                            }
                                          >
                                            {dependencyType.title}
                                          </Chip>
                                          {d.relationType != DependencyType.INCOMPATIBLE &&
                                          d.relationType != DependencyType.EMBEDDED ? (
                                            <Button
                                              size="sm"
                                              variant="flat"
                                              isIconOnly
                                              isDisabled={isLoading}
                                              isLoading={
                                                isLoading &&
                                                loadingType == LoadingType.DEPENDENCY &&
                                                proccessKey == index
                                              }
                                              onPress={async () => {
                                                let newProject = d.project
                                                // tab2
                                                if (!newProject || !version) return

                                                setLoading(true)
                                                setLoadingType(LoadingType.DEPENDENCY)
                                                setProccessKey(index)

                                                if (isInstalled) {
                                                  newProject = {
                                                    ...isInstalled,
                                                    versions: [],
                                                    body: '',
                                                    gallery: []
                                                  }
                                                }

                                                const versions = await api.modManager.getVersions(
                                                  newProject.provider,
                                                  newProject.id,
                                                  {
                                                    loader:
                                                      projectType == ProjectType.PLUGIN && server
                                                        ? (server.core as unknown as Loader)
                                                        : loader || 'vanilla',
                                                    version: version.id,
                                                    projectType: newProject.projectType,
                                                    modUrl: newProject.url
                                                  }
                                                )

                                                if (!versions.length) {
                                                  setLoading(false)
                                                  setLoadingType(null)
                                                  setProccessKey(-1)
                                                  addToast({
                                                    color: 'danger',
                                                    title: t('modManager.notFoundMod')
                                                  })

                                                  return
                                                }

                                                let currentVersion = versions[0]
                                                let currentIndex = 0

                                                let body = ''
                                                let gallery: IProject['gallery'] = []

                                                if (isInstalled) {
                                                  currentIndex = versions.findIndex(
                                                    (v) => v.id == isInstalled.version?.id
                                                  )

                                                  currentVersion = versions[currentIndex]
                                                } else {
                                                  const projectInfo =
                                                    await api.modManager.getProject(
                                                      newProject.provider,
                                                      newProject.id
                                                    )
                                                  if (projectInfo) {
                                                    body = projectInfo.body
                                                    gallery = projectInfo.gallery
                                                  }
                                                }

                                                if (currentVersion.dependencies.length > 0) {
                                                  const dependensies =
                                                    await api.modManager.getDependencies(
                                                      newProject.provider,
                                                      newProject.id,
                                                      currentVersion.dependencies
                                                    )

                                                  currentVersion.dependencies = dependensies
                                                  versions[currentIndex] = currentVersion
                                                }

                                                setInstalledProject(
                                                  isInstalled ? isInstalled : null
                                                )
                                                setIsAvailableUpdate(currentIndex != 0)

                                                setProvider(newProject.provider)
                                                setInstalledProject(
                                                  isInstalled ? isInstalled : null
                                                )

                                                setSelectVersion(currentVersion)
                                                setDependency(
                                                  isInstalled
                                                    ? getLocalDependencies(newProject.title)
                                                    : []
                                                )
                                                setProject({
                                                  ...newProject,
                                                  versions: versions,
                                                  body,
                                                  gallery
                                                })
                                                setPrevProjects((prev) => [...prev, project])

                                                setLoading(false)
                                                setLoadingType(null)
                                                setProccessKey(-1)

                                                setInfoModalOpen(true)
                                              }}
                                            >
                                              {isInstalled ? (
                                                <Settings size={22} />
                                              ) : (
                                                <Download size={22} />
                                              )}
                                            </Button>
                                          ) : undefined}
                                        </div>
                                      </div>
                                    )
                                  })}

                                {!isModpacks &&
                                  selectVersion?.dependencies.length == 0 &&
                                  loadingType != LoadingType.NEW_VERSION && (
                                    <div>
                                      <Alert title={t('modManager.noDependencies')} />
                                    </div>
                                  )}

                                {isLoading && loadingType == LoadingType.NEW_VERSION && (
                                  <div className="flex justify-center gap-2 items-center">
                                    <Spinner size="sm" />
                                  </div>
                                )}
                              </ScrollShadow>
                            </div>
                          )}
                        </div>
                        {project.body != '' && (
                          <div className="flex flex-col w-8/12 space-y-2 h-full">
                            <ScrollShadow
                              className={`${project.gallery.length > 0 ? 'max-h-[355px]' : 'max-h-[435px]'} pr-1`}
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
      {isBlockedMods && blockedMods.length && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (bMods) => {
            setBlockedMods(bMods)
            setIsBlockedMods(false)

            const mod = bMods[0]
            if (!mod || !mod.filePath || !project || !selectVersion) {
              setLoading(false)
              setLoadingType(null)
              return
            }

            const temp = await api.path.join(paths.launcher, 'temp')

            const modpackPath = await api.path.join(
              temp,
              await api.path.basename(mod.fileName, await api.path.extname(mod.fileName))
            )

            await api.fs.extractZip(mod.filePath, modpackPath)

            const modpack = await api.modManager.checkModpack(modpackPath, project, selectVersion)
            if (!modpack) {
              addToast({
                color: 'danger',
                title: t('modManager.notModpack')
              })

              setLoading(false)
              setLoadingType(null)
              return
            }

            setModpack(modpack)
            onClose(modpack)

            setLoading(false)
            setLoadingType(null)
          }}
        />
      )}
      {isOpenALPInfo && addingLocalProjects.length > 0 && (
        <ALPModal
          projects={addingLocalProjects}
          onClose={() => {
            setIsOpenALPInfo(false)
            setAddingLocalProjects([])
          }}
          addProjects={(projects: IProject[]) => {
            const localProjects: ILocalProject[] = []

            projects.forEach((project) => {
              const newProject: ILocalProject = {
                title: project.title,
                description: project.description,
                projectType: project.projectType,
                iconUrl: project.iconUrl,
                url: project.url,
                provider: project.provider,
                id: project.id,
                version: {
                  id: project.versions[0].id,
                  files: project.versions[0].files.map((f) => ({
                    filename: f.filename,
                    size: f.size,
                    isServer: f.isServer,
                    url: f.url,
                    sha1: f.sha1
                  })),
                  dependencies: project.versions[0].dependencies.map((d) => ({
                    title: d.project?.title || '',
                    relationType: d.relationType
                  }))
                }
              }

              localProjects.push(newProject)
            })

            setMods([...mods, ...localProjects])
            addToast({
              color: 'success',
              title: t('modManager.addedMultiple', { count: projects.length })
            })
          }}
        />
      )}
    </>
  )
}
