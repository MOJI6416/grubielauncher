import { Alert, Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/react'
import { IVersionStatistics } from '@/types/VersionStatistics'
import { useTranslation } from 'react-i18next'
import { formatDate, formatTime } from '@renderer/utilities/date'

export function VersionStatistics({
  onClose,
  statistics
}: {
  onClose: () => void
  statistics: IVersionStatistics
}) {
  const { t } = useTranslation()
  return (
    <Modal
      isOpen={true}
      onClose={() => {
        onClose()
      }}
    >
      <ModalContent>
        <ModalHeader>{t('versionStatistics.title')}</ModalHeader>

        <ModalBody>
          <div className="flex flex-col gap-1">
            {!statistics && <Alert title={t('versionStatistics.error')} />}
            {statistics && (
              <>
                <div className="flex items-center gap-2">
                  <p>{t('versionStatistics.playTime')}:</p>
                  <p>
                    {formatTime(statistics.playTime, {
                      h: t('time.h'),
                      m: t('time.m'),
                      s: t('time.s')
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p>{t('versionStatistics.launches')}:</p>
                  <p>{statistics.launches}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p>{t('versionStatistics.lastLaunch')}:</p>
                  <p>{formatDate(new Date(statistics.lastLaunched))}</p>
                </div>
              </>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
