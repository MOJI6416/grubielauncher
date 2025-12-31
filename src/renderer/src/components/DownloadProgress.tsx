import { DownloaderInfo } from '@/types/Downloader'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  Progress,
  Chip
} from '@heroui/react'
import { formatBytes } from '@renderer/utilities/file'
import { useTranslation } from 'react-i18next'

export function DownloadProgress({ info }: { info: DownloaderInfo }) {
  const { t } = useTranslation()

  const sizes = [t('sizes.0'), t('sizes.1'), t('sizes.2'), t('sizes.3'), t('sizes.4')]
  const timeUnits = [t('timeUnits.0'), t('timeUnits.1'), t('timeUnits.2'), t('timeUnits.3')]

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond, sizes)}/s`
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}${timeUnits[0]}`
    if (seconds < 3600)
      return `${Math.floor(seconds / 60)}${timeUnits[1]} ${seconds % 60}${timeUnits[0]}`
    return `${Math.floor(seconds / 3600)}${timeUnits[2]} ${Math.floor((seconds % 3600) / 60)}${timeUnits[1]}`
  }

  return (
    <Drawer isOpen placement="bottom" hideCloseButton>
      <DrawerContent>
        <DrawerHeader className="flex flex-col gap-1">{t('downloadProgress.title')}</DrawerHeader>
        <DrawerBody className="gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium truncate max-w-[70%]">
                {info.currentFileName || t('downloadProgress.preparing')}
              </span>
              <span className="text-sm text-default-500">{info.progressPercent}%</span>
            </div>

            <Progress
              value={info.progressPercent}
              isIndeterminate={info.progressPercent === 0}
              maxValue={100}
              size="sm"
              color="primary"
              showValueLabel={false}
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Chip size="sm" variant="flat">
              {t('downloadProgress.files')}: {info.completedItems}/{info.totalItems}
            </Chip>

            {info.failedItems > 0 ? (
              <Chip size="sm" variant="flat" color="danger">
                {t('downloadProgress.failed')}: {info.failedItems}
              </Chip>
            ) : null}

            {info.downloadSpeed && info.downloadSpeed > 0 ? (
              <Chip size="sm" variant="flat" color="success">
                {formatSpeed(info.downloadSpeed)}
              </Chip>
            ) : null}

            {info.estimatedTimeRemaining && info.estimatedTimeRemaining > 0 ? (
              <Chip size="sm" variant="flat" color="primary">
                {t('downloadProgress.timeRemaining')}: {formatTime(info.estimatedTimeRemaining)}
              </Chip>
            ) : null}
          </div>

          {info.totalBytes > 0 && (
            <div className="flex justify-between text-xs text-default-500">
              <span>{formatBytes(info.downloadedBytes, sizes)}</span>
              <span>{formatBytes(info.totalBytes, sizes)}</span>
            </div>
          )}
        </DrawerBody>
        <DrawerFooter></DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
