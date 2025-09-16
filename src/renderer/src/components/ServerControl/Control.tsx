import { useEffect, useState } from 'react'
import { ImageCropper } from '../ImageCropper'
import { ServerSettings } from './Settings'
import { ProjectType } from '@/types/ModManager'
import { useTranslation } from 'react-i18next'
import { Cpu, Folder, ImageMinus, ImagePlus, Power, Settings, Trash } from 'lucide-react'
import { useAtom } from 'jotai'
import {
  accountAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom
} from '@renderer/stores/Main'
import {
  addToast,
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Image
} from '@heroui/react'
import { ServerGame } from '@renderer/game/Server'

const api = window.api
const fs = api.fs
const path = api.path
const rimraf = api.rimraf
const { shell } = api

enum LoadingType {
  RUN = 'run',
  DELETE = 'delete'
}

export function ServerControl({
  onClose,
  onDelete
}: {
  onClose: () => void
  onDelete: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<LoadingType | null>(null)
  const [isSettings, setIsSettings] = useState(false)
  const [image, setImage] = useState('')
  const [isCropping, setIsCropping] = useState(false)
  const [serverLogo, setServerLogo] = useState('')
  const [server] = useAtom(serverAtom)
  const [version] = useAtom(selectedVersionAtom)
  const [paths] = useAtom(pathsAtom)
  const [settings] = useAtom(settingsAtom)
  const [account] = useAtom(accountAtom)

  const serverPath = path.join(paths.minecraft, 'versions', version?.version.name || '', 'server')

  const { t } = useTranslation()

  async function changeImage(url: string) {
    if (!server) return

    const response = await fetch(url)
    const blob = await response.blob()

    await fs.writeFile(
      path.join(serverPath, 'server-icon.png'),
      new Uint8Array(await blob.arrayBuffer()),
      'utf-8'
    )

    setServerLogo(url)
    addToast({ color: 'success', title: t('serverManager.logoEdited') })
  }

  useEffect(() => {
    ;(async () => {
      if (server) {
        const logoPath = path.join(serverPath, 'server-icon.png')
        try {
          await fs.access(logoPath)
          const data = await fs.readFile(logoPath)

          setServerLogo(URL.createObjectURL(new Blob([data])))
        } catch {}
      }
    })()
  }, [server])

  return server ? (
    <>
      <Modal
        size="xs"
        isOpen={true}
        onClose={() => {
          if (!isLoading) onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('versions.serverManager')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 justify-between">
                {serverLogo && (
                  <Image
                    src={serverLogo}
                    alt=""
                    height={64}
                    width={64}
                    className="min-w-16 min-h-16"
                  />
                )}
                <div className="flex items-center gap-1">
                  <Cpu size={22} />
                  <p>{server.core}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="flat"
                    isIconOnly
                    onPress={async () => {
                      const filePaths = await window.electron.ipcRenderer.invoke('openFileDialog')
                      if (!filePaths || filePaths.length === 0) return

                      setImage(filePaths[0])
                      setIsCropping(true)
                    }}
                  >
                    <ImagePlus size={20} />
                  </Button>

                  {serverLogo && (
                    <Button
                      size="sm"
                      variant="flat"
                      isIconOnly
                      onPress={async () => {
                        await rimraf(path.join(serverPath, 'server-icon.png'))
                        setServerLogo('')
                      }}
                    >
                      <ImageMinus size={20} />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  variant="flat"
                  isDisabled={isLoading}
                  startContent={<Settings size={22} />}
                  onPress={async () => {
                    const serverPropertiesPath = path.join(serverPath, 'server.properties')
                    try {
                      await fs.access(serverPropertiesPath)
                    } catch {
                      addToast({
                        color: 'danger',
                        title: t('serverManager.serverPropertiesNotFound')
                      })

                      return
                    }
                    setIsSettings(true)
                  }}
                >
                  {t('settings.title')}
                </Button>
                <Button
                  variant="flat"
                  startContent={<Folder size={22} />}
                  onPress={() => {
                    shell.openPath(serverPath)
                  }}
                >
                  {t('common.openFolder')}
                </Button>
                <Button
                  variant="flat"
                  color="danger"
                  isDisabled={isLoading}
                  isLoading={isLoading && loadingType == LoadingType.DELETE}
                  startContent={<Trash size={22} />}
                  onPress={async () => {
                    setLoadingType(LoadingType.DELETE)
                    setIsLoading(true)

                    try {
                      await rimraf(serverPath)
                      onClose()
                      addToast({
                        color: 'success',
                        title: t('serverManager.deleted')
                      })
                    } catch (error) {
                      addToast({
                        color: 'danger',
                        title: t('serverManager.deleteError')
                      })
                    }

                    setLoadingType(null)
                    setIsLoading(false)

                    onDelete()
                    onClose()
                  }}
                >
                  {t('common.delete')}
                </Button>
                <Button
                  color="secondary"
                  variant="flat"
                  isDisabled={isLoading}
                  isLoading={isLoading && loadingType == LoadingType.RUN}
                  startContent={<Power size={22} />}
                  onPress={async () => {
                    if (!version) return

                    setIsLoading(true)
                    setLoadingType(LoadingType.RUN)

                    const serverGame = new ServerGame(
                      account,
                      settings.downloadLimit,
                      path.join(paths.minecraft, 'versions', version.version.name),
                      serverPath,
                      server,
                      version.version
                    )

                    setTimeout(() => {
                      setIsLoading(false)
                      setLoadingType(null)
                    }, 5000)

                    await serverGame.runServer()

                    setIsLoading(false)
                    setLoadingType(null)
                  }}
                >
                  {t('serverManager.run')}
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      {isSettings && version && (
        <ServerSettings
          resourcePacks={version.version.loader.mods.filter(
            (project) => project.projectType == ProjectType.RESOURCEPACK
          )}
          server={server}
          serverPath={serverPath}
          onClose={() => setIsSettings(false)}
          open={isSettings}
        />
      )}
      {isCropping && (
        <ImageCropper
          title={t('common.editingLogo')}
          image={image}
          onClose={() => setIsCropping(false)}
          size={{
            height: 64,
            width: 64
          }}
          changeImage={changeImage}
        />
      )}
    </>
  ) : (
    <Alert color="warning" title={t('serverManager.configNotFound')} />
  )
}
