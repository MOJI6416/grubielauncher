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
import { accountAtom, isOwnerVersionAtom, selectedVersionAtom } from '@renderer/stores/atoms'
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
  const [worlds, setWorlds] = useState<IWorld[]>([])

  const [version] = useAtom(selectedVersionAtom)
  const [account] = useAtom(accountAtom)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)

  const { t } = useTranslation()

  useEffect(() => {
    if (!version) {
      onClose()
      return
    }

    if (!account) {
      setWorlds([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    ;(async () => {
      try {
        const worldsPath = await api.path.join(version.versionPath, 'saves')
        const entries = await api.fs.readdir(worldsPath)

        const folders: string[] = []
        for (const file of entries) {
          const full = await api.path.join(worldsPath, file)
          if (await api.fs.isDirectory(full)) folders.push(file)
        }

        const results = await Promise.all(
          folders.map(async (folder) => {
            const worldPath = await api.path.join(worldsPath, folder)
            return api.worlds.readWorld(worldPath, account)
          })
        )

        setWorlds(results.filter(Boolean) as IWorld[])
      } catch (error) {
        addToast({ title: t('worlds.noWorlds') })
        onClose()
      } finally {
        setIsLoading(false)
      }
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
            {isLoading ? (
              <div className="flex h-full w-full items-center justify-center">
                <Spinner size="sm" />
              </div>
            ) : worlds.length === 0 ? (
              <div className="flex w-full items-center">
                <Alert title={t('worlds.noWorlds')} />
              </div>
            ) : (
              <WorldList
                worlds={worlds}
                setWorlds={setWorlds}
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
