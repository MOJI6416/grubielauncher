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
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const loadEntries = async () => {
      if (!pathFolder) return

      setIsLoading(true)
      try {
        const entries = await api.fs.readdirWithTypes(pathFolder)
        setAllEntries(entries)

        const existingSelected = selectedPaths.filter((p: string) =>
          entries.some((e: DirectoryEntry) => e.path === p)
        )
        setPaths(existingSelected)
      } catch {
        setAllEntries([])
        setPaths([])
      } finally {
        setIsLoading(false)
      }
    }

    loadEntries()
  }, [pathFolder, selectedPaths])

  const forbiddenPaths = notSupportedPaths.map((p) =>
    p.replace('${version}', version).replace('${loader}', loader)
  )

  const togglePath = (pathName: string) => {
    setPaths((prev) =>
      prev.includes(pathName) ? prev.filter((p) => p !== pathName) : [...prev, pathName]
    )
  }

  return (
    <Modal
      isOpen={true}
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
          ) : allEntries.length === 0 ? (
            <p className="text-center text-gray-500 py-8">{t('selectPaths.emptyFolder')}</p>
          ) : (
            <div className="flex flex-col gap-1 overflow-auto max-h-96 pr-1">
              {allEntries.map((entry) => {
                const isHidden = entry.path.startsWith('.')
                const isForbidden = forbiddenPaths.includes(entry.path)

                return (
                  <div key={entry.path} className="flex items-center gap-2">
                    <Checkbox
                      isSelected={paths.includes(entry.path)}
                      isDisabled={isLoading || isHidden || isForbidden}
                      onChange={() => togglePath(entry.path)}
                    >
                      <div className="flex items-center space-x-1">
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

        <ModalFooter>
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
