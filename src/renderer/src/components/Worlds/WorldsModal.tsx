import { IWorld } from '@/types/World'
import { Alert, Modal, ModalBody, ModalContent, ModalHeader, Spinner } from '@heroui/react'
import { accountAtom, isOwnerVersionAtom, selectedVersionAtom } from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { useEffect, useState } from 'react'
import { WorldList } from './WorldList'
import { readWorld } from '@renderer/utilities/Worlds'
import { RunGameParams } from '@renderer/App'
import { useTranslation } from 'react-i18next'

const api = window.api
const path = api.path
const fs = api.fs
const isDirectory = api.isDirectory

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

    async function loadWorlds(worldsPath: string) {
      if (!account) return

      try {
        const files = (await fs.readdir(worldsPath)).filter((file) =>
          isDirectory(path.join(worldsPath, file))
        )

        const worlds: IWorld[] = []

        for (const file of files) {
          const worldPath = path.join(worldsPath, file)

          const worldData = await readWorld(worldPath, account)
          if (!worldData) continue

          worlds.push(worldData)
        }

        setWorlds(worlds)
      } catch (error) {
        onClose()
        return
      } finally {
        setIsLoading(false)
        setLoadingType(null)
      }
    }

    const worldsPath = path.join(version.versionPath, 'saves')
    loadWorlds(worldsPath)
  }, [version])

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
