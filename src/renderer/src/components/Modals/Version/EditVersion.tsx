import { Servers } from '@renderer/components/ServerList/Servers'
import { ILocalProject } from '@/types/ModManager'
import {
  accountAtom,
  authDataAtom,
  backendServiceAtom,
  consolesAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom,
  versionServersAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { IArguments } from '@/types/IArguments'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleAlert,
  CopyCheck,
  CopySlash,
  Cpu,
  Earth,
  Folder,
  FolderArchive,
  Gamepad2,
  ImageMinus,
  ImagePlus,
  Pencil,
  Save,
  ScanLine,
  Server,
  ServerCog,
  Share,
  Share2,
  SquareTerminal,
  Trash,
  X
} from 'lucide-react'
import { loaders } from '@renderer/components/Loaders'
import { SiCurseforge, SiModrinth } from 'react-icons/si'
import { VersionDiffence } from '@renderer/components/Versions'
import { IServerOption } from '@/types/Server'
import { IModpack } from '@/types/Backend'
import { Share as ShareModal } from '@renderer/components/Modals/Version/Share/Share'
import { CreateServer } from '../../ServerControl/Create'
import { Export } from '@renderer/components/Export'
import { ImageCropper } from '@renderer/components/ImageCropper'
import { ModManager } from '@renderer/components/ModManager/ModManager'
import { Arguments } from '@renderer/components/Arguments'
import { Confirmation } from '../Confirmation'
import { ServerControl } from '@renderer/components/ServerControl/Control'
import { DeleteVersion } from './DeleteVersion'
import {
  addToast,
  Button,
  ButtonGroup,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Image,
  Tooltip,
  Chip
} from '@heroui/react'
import { BlockedMods, checkBlockedMods, IBlockedMod } from '../BlockedMods'
import { IServer } from '@/types/ServersList'
import { compareServers } from '@renderer/utilities/ServerList'
import { checkDiffenceUpdateData, checkVersionName, syncShare } from '@renderer/utilities/Versions'
import { compareMods } from '@renderer/utilities/ModManager'
import { Mods } from '@renderer/game/Mods'
import { writeNBT } from '@renderer/utilities/Nbt'
import { Server as ServerService } from '@renderer/services/Server'
import { Worlds } from '@renderer/components/Worlds/WorldsModal'
import { RunGameParams } from '@renderer/App'

const api = window.api
const fs = api.fs
const path = api.path
const rimraf = api.rimraf
const { clipboard, shell } = api

export function EditVersion({
  closeModal,
  vd,
  runGame
}: {
  closeModal: () => void
  vd?: VersionDiffence
  runGame: (params: RunGameParams) => Promise<void>
}) {
  const [account] = useAtom(accountAtom)
  const [version, setVersion] = useAtom(selectedVersionAtom)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<
    'save' | 'check_diff' | 'sync' | 'server' | 'check'
  >()
  const [notSavedModal, setNotSavedModal] = useState(false)
  const [servers, setServers] = useState<IServer[]>([])
  const [nbtServers, setNbtServers] = useAtom(versionServersAtom)
  const [versionName, setVersionName] = useState('')
  const [versions] = useAtom(versionsAtom)
  const [mods, setMods] = useState<ILocalProject[]>([])
  const [runArguments, setRunArguments] = useState<IArguments>({
    game: '',
    jvm: ''
  })
  const [image, setImage] = useState('')
  const [editName, setEditName] = useState(false)
  const [isCropping, setIsCropping] = useState(false)
  const [croppedImage, setCroppedImage] = useState('')
  const [isServers, setIsServers] = useState(false)
  const [isModManager, setIsModManager] = useState(false)
  const [isNetwork] = useAtom(networkAtom)
  const [isOpenArguments, setIsOpenArguments] = useState(false)
  const [paths] = useAtom(pathsAtom)
  const [isOpenDel, setIsOpenDel] = useState(false)
  const [settings] = useAtom(settingsAtom)
  const [server, setServer] = useAtom(serverAtom)
  const [isOpenShareModal, setIsOpenModalShare] = useState(false)
  const [shareType, setShareType] = useState<'new' | 'update'>('new')
  const [isShareModal, setShareModal] = useState(false)
  const [versionDiffence, setVersionDiffence] = useState<'sync' | 'new' | 'old'>('sync')
  const [diffenceUpdateData, setDiffenceUpdateData] = useState<string>('')
  const [tempModpack, setTempModpack] = useState<IModpack>()
  const [isOpenExportModal, setIsOpenExportModal] = useState(false)
  const [isServerManager, setIsServerManager] = useState(false)
  const [serverCores, setServerCores] = useState<IServerOption[]>([])
  const [isServerCreate, setIsServerCreate] = useState(false)
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom)
  const { t } = useTranslation()
  const [isLogoChanged, setIsLogoChanged] = useState(false)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [quickConnectIp, setQuickConnectIp] = useState<string>()
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>([])
  const [isBlockedMods, setIsBlockedMods] = useState(false)
  const [blockedCloseType, setBlockedCloseType] = useState<'save' | 'check'>()
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)
  const setConsoles = useAtom(consolesAtom)[1]
  const [isOpenWorlds, setIsOpenWorlds] = useState(false)

  const isExistSaves = useMemo(() => {
    if (!version) return false

    const worldsPath = path.join(version.versionPath, 'saves')
    return fs.pathExistsSync(worldsPath)
  }, [version])

  useEffect(() => {
    ;(async () => {
      if (!version) return

      setImage(version.version.image)
      setVersionName(version.version.name)
      setMods(version.version.loader.mods || [])
      setRunArguments(version.version.runArguments || { game: '', jvm: '' })
      setServers(version.version.version.serverManager ? nbtServers : [])
      setQuickConnectIp(version.version.quickServer)

      vd && setVersionDiffence(vd)
    })()
  }, [])

  function saveBtnisDisabled(): boolean {
    let s = false

    if (version && version.version.version.serverManager) {
      try {
        s = !compareServers(nbtServers, servers)
      } catch {}
    }

    return (
      (((versionName.trim() != version?.version.name &&
        checkVersionName(versionName, versions, version?.version)) ||
        !compareMods(version?.version.loader.mods || [], mods) ||
        s) &&
        !isLoading) ||
      runArguments.game != (version?.version.runArguments?.game || '') ||
      runArguments.jvm != (version?.version.runArguments?.jvm || '') ||
      isLogoChanged ||
      version?.version.quickServer != quickConnectIp
    )
  }

  async function sync() {
    if (!version) return

    await syncShare(version, servers, settings.downloadLimit)

    setLoadingType(undefined)
    setIsLoading(false)

    addToast({
      color: 'success',
      title: t('versions.updated')
    })

    closeModal()
  }

  async function checkIntegrity() {
    if (!version || !account) return

    setLoadingType('check')
    setIsLoading(true)

    try {
      await version.install(account)

      const versionMods = new Mods(settings.downloadLimit, version, server)
      await versionMods.check()

      addToast({
        color: 'success',
        title: t('versions.integrityOk')
      })
    } catch (err) {
      addToast({
        color: 'danger',
        title: t('versions.integrityError')
      })
    } finally {
      setIsLoading(false)
      setLoadingType(undefined)
    }
  }

  async function saveVersion() {
    if (!version || !versions) return

    let isShare = false

    setLoadingType('save')
    setIsLoading(true)

    let isRename = false
    let oldPath = version.versionPath
    if (versionName.trim() != version.version.name) {
      const versionsPath = path.join(paths.launcher, 'minecraft', 'versions')

      const oldName = version.version.name

      const newName = versionName.trim()
      const newPath = path.join(versionsPath, newName)

      try {
        await fs.move(version.versionPath, newPath, {
          overwrite: true
        })
        isRename = true

        setConsoles((prev) => ({
          consoles: prev.consoles.filter((c) => c.versionName != oldName)
        }))

        version.version.name = versionName.trim()
        await version.init()

        isShare = true
      } catch (err) {
        addToast({
          color: 'danger',
          title: t('versions.renameError')
        })

        setIsLoading(false)
        setLoadingType(undefined)

        return
      } finally {
        setEditName(false)
      }
    }

    if (!compareMods(version.version.loader.mods || [], mods)) {
      version.version.loader.mods = mods

      for (const bMod of blockedMods) {
        if (!bMod.filePath) continue

        const mod = mods.find((m) => m.id == bMod.projectId)
        if (!mod || !mod.version) continue

        mod.version.files[0].localPath = bMod.filePath
      }

      const versionMods = new Mods(settings.downloadLimit, version, server)
      await versionMods.check()

      isShare = true
      setBlockedMods([])
    }

    if (version.version.version.serverManager) {
      try {
        const serversPath = path.join(version.versionPath, 'servers.dat')

        if (!compareServers(nbtServers, servers)) {
          await writeNBT(servers, serversPath)
          setNbtServers(servers)
          isShare = true
        }
      } catch {}
    }

    version.version.lastUpdate = new Date()

    if (
      runArguments.game != (version?.version.runArguments?.game || '') ||
      runArguments.jvm != (version?.version.runArguments?.jvm || '')
    ) {
      version.version.runArguments = { ...runArguments }
      isShare = true
    }

    if (isLogoChanged || (isRename && !isDownloadedVersion && isOwnerVersion)) {
      const filename = 'logo.png'
      const filePath = path.join(version.versionPath, filename)

      let fileUrl = ''
      if (image) {
        let img = image
        if (isRename && !isDownloadedVersion && isOwnerVersion)
          img = img.replace(oldPath, version.versionPath)

        const newFile = await fetch(img).then((r) => r.blob())
        await fs.writeFile(filePath, new Uint8Array(await newFile.arrayBuffer()))

        fileUrl = `file://${filePath}?t=${new Date().getTime()}`

        setImage(fileUrl)
      } else {
        await rimraf(filePath)
      }

      version.version.image = fileUrl
      isShare = true
    }

    if (quickConnectIp != version.version.quickServer) {
      version.version.quickServer = quickConnectIp
      isShare = true
    }

    await version.save()

    try {
      await rimraf(path.join(version.versionPath, 'temp'))
    } catch {}

    addToast({
      title: t('versions.updated'),
      color: 'success'
    })

    setIsLogoChanged(false)
    setLoadingType(undefined)
    setIsLoading(false)

    if (isShare && version.version.shareCode && !version.version.downloadedVersion && isNetwork) {
      setIsOpenModalShare(true)
    }
  }

  return (
    <>
      <Modal
        scrollBehavior="outside"
        isOpen={true}
        size="3xl"
        onClose={() => {
          if (isLoading) return

          if (saveBtnisDisabled()) {
            setNotSavedModal(true)
            return
          }

          closeModal()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('versions.versionSettings')}</ModalHeader>
          <ModalBody>
            <div className={`flex flex-col gap-4`}>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {image && (
                    <Image
                      src={image}
                      alt={'logo'}
                      width={64}
                      height={64}
                      className="min-w-16 min-h-16"
                      onClick={() => {
                        if (!image || isDownloadedVersion) return
                      }}
                    />
                  )}

                  {editName ? (
                    <Input
                      size="sm"
                      startContent={
                        !checkVersionName(versionName.trim(), versions) ? (
                          <CircleAlert className="text-warning" size={22} />
                        ) : (
                          ''
                        )
                      }
                      placeholder={t('versions.namePlaceholder')}
                      value={versionName}
                      onChange={(event) => setVersionName(event.currentTarget.value)}
                      isDisabled={isLoading}
                    ></Input>
                  ) : (
                    <p className="truncate flex-grow text-xl font-semibold">{versionName}</p>
                  )}

                  <div className="flex items-center gap-1">
                    {!version?.version.downloadedVersion && (
                      <div className="flex items-center gap-1">
                        {!editName && (
                          <Button
                            variant="flat"
                            isIconOnly
                            size="sm"
                            isDisabled={isLoading || !isOwnerVersion}
                            onPress={() => {
                              setEditName(true)
                            }}
                          >
                            <Pencil size={20} />
                          </Button>
                        )}
                        {editName && (
                          <Button
                            isIconOnly
                            onPress={() => {
                              setEditName(false)
                              setVersionName(version?.version.name || '')
                            }}
                            variant="flat"
                            size="sm"
                          >
                            <X size={20} />
                          </Button>
                        )}
                        <Button
                          variant="flat"
                          isIconOnly
                          size="sm"
                          isDisabled={isLoading || !isOwnerVersion}
                          onPress={async () => {
                            const filePaths =
                              await window.electron.ipcRenderer.invoke('openFileDialog')

                            if (!filePaths || filePaths.length == 0) return

                            setCroppedImage(filePaths[0])
                            setIsCropping(true)
                          }}
                        >
                          <ImagePlus size={20} />
                        </Button>
                        {image && (
                          <Button
                            size="sm"
                            variant="flat"
                            isIconOnly
                            isDisabled={isLoading || !isOwnerVersion}
                            onPress={() => {
                              setImage('')
                              setIsLogoChanged(true)
                            }}
                          >
                            <ImageMinus size={20} />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {version && (
                  <div className="flex items-center gap-1 m-auto">
                    <Chip variant="flat">
                      <div className="flex items-center gap-1">
                        <Gamepad2 size={20} />
                        <p className="text-sm">{version.version.version.id}</p>
                      </div>
                    </Chip>

                    <Chip variant="flat">
                      <div className="flex items-center gap-1">
                        <Cpu size={20} />
                        <p className={loaders[version?.version.loader.name].style}>
                          {loaders[version?.version.loader.name].name}
                        </p>
                        {version?.version.loader?.name != 'vanilla' && (
                          <p>({version?.version.loader.version?.id})</p>
                        )}
                      </div>
                    </Chip>
                    {version?.version.shareCode && (
                      <Chip
                        variant="flat"
                        className="cursor-pointer m-auto"
                        onClick={() => {
                          clipboard.writeText(version?.version.shareCode || '')
                          addToast({
                            title: t('common.copied')
                          })
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Share2 size={20} />
                          {version?.version.shareCode}
                        </div>
                      </Chip>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 m-auto">
                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={!version || isLoading || !isNetwork}
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
                  </span>

                  {version?.version.version?.serverManager && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={!version || isLoading}
                        startContent={<Server size={22} />}
                        onPress={() => {
                          setIsServers(true)
                        }}
                      >
                        {t('versions.servers')}
                      </Button>
                    </span>
                  )}

                  <span>
                    <Button
                      variant="flat"
                      isDisabled={!version || isLoading || !isExistSaves}
                      startContent={<Earth size={22} />}
                      onPress={() => {
                        setIsOpenWorlds(true)
                      }}
                    >
                      {t('worlds.title')}
                    </Button>
                  </span>
                </div>
                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={
                        (version?.version.downloadedVersion &&
                          runArguments.game == '' &&
                          runArguments.jvm == '') ||
                        isLoading
                      }
                      startContent={<SquareTerminal size={22} />}
                      onPress={() => {
                        setIsOpenArguments(true)
                      }}
                    >
                      {t('arguments.title')}
                    </Button>
                  </span>
                  <span>
                    <Button
                      variant="flat"
                      startContent={<Folder size={22} />}
                      onPress={() => {
                        if (!version) return

                        shell.openPath(path.join(paths.minecraft, 'versions', version.version.name))
                      }}
                    >
                      {t('common.openFolder')}
                    </Button>
                  </span>

                  <span>
                    <Button
                      variant="flat"
                      isDisabled={isLoading || !isNetwork}
                      isLoading={isLoading && loadingType == 'check'}
                      startContent={<ScanLine size={22} />}
                      onPress={async () => {
                        if (!version) return

                        const blockedMods = await checkBlockedMods(mods, version.versionPath)

                        if (blockedMods.length > 0) {
                          setBlockedMods(blockedMods)
                          setIsBlockedMods(true)
                          setBlockedCloseType('check')
                          return
                        }

                        await checkIntegrity()
                      }}
                    >
                      {t('versions.checkIntegrity')}
                    </Button>
                  </span>
                </div>
                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      color={'success'}
                      startContent={<Save size={22} />}
                      isDisabled={
                        !saveBtnisDisabled() ||
                        (version && version.version.owner && account && !isOwnerVersion) ||
                        false
                      }
                      isLoading={isLoading && loadingType == 'save'}
                      onPress={async () => {
                        if (!version) return

                        const blockedMods = await checkBlockedMods(mods, version.versionPath)

                        if (blockedMods.length > 0) {
                          setBlockedMods(blockedMods)
                          setIsBlockedMods(true)
                          setBlockedCloseType('save')
                          return
                        }

                        await saveVersion()
                      }}
                    >
                      {t('common.save')}
                    </Button>
                  </span>
                  <span>
                    <Button
                      color="danger"
                      variant="flat"
                      isDisabled={
                        isLoading || (version?.version.owner && account && !isOwnerVersion) || false
                      }
                      startContent={<Trash size={22} />}
                      onPress={() => {
                        setIsOpenDel(true)
                      }}
                    >
                      {t('common.delete')}
                    </Button>
                  </span>
                </div>
                <div className="flex items-center gap-2 m-auto">
                  <span>
                    <Button
                      variant="flat"
                      isDisabled={isLoading}
                      startContent={<FolderArchive size={22} />}
                      onPress={() => {
                        setIsOpenExportModal(true)
                      }}
                    >
                      {t('export.btn')}
                    </Button>
                  </span>
                  {settings?.devMode && (
                    <ButtonGroup>
                      <Tooltip content={t('versions.copyAbsolutePath')} delay={1000}>
                        <Button
                          variant="flat"
                          className="w-full"
                          startContent={<CopyCheck size={22} />}
                          isDisabled={isLoading}
                          onPress={async () => {
                            if (!version || !account) return

                            const command = await version.getRunCommand(account, settings, authData)
                            if (!command) return

                            clipboard.writeText(command.join(' '))
                            addToast({
                              title: t('common.copied')
                            })
                          }}
                        >
                          {t('versions.copyRunComand')}
                        </Button>
                      </Tooltip>
                      <Tooltip content={t('versions.copyRelativePath')} delay={1000}>
                        <Button
                          variant="flat"
                          isIconOnly
                          isDisabled={isLoading}
                          onPress={async () => {
                            if (!version || !account) return

                            const command = await version.getRunCommand(
                              account,
                              settings,
                              authData,
                              true
                            )
                            if (!command) return

                            clipboard.writeText(command.join(' '))
                            addToast({
                              title: t('common.copied')
                            })
                          }}
                        >
                          <CopySlash size={22} />
                        </Button>
                      </Tooltip>
                    </ButtonGroup>
                  )}
                </div>
                <div className="flex items-center gap-2 m-auto">
                  {version && !version.version.shareCode && account?.type != 'plain' && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={
                          !!saveBtnisDisabled() ||
                          isLoading ||
                          (version.version.owner && account && !isOwnerVersion) ||
                          false ||
                          !isNetwork
                        }
                        startContent={<Share size={22} />}
                        onPress={async () => {
                          setShareType('new')
                          setShareModal(true)
                        }}
                      >
                        {t('versions.share')}
                      </Button>
                    </span>
                  )}
                  {versionDiffence == 'new' &&
                    !version?.version.downloadedVersion &&
                    version?.version.shareCode && (
                      <span>
                        <ButtonGroup>
                          <Button
                            variant="flat"
                            className="w-full"
                            color={'primary'}
                            isDisabled={
                              saveBtnisDisabled() || isLoading || !isNetwork || !isOwnerVersion
                            }
                            startContent={<ArrowUpFromLine size={22} />}
                            isLoading={isLoading && loadingType == 'check_diff'}
                            onPress={async () => {
                              if (!account || !version.version.shareCode) return

                              try {
                                setIsLoading(true)
                                setLoadingType('check_diff')

                                const diff = await checkDiffenceUpdateData({
                                  mods: version.version.loader.mods,
                                  runArguments: version.version.runArguments || {
                                    game: '',
                                    jvm: ''
                                  },
                                  servers,
                                  version: version.version,
                                  versionPath: path.join(
                                    paths.minecraft,
                                    'versions',
                                    version.version.name
                                  ),
                                  logo: image || '',
                                  quickServer: quickConnectIp
                                })

                                setDiffenceUpdateData(diff)

                                if (!diff) {
                                  setVersionDiffence('sync')
                                  throw Error('not found diff')
                                }

                                const modpackData = await backendService.getModpack(
                                  version.version.shareCode
                                )

                                if (!modpackData.data) {
                                  throw Error('not found modpack')
                                }

                                setTempModpack(modpackData.data)
                                setShareType('update')
                                setShareModal(true)
                              } catch {
                              } finally {
                                setIsLoading(false)
                                setLoadingType(undefined)
                              }
                            }}
                          >
                            {t('versions.publish')}
                          </Button>
                          <Tooltip content={t('versions.synchronizeDescription')} delay={1000}>
                            <Button
                              variant="flat"
                              isIconOnly
                              color={'primary'}
                              isDisabled={
                                saveBtnisDisabled() ||
                                (version?.version.owner && account && !isOwnerVersion) ||
                                false ||
                                isLoading ||
                                !isNetwork
                              }
                              isLoading={isLoading && loadingType == 'sync'}
                              onPress={async () => {
                                if (!account) return

                                setLoadingType('sync')
                                setIsLoading(true)
                                await sync()
                              }}
                            >
                              <ArrowDownToLine size={22} />
                            </Button>
                          </Tooltip>
                        </ButtonGroup>
                      </span>
                    )}

                  {versionDiffence == 'old' && version?.version.downloadedVersion && (
                    <Tooltip content={t('versions.synchronizeDescription')}>
                      <span>
                        <Button
                          variant="flat"
                          color="primary"
                          startContent={<ArrowDownToLine size={22} />}
                          isDisabled={saveBtnisDisabled() || isLoading || !isNetwork}
                          isLoading={isLoading && loadingType == 'sync'}
                          onPress={async () => {
                            if (!account) return

                            setLoadingType('sync')
                            setIsLoading(true)
                            await sync()
                          }}
                        >
                          {t('versions.synchronize')}
                        </Button>
                      </span>
                    </Tooltip>
                  )}

                  {!version?.version.downloadedVersion && (
                    <span>
                      <Button
                        variant="flat"
                        isDisabled={
                          isLoading ||
                          (version?.version.owner && account && !isOwnerVersion) ||
                          false
                        }
                        isLoading={isLoading && loadingType == 'server'}
                        startContent={<ServerCog size={22} />}
                        onPress={async () => {
                          if (!version) return

                          if (server) {
                            setIsServerManager(true)
                            return
                          }

                          setLoadingType('server')
                          setIsLoading(true)

                          const serverCores = await ServerService.get(
                            version.version.version.id,
                            version.version.loader.name
                          )
                          if (!serverCores.length) {
                            setIsLoading(false)
                            setLoadingType(undefined)
                            addToast({
                              color: 'danger',
                              title: t('versions.notFoundServerCore')
                            })

                            return
                          }

                          setServerCores(serverCores)
                          setIsServerCreate(true)

                          setIsLoading(false)
                          setLoadingType(undefined)
                        }}
                      >
                        {t('versions.serverManager')}
                      </Button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isShareModal && (
        <ShareModal
          closeModal={() => {
            setShareModal(false)
          }}
          successUpdate={() => {
            setShareModal(false)
            closeModal()
          }}
          shareType={shareType}
          modpack={tempModpack}
          diffenceUpdateData={diffenceUpdateData}
        />
      )}
      {isServerCreate && (
        <CreateServer
          close={() => {
            setIsServerCreate(false)
          }}
          serverCores={serverCores}
        />
      )}
      {isOpenExportModal && version && (
        <Export
          onClose={() => setIsOpenExportModal(false)}
          versionPath={path.join(paths.minecraft, 'versions', version.version.name)}
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
          changeImage={async (url: string) => {
            setImage(url)
            setIsLogoChanged(true)
          }}
        />
      )}

      {isModManager && version && (
        <ModManager
          mods={mods}
          setMods={(mods: ILocalProject[]) => setMods(mods)}
          onClose={() => setIsModManager(false)}
          loader={version.version.loader.name}
          version={version.version.version}
          versionPath={version.versionPath}
          isModpacks={false}
          setLoader={() => {}}
          setModpack={() => {}}
          setVersion={() => {}}
        />
      )}

      {isServers && version && (
        <Servers
          quickConnectIp={quickConnectIp}
          setQuickConnectIp={setQuickConnectIp}
          closeModal={(isFull?: boolean) => {
            if (isFull) closeModal()
            else setIsServers(false)
          }}
          servers={servers}
          setServers={(servers: IServer[]) => {
            setServers(servers)
          }}
          runGame={runGame}
        />
      )}
      {isOpenArguments && version && (
        <Arguments
          runArguments={runArguments}
          onClose={() => {
            setIsOpenArguments(false)
          }}
          setArguments={setRunArguments}
        />
      )}
      {notSavedModal && (
        <Confirmation
          content={[{ text: t('versions.notSaved'), color: 'warning' }]}
          onClose={() => setNotSavedModal(false)}
          title={t('common.confirmation')}
          buttons={[
            {
              text: t('versions.willReturn'),
              onClick: async () => {
                setNotSavedModal(false)
              }
            },
            {
              color: 'danger',
              text: t('versions.close'),
              onClick: async () => {
                closeModal()
              }
            }
          ]}
        />
      )}

      {isServerManager && version && (
        <ServerControl
          onClose={() => setIsServerManager(false)}
          onDelete={() => setServer(undefined)}
        />
      )}

      {isOpenShareModal && (
        <Confirmation
          content={[{ text: t('versions.publicUpdate') }]}
          onClose={() => setIsOpenModalShare(false)}
          buttons={[
            {
              text: t('common.yes'),
              onClick: async () => {
                if (!account || !version || !version?.version.shareCode) return

                try {
                  setIsLoading(true)
                  setLoadingType('check_diff')

                  const diff = await checkDiffenceUpdateData({
                    mods: version.version.loader.mods,
                    runArguments: version.version.runArguments || { game: '', jvm: '' },
                    servers,
                    version: version.version,
                    versionPath: path.join(paths.minecraft, 'versions', version.version.name),
                    logo: image || '',
                    quickServer: quickConnectIp
                  })

                  if (!diff) {
                    setIsOpenModalShare(false)
                    setVersionDiffence('sync')
                    throw Error('not found diff')
                  }

                  const modpackData = await backendService.getModpack(version.version.shareCode)
                  if (!modpackData.data) {
                    throw Error('not found modpack')
                  }

                  setDiffenceUpdateData(diff)
                  setTempModpack(modpackData.data)
                  setIsOpenModalShare(false)
                  setShareType('update')
                  setShareModal(true)
                } catch {
                } finally {
                  setIsLoading(false)
                  setLoadingType(undefined)
                }
              },
              loading: isLoading && loadingType == 'check_diff'
            },
            {
              text: t('common.no'),
              onClick: async () => {
                setIsOpenModalShare(false)
              }
            }
          ]}
        />
      )}
      {isOpenDel && (
        <DeleteVersion
          close={(isDeleted?: boolean) => {
            setIsOpenDel(false)

            if (isDeleted) {
              setVersion(undefined)
              closeModal()
            }
          }}
        />
      )}

      {isBlockedMods && blockedMods.length && (
        <BlockedMods
          mods={blockedMods}
          onClose={async (bMods) => {
            setBlockedMods(bMods)
            setIsBlockedMods(false)

            if (blockedCloseType == 'save') await saveVersion()
            if (blockedCloseType == 'check') await checkIntegrity()

            setBlockedCloseType(undefined)
          }}
        />
      )}

      {isOpenWorlds && (
        <Worlds
          onClose={(isFull) => {
            if (isFull) closeModal()
            else setIsOpenWorlds(false)
          }}
          runGame={runGame}
        />
      )}
    </>
  )
}
