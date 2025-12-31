import {
  addToast,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem
} from '@heroui/react'
import { ProjectType, Provider } from '@/types/ModManager'
import { IServerConf, IServerOption, ServerCore } from '@/types/Server'
import {
  accountAtom,
  selectedVersionAtom,
  serverAtom,
  settingsAtom,
  versionsAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { HardDriveDownload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ServerGame } from '@renderer/classes/ServerGame'
import { Mods } from '@renderer/classes/Mods'

const api = window.api

export function CreateServer({
  close,
  serverCores
}: {
  close: (isSuccess?: boolean) => void
  serverCores: IServerOption[]
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'install'>()
  const [selectedServerCore, setSelectedServerCore] = useState<IServerOption>()
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const [account] = useAtom(accountAtom)
  const { t } = useTranslation()
  const setServer = useAtom(serverAtom)[1]
  const [versions] = useAtom(versionsAtom)
  const [settings] = useAtom(settingsAtom)

  useEffect(() => {
    if (serverCores.length) {
      setSelectedServerCore(serverCores[0])
    }
  }, [])

  return (
    <>
      <Modal
        size="xs"
        isOpen={true}
        onClose={() => {
          if (isLoading) return

          close()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('versions.createingServer')}</ModalHeader>
          <ModalBody>
            {serverCores.length ? (
              <Select
                label={t('versions.serverCore')}
                selectedKeys={[selectedServerCore?.core || '']}
                className="w-full"
                isDisabled={isLoading}
                onChange={(event) => {
                  const value = event.target.value
                  if (!value) return
                  setSelectedServerCore(serverCores.find((sc) => sc.core == value))
                }}
              >
                {serverCores.map((sc) => {
                  return <SelectItem key={sc.core}>{sc.core}</SelectItem>
                })}
              </Select>
            ) : undefined}
          </ModalBody>
          <ModalFooter>
            <Button
              color="primary"
              variant="flat"
              isLoading={isLoading && loadingType == 'install'}
              startContent={<HardDriveDownload size={22} />}
              onPress={async () => {
                if (!selectedVersion || !selectedServerCore || !account) return

                const versionPath = selectedVersion.versionPath

                setLoadingType('install')
                setIsLoading(true)

                const serverPath = await api.path.join(versionPath, 'server')
                await api.fs.ensure(serverPath)

                const conf: IServerConf = {
                  core: selectedServerCore.core,
                  javaMajorVersion: selectedVersion.manifest?.javaVersion.majorVersion || 21,
                  memory: selectedVersion.version.loader.name == 'vanilla' ? 2048 : 4096,
                  downloads: {
                    server: selectedServerCore.url,
                    additionalPackage: selectedServerCore.additionalPackage
                  }
                }

                await api.fs.writeJSON(await api.path.join(serverPath, 'conf.json'), conf)

                await api.file.download(
                  [
                    {
                      url: selectedServerCore.url,
                      destination: await api.path.join(
                        serverPath,
                        selectedServerCore.core + '.jar'
                      ),
                      group: 'server'
                    }
                  ],
                  settings.downloadLimit
                )

                const serverGame = new ServerGame(
                  account,
                  settings.downloadLimit,
                  versionPath,
                  serverPath,
                  conf,
                  selectedVersion.version
                )

                try {
                  await serverGame.install()
                  setServer(conf)

                  await api.fs.writeFile(
                    await api.path.join(serverPath, 'eula.txt'),
                    'eula=true',
                    'utf-8'
                  )

                  if (
                    selectedServerCore.additionalPackage &&
                    selectedServerCore.core == ServerCore.SPONGE &&
                    selectedVersion.version.loader.name == 'forge'
                  ) {
                    const urlPart = selectedServerCore.additionalPackage.split('/')
                    const fileName = urlPart[urlPart.length - 1]

                    const newMods = [...selectedVersion.version.loader.mods]

                    newMods.push({
                      url: 'https://www.spongepowered.org/',
                      description:
                        'A community-driven open source Minecraft: Java Edition modding platform.',
                      id: 'sponge-core',
                      iconUrl:
                        'https://static.wikia.nocookie.net/minecraft_gamepedia/images/7/70/Wet_Sponge_JE2_BE2.png',
                      projectType: ProjectType.MOD,
                      provider: Provider.OTHER,
                      title: 'Sponge Core',
                      version: {
                        id: fileName.replace('.jar', ''),
                        files: [
                          {
                            filename: fileName,
                            isServer: true,
                            size: 0,
                            url: selectedServerCore.additionalPackage,
                            sha1: ''
                          }
                        ],
                        dependencies: []
                      }
                    })

                    const index = versions.findIndex(
                      (v) => v.version.name == selectedVersion.version.name
                    )

                    selectedVersion.version.loader.mods = [...newMods]
                    versions[index].version.loader.mods = [...newMods]

                    await selectedVersion.save()
                  }

                  if (selectedVersion.version.loader.mods.length > 0) {
                    const mods = new Mods(settings, selectedVersion.version, conf)
                    await mods.check()
                  }

                  addToast({
                    title: t('versions.serverInstalled'),
                    color: 'success'
                  })

                  close(true)
                } catch (err) {
                  addToast({
                    title: t('versions.serverInstallError'),
                    color: 'danger'
                  })
                } finally {
                  setIsLoading(false)
                  setLoadingType(undefined)
                }
              }}
            >
              {t('common.install')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
