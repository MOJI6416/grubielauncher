import {
  addToast,
  Alert,
  Button,
  Checkbox,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip
} from '@heroui/react'
import {
  accountAtom,
  authDataAtom,
  backendServiceAtom,
  consolesAtom,
  networkAtom,
  selectedVersionAtom,
  versionsAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { ArrowLeft, Trash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function DeleteVersion({ close }: { close: (isDeleted?: boolean) => void }) {
  const [version] = useAtom(selectedVersionAtom)
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation()
  const [fullDel, setFullDel] = useState(false)
  const [account] = useAtom(accountAtom)
  const [versions, setVersions] = useAtom(versionsAtom)
  const [isNetwork] = useAtom(networkAtom)
  const [shareDel, setShareDel] = useState(true)
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)
  const setConsoles = useAtom(consolesAtom)[1]

  return (
    <Modal
      isOpen={true}
      onClose={() => {
        if (isLoading) return
        close()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('common.confirmation')}</ModalHeader>

        <ModalBody>
          <div className="flex flex-col space-y-2 max-w-96">
            <Alert color="warning" title={t('versions.savesInfo')} />

            {version?.version.shareCode && !version.version.downloadedVersion && shareDel && (
              <Alert color="warning" title={t('versions.hostInfo')} />
            )}

            <div className="flex flex-col gap-2 items-center">
              <Tooltip content={t('versions.completeRemovalInfo')} color="danger" delay={500}>
                <Checkbox
                  isDisabled={isLoading}
                  isSelected={fullDel}
                  onChange={() => setFullDel((prev) => !prev)}
                >
                  {t('versions.completeRemoval')}
                </Checkbox>
              </Tooltip>
              {version?.version.shareCode && !version.version.downloadedVersion && (
                <Checkbox
                  isSelected={shareDel}
                  isDisabled={isLoading || !isNetwork}
                  onChange={() => {
                    setShareDel((prev) => !prev)
                  }}
                >
                  {t('versions.versionShareDel')}
                </Checkbox>
              )}
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="flex gap-2 items-center justify-center">
            <Button variant="flat" startContent={<ArrowLeft size={22} />} onPress={() => close()}>
              {t('versions.willReturn')}
            </Button>
            <Button
              color="danger"
              variant="flat"
              startContent={<Trash size={22} />}
              isLoading={isLoading}
              onPress={async () => {
                if (!version || !account || !versions) return

                const index = versions.indexOf(version)

                if (index == -1) return

                setIsLoading(true)

                if (
                  version.version.shareCode &&
                  !version.version.downloadedVersion &&
                  shareDel &&
                  isNetwork &&
                  authData
                ) {
                  await backendService.deleteModpack(version.version.shareCode)
                }

                try {
                  setConsoles((prev) => ({
                    consoles: prev.consoles.filter((c) => c.versionName != version.version.name)
                  }))

                  await version.delete(fullDel)

                  versions.splice(index, 1)
                  setVersions(versions)

                  addToast({
                    color: 'success',
                    title: t('versions.deleted')
                  })
                } catch (err) {
                  addToast({
                    color: 'danger',
                    title: t('versions.deleteError')
                  })
                } finally {
                  setIsLoading(false)
                  close(true)
                }
              }}
            >
              {t('common.delete')}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
