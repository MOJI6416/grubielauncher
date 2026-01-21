import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { IArguments } from '@/types/IArguments'
import { useAtom } from 'jotai'
import { isDownloadedVersionAtom, isOwnerVersionAtom } from '@renderer/stores/atoms'
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

  const canEdit = !isDownloadedVersion && isOwnerVersion

  const isChanged = useMemo(() => {
    const baseJvm = (runArguments?.jvm ?? '').trim()
    const baseGame = (runArguments?.game ?? '').trim()
    return jvmArguments.trim() !== baseJvm || gameArguments.trim() !== baseGame
  }, [jvmArguments, gameArguments, runArguments])

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
            {canEdit && <Alert color="warning" title={t('arguments.alert')} />}

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Textarea
                  label={t('arguments.jvm')}
                  minRows={1}
                  maxRows={3}
                  isDisabled={!canEdit}
                  value={jvmArguments}
                  onChange={(e) => setJvmArguments(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Textarea
                  label={t('arguments.game')}
                  maxRows={3}
                  minRows={1}
                  isDisabled={!canEdit}
                  value={gameArguments}
                  onChange={(e) => setGameArguments(e.target.value)}
                />
              </div>
            </div>
          </div>
        </ModalBody>

        {canEdit && (
          <ModalFooter>
            <Button
              variant="flat"
              startContent={<Save size={22} />}
              onPress={() => {
                setArguments({
                  jvm: jvmArguments.trim(),
                  game: gameArguments.trim()
                })
              }}
              color="success"
              isDisabled={!isChanged}
            >
              {t('common.save')}
            </Button>
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  )
}
