import {
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner
} from '@heroui/react'
import { Folder, File } from 'lucide-react'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader } from '@/types/Loader'
import { notSupportedPaths } from '@renderer/utilities/file'

const api = window.api

interface DirectoryEntry {
  path: string
  type: 'file' | 'folder'
}

export const SelectPaths = ({
  onClose,
  pathFolder,
  passPaths,
  selectedPaths,
  loader,
  version
}: {
  version: string
  loader: Loader
  onClose: () => void
  pathFolder: string
  passPaths: (paths: string[]) => void
  selectedPaths: string[]
}) => {
  const [isLoading, setIsLoading] = useState(true)
  const [paths, setPaths] = useState<string[]>(selectedPaths)
  const [allEntries, setAllEntries] = useState<DirectoryEntry[]>([])

  const { t } = useTranslation()

  const forbiddenSet = useMemo(() => {
    return new Set(
      notSupportedPaths.map((p) => p.replace('${version}', version).replace('${loader}', loader))
    )
  }, [version, loader])

  const visibleEntries = useMemo(() => {
    const entries = allEntries.filter((e) => e.path && !e.path.startsWith('.'))
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.path.localeCompare(b.path)
    })
    return entries
  }, [allEntries])

  useEffect(() => {
    let cancelled = false

    const loadEntries = async () => {
      if (!pathFolder) {
        setAllEntries([])
        setPaths([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const entries: DirectoryEntry[] = await api.fs.readdirWithTypes(pathFolder)
        if (cancelled) return

        setAllEntries(entries)

        const available = new Set(entries.map((e) => e.path))
        const existingSelected = selectedPaths
          .filter((p) => available.has(p))
          .filter((p) => !forbiddenSet.has(p) && !p.startsWith('.'))

        setPaths(existingSelected)
      } catch {
        if (cancelled) return
        setAllEntries([])
        setPaths([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadEntries()
    return () => {
      cancelled = true
    }
  }, [pathFolder, selectedPaths, forbiddenSet])

  const togglePath = useCallback((pathName: string) => {
    setPaths((prev) =>
      prev.includes(pathName) ? prev.filter((p) => p !== pathName) : [...prev, pathName]
    )
  }, [])

  return (
    <Modal
      isOpen={true}
      size="lg"
      onClose={() => {
        if (isLoading) return
        onClose()
      }}
      isDismissable={!isLoading}
    >
      <ModalContent>
        <ModalHeader>{t('selectPaths.title')}</ModalHeader>

        <ModalBody>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8">
              <Spinner size="sm" />
              <p>{t('selectPaths.loadingFolders')}</p>
            </div>
          ) : visibleEntries.length === 0 ? (
            <p className="text-center text-gray-500 py-8">{t('selectPaths.emptyFolder')}</p>
          ) : (
            <div className="flex flex-col gap-1 overflow-auto max-h-96 pr-1">
              {visibleEntries.map((entry) => {
                const isForbidden = forbiddenSet.has(entry.path)

                return (
                  <div key={entry.path} className="flex items-center gap-2">
                    <Checkbox
                      isSelected={paths.includes(entry.path)}
                      isDisabled={isLoading || isForbidden}
                      onValueChange={() => togglePath(entry.path)}
                    >
                      <div className="flex items-center space-x-1 min-w-0">
                        {entry.type === 'file' ? <File size={18} /> : <Folder size={18} />}
                        <p className={isForbidden ? 'text-gray-400' : ''}>{entry.path}</p>
                      </div>
                    </Checkbox>
                  </div>
                )
              })}
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex gap-2">
          <Button
            variant="flat"
            isDisabled={isLoading}
            onPress={() => {
              onClose()
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="flat"
            color="primary"
            isDisabled={isLoading}
            onPress={() => {
              passPaths(paths)
              onClose()
            }}
          >
            {t('common.choose')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
