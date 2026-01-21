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
import { IServerConf, IServerOption } from '@/types/Server'
import { accountAtom, selectedVersionAtom, serverAtom, settingsAtom } from '@renderer/stores/atoms'
import { useAtom } from 'jotai'
import { HardDriveDownload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const [account] = useAtom(accountAtom)
  const { t } = useTranslation()
  const [, setServer] = useAtom(serverAtom)
  const [settings] = useAtom(settingsAtom)

  const [selectedCore, setSelectedCore] = useState<string | null>(serverCores[0]?.core ?? null)

  const selectedServerCore = useMemo(() => {
    return selectedCore ? serverCores.find((sc) => sc.core === selectedCore) : undefined
  }, [selectedCore, serverCores])

  useEffect(() => {
    if (!selectedCore && serverCores.length) {
      setSelectedCore(serverCores[0].core)
    }
  }, [serverCores, selectedCore])

  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const canInstall = !!selectedVersion && !!selectedServerCore && !!account

  const handleInstall = useCallback(async () => {
    if (isLoading) return
    if (!selectedVersion || !selectedServerCore || !account) return

    const versionPath = selectedVersion.versionPath

    setLoadingType('install')
    setIsLoading(true)

    let success = false

    try {
      const serverPath = await api.path.join(versionPath, 'server')
      await api.fs.ensure(serverPath)

      const conf: IServerConf = {
        core: selectedServerCore.core,
        javaMajorVersion: selectedVersion.manifest?.javaVersion.majorVersion || 21,
        memory: selectedVersion.version.loader.name == 'vanilla' ? 2048 : 4096,
        downloads: {
          server: selectedServerCore.url
        }
      }

      await api.fs.writeJSON(await api.path.join(serverPath, 'conf.json'), conf)

      await api.file.download(
        [
          {
            url: selectedServerCore.url,
            destination: await api.path.join(serverPath, selectedServerCore.core + '.jar'),
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

      await serverGame.install()
      setServer(conf)

      await api.fs.writeFile(await api.path.join(serverPath, 'eula.txt'), 'eula=true', 'utf-8')

      if (selectedVersion.version.loader.mods.length > 0) {
        const mods = new Mods(settings, selectedVersion.version, conf)
        await mods.check()
      }

      addToast({
        title: t('versions.serverInstalled'),
        color: 'success'
      })

      success = true
    } catch (err) {
      console.error(err)

      addToast({
        title: t('versions.serverInstallError'),
        color: 'danger'
      })
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
        setLoadingType(undefined)
      }
    }

    if (success) close(true)
  }, [
    isLoading,
    selectedVersion,
    selectedServerCore,
    account,
    settings.downloadLimit,
    setServer,
    close,
    t,
    settings
  ])

  return (
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
              selectedKeys={selectedCore ? new Set([selectedCore]) : new Set()}
              className="w-full"
              isDisabled={isLoading}
              onChange={(event) => {
                const value = event.target.value
                setSelectedCore(value || null)
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
            isDisabled={!canInstall || isLoading}
            isLoading={isLoading && loadingType == 'install'}
            startContent={<HardDriveDownload size={22} />}
            onPress={handleInstall}
          >
            {t('common.install')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
