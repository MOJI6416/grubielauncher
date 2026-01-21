import { FolderArchive, FolderSearch2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom } from 'jotai'
import { selectedVersionAtom } from '@renderer/stores/atoms'
import {
  addToast,
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip
} from '@heroui/react'

const api = window.api

export function Export({ versionPath, onClose }: { versionPath: string; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false)
  const [folderPath, setPath] = useState<string>('')
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const { t } = useTranslation()

  return (
    <Modal
      size="xs"
      isOpen={true}
      onClose={() => {
        if (isLoading) return
        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('export.title')}</ModalHeader>

        <ModalBody>
          <div className="flex flex-col gap-2">
            {!folderPath && <Alert color="warning" title={t('export.selectFolder')} />}
            <Tooltip content={folderPath} isDisabled={!folderPath} placement="right">
              <Button
                isDisabled={isLoading}
                variant="flat"
                onPress={async () => {
                  const folders = await api.other.openFileDialog(true)
                  const picked = folders?.[0] || ''
                  if (!picked) return
                  setPath(picked)
                }}
                startContent={<FolderSearch2 size={22} />}
              >
                {t('common.choose')}
              </Button>
            </Tooltip>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button
            variant="flat"
            startContent={<FolderArchive size={22} />}
            isLoading={isLoading}
            color="primary"
            isDisabled={!folderPath || isLoading}
            onPress={async () => {
              if (!selectedVersion || !folderPath) return

              const owner = selectedVersion.version.owner
              const downloadedVersion = selectedVersion.version.downloadedVersion
              const shareCode = selectedVersion.version.shareCode

              try {
                setIsLoading(true)

                selectedVersion.version.owner = undefined
                selectedVersion.version.downloadedVersion = false
                selectedVersion.version.shareCode = undefined

                await selectedVersion.save()

                const dir = await api.fs.readdir(versionPath)

                const files: string[] = []
                for (const file of dir) {
                  if (file === 'statistics.json') continue
                  files.push(await api.path.join(versionPath, file))
                }

                const zipPath = await api.path.join(
                  folderPath,
                  `${selectedVersion.version.name}.zip`
                )

                await api.file.archiveFiles(files, zipPath)

                onClose()
                addToast({
                  title: t('export.success'),
                  color: 'success'
                })
              } catch (err) {
                addToast({
                  title: t('export.error'),
                  color: 'danger'
                })
              } finally {
                try {
                  selectedVersion.version.owner = owner
                  selectedVersion.version.downloadedVersion = downloadedVersion
                  selectedVersion.version.shareCode = shareCode
                  await selectedVersion.save()
                } catch {}

                setIsLoading(false)
              }
            }}
          >
            {t('export.btn')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
