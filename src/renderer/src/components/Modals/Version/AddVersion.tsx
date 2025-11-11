import {
  accountAtom,
  authDataAtom,
  backendServiceAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  pathsAtom,
  settingsAtom,
  versionsAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import {
  CircleAlert,
  HardDriveDownload,
  ImagePlus,
  PackageSearch,
  Server,
  SquareTerminal,
  File
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IProgress } from '../../Versions'
import { loaders, Loaders } from '../../Loaders'
import { SiCurseforge, SiModrinth } from 'react-icons/si'
import { IArguments } from '@/types/IArguments'
import { ILocalProject } from '@/types/ModManager'
import { Servers } from '@renderer/components/ServerList/Servers'
import { ImageCropper } from '@renderer/components/ImageCropper'
import { Arguments } from '@renderer/components/Arguments'
import { ModManager } from '@renderer/components/ModManager/ModManager'
import { IModpack } from '@/types/Backend'
import {
  addToast,
  Button,
  Checkbox,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Progress,
  Select,
  SelectItem,
  Spinner,
  Image,
  Tabs,
  Tab
} from '@heroui/react'
import { IModpack as IImportModpack } from '@/types/ModManager'
import { IModpackFile, IVersion, IVersionConf } from '@/types/IVersion'
import { BlockedMods, checkBlockedMods, IBlockedMod } from '../BlockedMods'

import axios from 'axios'
import { Loader } from '@/types/Loader'
import { IServer } from '@/types/ServersList'
import { LoaderVersion } from '@/types/VersionsService'
import { VersionsService } from '@renderer/services/Versions'
import { writeNBT } from '@renderer/utilities/Nbt'
import { Version } from '@renderer/game/Version'
import { Mods } from '@renderer/game/Mods'
import { checkVersionName, importVersion } from '@renderer/utilities/Versions'

const { api } = window
const fs = api.fs
const path = api.path
const electron = window.electron
const rimraf = api.rimraf
const fromBuffer = api.fromBuffer

export function AddVersion({
  closeModal,
  modpack,
  successCallback
}: {
  closeModal: () => void
  modpack?: IModpack
  successCallback?: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<
    'install' | 'search' | 'versions' | 'loaders' | 'file'
  >()
  const [versionName, setVersionName] = useState('')
  const [versions, setVersions] = useAtom(versionsAtom)
  const { t } = useTranslation()
  const [image, setImage] = useState('')
  const [croppedImage, setCroppedImage] = useState('')
  const [isCropping, setIsCropping] = useState(false)
  const [loader, setLoader] = useState<Loader>()
  const [selectVersions, setSelectVersions] = useState<IVersion[]>([])
  const [selectVersion, setSelectVersion] = useState<IVersion>()
  const [isDownloadedVersion, setIsDownloadedVersion] = useAtom(isDownloadedVersionAtom)
  const [viewSnapshots, setViewSnapshots] = useState(false)
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([])
  const [loaderVersion, setLoaderVersion] = useState<LoaderVersion>()
  const [paths] = useAtom(pathsAtom)
  const [isModManager, setIsModManager] = useState(false)
  const [isServers, setIsServers] = useState(false)
  const [runArguments, setRunArguments] = useState<IArguments>({
    game: '',
    jvm: ''
  })
  const [isOpenArguments, setIsOpenArguments] = useState(false)
  const [progress, setProgress] = useState<IProgress>({ value: 0, title: '' })
  const [account] = useAtom(accountAtom)
  const [mods, setMods] = useState<ILocalProject[]>([])
  const [servers, setServers] = useState<IServer[]>([])
  const [options, setOptions] = useState('')
  const [shareCode, setShareCode] = useState<string>()
  const [shareVersion, setShareVersion] = useState<IVersionConf>()
  const [isValidVersionName, setIsValidVersionName] = useState(false)
  const [isOwnerVersion, setIsOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [settings] = useAtom(settingsAtom)
  const [selectedTab, setSelectedTab] = useState<
    'manually' | 'fromServer' | 'fromFile' | 'modpacks'
  >('manually')
  const [searchCode, setSearchCode] = useState('')
  const [importData, setImportData] = useState<IModpackFile | undefined>()
  const [importModpack, setImportModpack] = useState<IImportModpack | undefined>()
  const [quickConnectIp, setQuickConnectIp] = useState('')
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([])
  const [isBlockedMods, setIsBlockedMods] = useState(false)
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)

  useEffect(() => {
    setSelectVersion(undefined)
    setIsDownloadedVersion(false)
    setIsOwnerVersion(true)
    setLoader('vanilla')

    electron.ipcRenderer.on('download-progress', (_, { progress, group }) => {
      const progressValue = Number(progress)

      if (isNaN(progressValue)) return
      if (Math.abs(progress.value - progressValue) < 1) return

      setProgress({
        value: progressValue,
        title: `${t('game.download')} "${group}"...`
      })
    })
    ;(async () => {
      if (modpack) {
        setSelectedTab('fromServer')
        searchVersion(modpack)
      }
    })()

    return () => {
      electron.ipcRenderer.removeAllListeners('download-progress')
    }
  }, [])

  useEffect(() => {
    if (!importModpack) return

    setVersionName(importModpack.name)
    setSelectVersion(selectVersions.find((v) => v.id == importModpack.version))
    setLoader(importModpack.loader)
    setImage(importModpack.image || '')
    setMods(importModpack.mods)
    setIsDownloadedVersion(true)
  }, [importModpack])

  useEffect(() => {
    if (modpack || selectedTab != 'manually') return
    ;(async () => {
      setIsLoading(true)
      setLoadingType('versions')

      const data = await VersionsService.getVersions(loader || 'vanilla', viewSnapshots)
      setSelectVersion(data[0])
      setSelectVersions(data)

      if (loader == 'vanilla') {
        setIsLoading(false)
        setLoadingType(undefined)

        setVersionName(getVersionName('vanilla', data[0].id))
      }
    })()
  }, [loader, viewSnapshots])

  useEffect(() => {
    if (
      modpack ||
      selectedTab == 'fromFile' ||
      selectedTab == 'fromServer' ||
      (selectedTab == 'modpacks' && !importModpack)
    )
      return

    if (!selectVersion) return

    if (selectedTab != 'modpacks' && !importModpack)
      setVersionName(getVersionName(loader || 'vanilla', selectVersion.id))

    if (loader == 'vanilla') return
    ;(async () => {
      setIsLoading(true)
      setLoadingType('loaders')

      const data = await VersionsService.getLoaderVersions(loader || 'vanilla', selectVersion)

      setLoaderVersion(data[0])
      setLoaderVersions(data)

      setIsLoading(false)
      setLoadingType(undefined)
    })()
  }, [selectVersion])

  useEffect(() => {
    if (!versionName) {
      setIsValidVersionName(false)
      return
    }

    const result = checkVersionName(versionName, versions, undefined, isDownloadedVersion)
    setIsValidVersionName(result)
  }, [versionName])

  async function addVersion() {
    if (!account || !selectVersion || !loader || (loader != 'vanilla' && !loaderVersion)) return

    const newVersionPath = path.join(paths.minecraft, 'versions', versionName.trim())

    await fs.mkdir(newVersionPath, {
      recursive: true
    })

    let newImage: string = image || ''
    if (image && selectedTab != 'fromServer') {
      const filename = 'logo.png'
      try {
        const filePath = path.join(newVersionPath, filename)

        if (image.startsWith('file://')) {
          const file = image.replace('file://', '')
          await fs.copyFile(file, filePath)
          newImage = `file://${filePath}?t=${new Date().getTime()}`
        } else {
          const response = await axios.get(image, {
            responseType: 'arraybuffer'
          })

          const buffer = fromBuffer(response.data)
          await fs.writeFile(filePath, buffer, 'binary')
        }
      } catch {}
    }

    const tmpVersion: Partial<IVersionConf> = shareVersion
      ? { ...shareVersion }
      : importData
        ? { ...importData.conf }
        : {}

    const newVersionConf: IVersionConf = {
      ...tmpVersion,
      name: versionName.trim(),
      version: {
        ...selectVersion
      },
      lastLaunch: new Date(),
      downloadedVersion: shareVersion
        ? isOwnerVersion
          ? !!versions.find((v) => v.version.shareCode == shareVersion.shareCode)
          : true
        : false,
      shareCode,
      lastUpdate: new Date(),
      build: 0,
      runArguments: runArguments,
      image: newImage,
      loader: {
        name: loader,
        mods,
        version: loaderVersion,
        other: tmpVersion.loader?.other || undefined
      },
      owner: `${account.type}_${account.nickname}`
    }

    setIsLoading(true)
    setLoadingType('install')

    if (selectedTab == 'fromServer' || selectedTab == 'manually') {
      if (servers.length > 0) {
        const serversPath = path.join(newVersionPath, 'servers.dat')
        await writeNBT(servers, serversPath)
      }

      if (options != '') {
        const optionsPath = path.join(newVersionPath, 'options.txt')
        await fs.writeFile(optionsPath, options, 'utf-8')
      }

      if (shareCode) await backendService.modpackDownloaded(shareCode)
    }

    if (importData) {
      await fs.copy(importData.path, newVersionPath, { overwrite: true })
      await rimraf(importData.path)
    } else if (importModpack) {
      await fs.copy(path.join(importModpack.folderPath, 'overrides'), newVersionPath, {
        overwrite: true
      })
      await rimraf(importModpack.folderPath)
    }

    const newVersion = new Version(settings, newVersionConf)
    await newVersion.init()
    await newVersion.install(account)
    await newVersion.save()

    if (selectedTab != 'fromFile') {
      for (const bMod of blockedMods) {
        if (!bMod.filePath) continue

        const mod = mods.find((m) => m.id == bMod.projectId)
        if (!mod || !mod.version) continue

        mod.version.files[0].localPath = bMod.filePath
      }

      const versionMods = new Mods(settings.downloadLimit, newVersion)
      await versionMods.check()

      if (newVersion.version.loader.other?.url) await versionMods.downloadOther()
      setBlockedMods([])
    }

    setVersions([...versions, newVersion])

    successCallback?.()
    closeModal()
    addToast({
      color: 'success',
      title: t('versions.added')
    })
  }

  async function searchVersion(modpack: IModpack) {
    if (!account) return

    setVersionName(modpack.conf.name)
    setShareCode(modpack._id)
    setRunArguments(modpack.conf.runArguments)
    setImage(modpack.conf.image)
    setMods(modpack.conf.loader.mods)
    setServers(modpack.conf.servers)
    setOptions(modpack.conf.options)
    setSelectVersion(modpack.conf.version)
    setLoader(modpack.conf.loader.name)
    setLoaderVersion(modpack.conf.loader.version)
    setQuickConnectIp(modpack.conf.quickServer || '')
    setIsDownloadedVersion(true)
    setIsOwnerVersion(authData?.sub == modpack.owner)

    setShareVersion({
      ...modpack.conf,
      build: modpack.build,
      downloadedVersion: true,
      lastLaunch: new Date(),
      lastUpdate: new Date(),
      owner: authData?.sub,
      shareCode: modpack._id
    })
  }

  function getVersionName(loader: Loader, version: string) {
    return `${loaders[loader].name} ${version}`
  }

  return (
    <>
      <Modal
        size="lg"
        isOpen
        onClose={async () => {
          if (isLoading) return
          closeModal()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('versions.addingVersion')}</ModalHeader>
          <ModalBody>
            <Tabs
              className="mx-auto"
              isDisabled={isLoading || !!modpack}
              selectedKey={selectedTab}
              onSelectionChange={(key) => {
                setSelectedTab(key as 'manually' | 'fromServer' | 'fromFile' | 'modpacks')
                setShareVersion(undefined)
                setVersionName('')
                setShareCode('')
                setRunArguments({ game: '', jvm: '' })
                setImage('')
                setMods([])
                setServers([])
                setOptions('')
                setSelectVersion(selectVersions[0])
                setLoader('vanilla')
                setLoaderVersion(undefined)
                setIsDownloadedVersion(false)
                setIsOwnerVersion(true)
                setSearchCode('')
                setImportData(undefined)
                setImportModpack(undefined)

                if (key == 'modpacks') {
                  setSelectVersion(undefined)
                  setLoader(undefined)
                  setIsModManager(true)
                } else if (key == 'manually') {
                  setVersionName(getVersionName('vanilla', selectVersions[0]?.id || ''))
                }
              }}
            >
              <Tab key="manually" title={t('addVersion.tabs.manually')}></Tab>
              <Tab key="modpacks" title={t('addVersion.tabs.modpacks')}></Tab>
              <Tab key="fromServer" title={t('addVersion.tabs.fromServer')}></Tab>
              <Tab key="fromFile" title={t('addVersion.tabs.fromFile')}></Tab>
            </Tabs>
            <div className={`flex flex-col gap-4`}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {(selectedTab == 'manually' || shareVersion || importData || importModpack) && (
                    <>
                      {image && (
                        <Image
                          onClick={async () => {
                            if (image) {
                              setImage('')
                              return
                            }
                          }}
                          src={image}
                          width={64}
                          height={64}
                          className="min-w-16 min-h-16 cursor-pointer"
                        />
                      )}
                      {!image &&
                        (!isDownloadedVersion ||
                          (selectedTab != 'manually' && selectedTab != 'fromServer')) && (
                          <Button
                            variant="flat"
                            isIconOnly
                            isDisabled={isLoading}
                            onPress={async () => {
                              const filePaths =
                                await window.electron.ipcRenderer.invoke('openFileDialog')

                              if (!filePaths.length) return
                              setCroppedImage(filePaths[0])
                              setIsCropping(true)
                            }}
                          >
                            <ImagePlus size={22} />
                          </Button>
                        )}
                    </>
                  )}
                  {(selectedTab == 'manually' ||
                    selectedTab == 'fromServer' ||
                    importData ||
                    importModpack) && (
                    <Input
                      label={
                        <>
                          {(selectedTab == 'manually' ||
                            shareVersion ||
                            importData ||
                            importModpack) && <p>{t('versions.name')}</p>}
                          {selectedTab == 'fromServer' && !shareVersion && (
                            <p>{t('addVersion.fromServer.shareCode')}</p>
                          )}
                        </>
                      }
                      startContent={
                        selectedTab == 'manually' || shareVersion || importData || importModpack ? (
                          !isValidVersionName ? (
                            <CircleAlert size={22} className="text-warning" />
                          ) : (
                            ''
                          )
                        ) : (
                          ''
                        )
                      }
                      placeholder={
                        selectedTab == 'manually' || shareVersion || importData || importModpack
                          ? t('versions.namePlaceholder')
                          : ''
                      }
                      value={
                        selectedTab == 'manually' || shareVersion || importData || importModpack
                          ? versionName
                          : searchCode
                      }
                      onChange={(event) => {
                        const value = event.target.value

                        if (
                          selectedTab == 'manually' ||
                          shareVersion ||
                          importData ||
                          importModpack
                        ) {
                          setVersionName(value)
                        } else if (selectedTab == 'fromServer') {
                          setSearchCode(value)
                        }
                      }}
                      isDisabled={isLoading}
                    />
                  )}
                </div>
                {(selectedTab == 'manually' || shareVersion || importData || importModpack) && (
                  <>
                    <div className="m-auto">
                      <Loaders
                        isDisabled={isDownloadedVersion}
                        select={(loader) => setLoader(loader)}
                        isLoading={isLoading}
                        loader={loader || 'vanilla'}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        label={t('versions.version')}
                        isDisabled={isLoading || selectVersions.length == 0 || isDownloadedVersion}
                        onChange={(event) => {
                          const value = event.target.value
                          if (!value) return
                          const version = selectVersions.find((v) => v.id == value)
                          if (version) setSelectVersion(version)
                        }}
                        startContent={
                          isLoading && loadingType == 'versions' ? <Spinner size="sm" /> : ''
                        }
                        selectedKeys={[selectVersion?.id || '']}
                      >
                        <>
                          {selectVersions.map((v) => {
                            return <SelectItem key={v.id}>{v.id}</SelectItem>
                          })}
                          {!selectVersions.length && selectVersion?.id && (
                            <SelectItem key={selectVersion.id}>{selectVersion.id}</SelectItem>
                          )}
                        </>
                      </Select>

                      {loader == 'vanilla' &&
                      selectVersions.length != 0 &&
                      !isDownloadedVersion &&
                      loadingType != 'install' ? (
                        <Checkbox
                          isSelected={viewSnapshots}
                          isDisabled={isLoading}
                          onChange={() => {
                            setViewSnapshots((prev) => !prev)
                          }}
                        >
                          {t('versions.snapshots')}
                        </Checkbox>
                      ) : undefined}
                    </div>
                    {loader && loader != 'vanilla' && (
                      <div className="flex items-center gap-2">
                        <Select
                          label={t('versions.loaderVersion')}
                          isDisabled={isLoading || isDownloadedVersion}
                          startContent={
                            isLoading && (loadingType == 'loaders' || loadingType == 'versions') ? (
                              <Spinner size="sm" />
                            ) : (
                              ''
                            )
                          }
                          onChange={(event) => {
                            const value = event.target.value
                            if (!value) return

                            const version = loaderVersions.find((v) => v.id == value)
                            if (version) setLoaderVersion(version)
                          }}
                          selectedKeys={[loaderVersion?.id || '']}
                        >
                          <>
                            {loaderVersions.map((v) => (
                              <SelectItem key={v.id}>{v.id}</SelectItem>
                            ))}
                            {!loaderVersions.length && loaderVersion?.id && (
                              <SelectItem key={loaderVersion.id}>{loaderVersion.id}</SelectItem>
                            )}
                          </>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>

              {selectedTab == 'fromFile' && !importData && (
                <Button
                  variant="flat"
                  color="primary"
                  startContent={<File size={22} />}
                  isLoading={isLoading && loadingType == 'file'}
                  onPress={async () => {
                    try {
                      setIsLoading(true)
                      setLoadingType('file')

                      const filePaths = await window.electron.ipcRenderer.invoke(
                        'openFileDialog',
                        false,
                        [
                          {
                            name: 'Modpack',
                            extensions: ['zip', 'mrpack']
                          }
                        ]
                      )

                      if (!filePaths.length) {
                        setIsLoading(false)
                        setLoadingType(undefined)
                        return
                      }

                      const data = await importVersion(
                        filePaths[0],
                        path.join(paths.launcher, 'temp')
                      )

                      const { type, gl, other } = data

                      if (type == 'gl' && gl) {
                        const { conf, servers, options } = gl
                        setVersionName(conf.name)
                        setShareCode(conf.shareCode)
                        setRunArguments(conf.runArguments || { game: '', jvm: '' })
                        setImage(conf.image)
                        setMods(conf.loader.mods)
                        setServers(servers)
                        setOptions(options)
                        setSelectVersion(conf.version)
                        setLoader(conf.loader.name)
                        setLoaderVersion(conf.loader.version)
                        setQuickConnectIp(conf.quickServer || '')
                        setIsDownloadedVersion(true)
                        setIsOwnerVersion(true)

                        setImportData({ ...gl })
                      } else if (type == 'other' && other) {
                        setSelectedTab('modpacks')
                        setImportModpack(other)
                      }
                    } catch {
                      setImportData(undefined)
                      addToast({ color: 'danger', title: t('addVersion.fromFile.error') })
                    } finally {
                      setIsLoading(false)
                      setLoadingType(undefined)
                    }
                  }}
                >
                  {t('common.choose')}
                </Button>
              )}

              {!(isLoading && loadingType == 'install') &&
                selectedTab == 'fromServer' &&
                !shareVersion &&
                selectedTab == 'fromServer' && (
                  <Button
                    variant="flat"
                    color="primary"
                    isLoading={isLoading && loadingType == 'search'}
                    isDisabled={searchCode.trim() == '' || isLoading}
                    onPress={async () => {
                      setIsLoading(true)
                      setLoadingType('search')

                      const modpackData = await backendService.getModpack(searchCode.trim())
                      if (modpackData.data) await searchVersion(modpackData.data)
                      else addToast({ color: 'danger', title: t('addVersion.fromServer.notFound') })

                      setIsLoading(false)
                      setLoadingType(undefined)
                    }}
                    startContent={<PackageSearch size={22} />}
                  >
                    {t('addVersion.fromServer.find')}
                  </Button>
                )}

              {(selectedTab == 'manually' || shareVersion || importData || importModpack) && (
                <div className="flex flex-col gap-2 w-full">
                  {loadingType != 'install' && mods.length > 0 && (
                    <Button
                      variant="flat"
                      isDisabled={!selectVersion || isLoading}
                      startContent={
                        <div className="flex items-center gap-1">
                          <SiCurseforge size={22} />
                          <SiModrinth size={22} />
                        </div>
                      }
                      onPress={() => {
                        setIsModManager((prev) => !prev)
                      }}
                    >
                      {t('modManager.title')}
                    </Button>
                  )}

                  {loadingType != 'install' &&
                  servers.length > 0 &&
                  selectVersion?.serverManager ? (
                    <Button
                      variant="flat"
                      startContent={<Server size={22} />}
                      onPress={() => {
                        setIsServers(true)
                      }}
                    >
                      {t('versions.servers')}
                    </Button>
                  ) : (
                    ''
                  )}

                  {loadingType != 'install' &&
                    runArguments.game != '' &&
                    runArguments.jvm != '' && (
                      <Button
                        variant="flat"
                        startContent={<SquareTerminal size={22} />}
                        onPress={() => {
                          setIsOpenArguments(true)
                        }}
                      >
                        {t('arguments.title')}
                      </Button>
                    )}

                  {loadingType != 'install' && (
                    <Button
                      variant="flat"
                      color="success"
                      startContent={<HardDriveDownload size={22} />}
                      onPress={async () => {
                        if (selectedTab != 'fromFile' && mods.length > 0) {
                          const blockedMods: IBlockedMod[] = await checkBlockedMods(mods)

                          if (blockedMods.length > 0) {
                            setBlockedMods(blockedMods)
                            setIsBlockedMods(true)
                            return
                          }
                        }

                        addVersion()
                      }}
                      isDisabled={
                        isLoading ||
                        !(
                          selectVersion &&
                          loader &&
                          (loader != 'vanilla' ? loaderVersion : true)
                        ) ||
                        !isValidVersionName
                      }
                    >
                      {t('common.install')}
                    </Button>
                  )}

                  {isLoading && loadingType == 'install' && (
                    <div className="flex flex-col space-y-2">
                      <p>{t('common.installation')}</p>
                      <Progress
                        size="sm"
                        color="success"
                        isIndeterminate={!(progress.value < 100)}
                        value={progress.value < 100 ? progress.value : undefined}
                      />
                      <p className="text-xs">{progress.title || '...'}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isOpenArguments && (
        <Arguments
          runArguments={runArguments}
          onClose={() => setIsOpenArguments(false)}
          setArguments={(args) => setRunArguments(args)}
        />
      )}
      {isCropping && (
        <ImageCropper
          onClose={() => {
            setIsCropping(false)
            setCroppedImage('')
          }}
          title={t('common.editingLogo')}
          image={croppedImage}
          size={{ width: 256, height: 256 }}
          changeImage={async (url: string) => setImage(url)}
        />
      )}
      {isModManager && (
        <ModManager
          mods={mods}
          setMods={(mods) => setMods(mods)}
          onClose={(modpack) => {
            setIsModManager(false)

            if (!modpack && !importModpack && selectedTab == 'modpacks') {
              setSelectVersion(selectVersions[0])
              setLoader('vanilla')
              setSelectedTab('manually')
            }
          }}
          loader={loader}
          version={selectVersion}
          versionPath={path.join(paths.minecraft, 'versions', versionName)}
          isModpacks={selectedTab == 'modpacks' && !importModpack}
          setLoader={(loader) => setLoader(loader)}
          setVersion={(setVersion) => setSelectVersion(setVersion)}
          setModpack={(setModpack) => setImportModpack(setModpack)}
        />
      )}
      {isServers && (
        <Servers
          isAdding
          servers={servers}
          setServers={setServers}
          closeModal={() => setIsServers(false)}
          quickConnectIp={quickConnectIp}
          setQuickConnectIp={(ip) => setQuickConnectIp(ip)}
        />
      )}

      {isBlockedMods && blockedMods.length && (
        <BlockedMods
          mods={blockedMods}
          onClose={(bMods) => {
            setBlockedMods(bMods)
            setIsBlockedMods(false)
            addVersion()
          }}
        />
      )}
    </>
  )
}
