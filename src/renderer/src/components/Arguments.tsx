import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { IArguments } from '@/types/IArguments'
import { useAtom } from 'jotai'
import { isDownloadedVersionAtom, isOwnerVersionAtom } from '@renderer/stores/Main'
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea
} from '@heroui/react'

export function Arguments({
  onClose,
  runArguments,
  setArguments
}: {
  onClose: () => void
  runArguments?: IArguments
  setArguments: (args: IArguments) => void
}) {
  const { t } = useTranslation()

  const [jvmArguments, setJvmArguments] = useState(runArguments?.jvm || '')
  const [gameArguments, setGameArguments] = useState(runArguments?.game || '')
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)

  return (
    <Modal
      isOpen
      onClose={() => {
        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('arguments.title')}</ModalHeader>

        <ModalBody>
          <div className="flex flex-col gap-4">
            {!isDownloadedVersion && isOwnerVersion && (
              <Alert color="warning" title={t('arguments.alert')} />
            )}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 ">
                <Textarea
                  label={t('arguments.jvm')}
                  minRows={1}
                  maxRows={3}
                  isDisabled={isDownloadedVersion || !isOwnerVersion}
                  value={jvmArguments}
                  onChange={(e) => {
                    setJvmArguments(e.target.value)
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Textarea
                  label={t('arguments.game')}
                  maxRows={3}
                  minRows={1}
                  isDisabled={isDownloadedVersion || !isOwnerVersion}
                  value={gameArguments}
                  onChange={(e) => {
                    setGameArguments(e.target.value)
                  }}
                />
              </div>
            </div>
          </div>
        </ModalBody>

        {!isDownloadedVersion && isOwnerVersion && (
          <ModalFooter>
            <Button
              variant="flat"
              startContent={<Save size={22} />}
              onPress={() => {
                setArguments({ jvm: jvmArguments, game: gameArguments })
              }}
              color={'success'}
              isDisabled={jvmArguments == runArguments?.jvm && gameArguments == runArguments?.game}
            >
              {t('common.save')}
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  )
}
