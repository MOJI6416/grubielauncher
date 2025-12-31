import { IWorld } from '@/types/World'
import {
  addToast,
  Alert,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Spinner
} from '@heroui/react'
import { accountAtom, isOwnerVersionAtom, selectedVersionAtom } from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { WorldList } from './WorldList'
import { RunGameParams } from '@renderer/App'
import { useTranslation } from 'react-i18next'

const api = window.api

export function Worlds({
  onClose,
  runGame
}: {
  onClose: (isFull?: boolean) => void
  runGame: (params: RunGameParams) => Promise<void>
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingType, setLoadingType] = useState<'load' | null>('load')
  const [version] = useAtom(selectedVersionAtom)
  const [worlds, setWorlds] = useState<IWorld[]>([])
  const [account] = useAtom(accountAtom)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)

  const { t } = useTranslation()

  useEffect(() => {
    if (!version) {
      onClose()
      return
    }

    ;(async () => {
      async function loadWorlds(worldsPath: string) {
        if (!account) return

        try {
          const files = (await api.fs.readdir(worldsPath)).filter(
            async (file) => await api.fs.isDirectory(await api.path.join(worldsPath, file))
          )

          const worlds: IWorld[] = []

          for (const file of files) {
            const worldPath = await api.path.join(worldsPath, file)

            const worldData = await api.worlds.readWorld(worldPath, account)
            if (!worldData) continue

            worlds.push(worldData)
          }

          setWorlds(worlds)
        } catch (error) {
          onClose()
          addToast({
            title: t('worlds.noWorlds')
          })
          return
        } finally {
          setIsLoading(false)
          setLoadingType(null)
        }
      }

      const worldsPath = await api.path.join(version.versionPath, 'saves')
      await loadWorlds(worldsPath)
    })()
  }, [version, account])

  return (
    <Modal
      isOpen
      onClose={() => {
        if (isLoading) return
        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('worlds.title')}</ModalHeader>

        <ModalBody>
          <div className="max-h-96 w-full">
            {isLoading && loadingType == 'load' ? (
              <div className="flex h-full w-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : worlds.length == 0 ? (
              <div className="flex w-full items-center">
                <Alert title={t('worlds.noWorlds')} />
              </div>
            ) : (
              <WorldList
                worlds={worlds}
                setWorlds={(worlds) => setWorlds(worlds)}
                isOwner={isOwnerVersion}
                runGame={runGame}
                closeModal={() => onClose(true)}
              />
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
