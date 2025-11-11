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
import { notSupportedPaths } from '@renderer/utilities/Files'

const api = window.api
const fs = api.fs
const path = api.path
const isDirectory = api.isDirectory

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
  const [isLoading, setIsLoading] = useState(false)
  const [paths, setPaths] = useState<string[]>([])
  const [allPaths, setAllPaths] = useState<{ path: string; type: 'file' | 'folder' }[]>([])

  const { t } = useTranslation()

  useEffect(() => {
    ;(async () => {
      setIsLoading(true)
      const files = await fs.readdir(pathFolder)

      setPaths(selectedPaths.filter((p) => files.includes(p)))
      setAllPaths(
        files
          .map((p) => ({
            path: p,
            type: isDirectory(path.join(pathFolder, p))
              ? ('folder' as 'folder')
              : ('file' as 'file')
          }))
          .sort((a, b) => {
            if (a.type === 'folder' && b.type === 'file') return -1
            if (a.type === 'file' && b.type === 'folder') return 1
            return a.path.localeCompare(b.path)
          })
      )
      setIsLoading(false)
    })()
  }, [])

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        if (isLoading) return

        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('selectPaths.title')}</ModalHeader>

        <ModalBody>
          {isLoading ? (
            <div className="flex items-center text-center gap-2">
              <Spinner size="sm" />
              <p>{t('selectPaths.loadingFolders')}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 overflow-auto max-h-96 pr-1">
              {allPaths.map((p) => (
                <div key={p.path} className="flex items-center gap-2">
                  <Checkbox
                    isSelected={paths.includes(p.path)}
                    isDisabled={
                      isLoading ||
                      p[0] === '.' ||
                      notSupportedPaths
                        .map((p) => p.replace('${version}', version).replace('${loader}', loader))
                        .includes(p.path)
                    }
                    onChange={() => {
                      if (paths.includes(p.path)) {
                        setPaths(paths.filter((path) => path !== p.path))
                      } else {
                        setPaths([...paths, p.path])
                      }
                    }}
                  >
                    <div className="flex items-center space-x-1">
                      {p.type == 'file' ? <File size={18} /> : <Folder size={18} />}
                      <p>{p.path}</p>
                    </div>
                  </Checkbox>
                </div>
              ))}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="flat"
            isDisabled={isLoading}
            color="primary"
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
