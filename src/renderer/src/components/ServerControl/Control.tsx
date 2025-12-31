import { useEffect, useState } from 'react'
import { ImageCropper } from '../ImageCropper'
import { ServerSettings } from './Settings'
import { ProjectType } from '@/types/ModManager'
import { useTranslation } from 'react-i18next'
import { Cpu, Folder, ImageMinus, ImagePlus, Settings, Trash } from 'lucide-react'
import { useAtom } from 'jotai'
import { pathsAtom, selectedVersionAtom, serverAtom } from '@renderer/stores/Main'
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

enum LoadingType {
  RUN = 'run',
  DELETE = 'delete'
}

const api = window.api

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
  const [serverPath, setServerPath] = useState('')

  const { t } = useTranslation()

  async function changeImage(url: string) {
    if (!server) return

    const response = await fetch(url)
    const blob = await response.blob()

    await api.fs.writeFile(
      await api.path.join(serverPath, 'server-icon.png'),
      new Uint8Array(await blob.arrayBuffer()),
      'utf-8'
    )

    setServerLogo(url)
    addToast({ color: 'success', title: t('serverManager.logoEdited') })
  }

  useEffect(() => {
    ;(async () => {
      if (server) {
        const logoPath = await api.path.join(serverPath, 'server-icon.png')
        try {
          await api.fs.pathExists(logoPath)
          const data = await api.fs.readFile(logoPath, 'base64')

          setServerLogo(URL.createObjectURL(new Blob([data])))
        } catch {}
      }

      if (version && paths.minecraft) {
        api.path
          .join(paths.minecraft, 'versions', version?.version.name || '', 'server')
          .then(setServerPath)
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
                      const filePaths = await api.other.openFileDialog()
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
                        await api.fs.rimraf(await api.path.join(serverPath, 'server-icon.png'))
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
                    const serverPropertiesPath = await api.path.join(
                      serverPath,
                      'server.properties'
                    )
                    const isExists = await api.fs.pathExists(serverPropertiesPath)
                    if (!isExists) {
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
                  onPress={async () => {
                    await api.shell.openPath(serverPath)
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
                      await api.fs.rimraf(serverPath)
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
          serverData={server}
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
