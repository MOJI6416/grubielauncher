import { ILocalProject, ProjectType } from '@/types/ModManager'
import { addToast, Button } from '@heroui/react'
import { projetTypeToFolder } from '@renderer/utilities/ModManager'
import { BookCheck, BookX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api
const fs = api.fs
const path = api.path

export const ModToggleButton = ({
  mod,
  isLoading,
  versionPath
}: {
  mod: ILocalProject
  isLoading: boolean
  versionPath: string
}) => {
  const [isEnabled, setIsEnabled] = useState(true)
  const [isExists, setIsExists] = useState(false)

  const { t } = useTranslation()

  const filename = mod.version?.files[0]?.filename || ''
  const folderName = projetTypeToFolder(mod.projectType)
  const folderPath = path.join(versionPath, folderName)
  const filePath = path.join(folderPath, filename)
  const disabledFilePath = path.join(folderPath, filename + '.disabled')

  useEffect(() => {
    fs.pathExists(filePath).then((exists) => {
      setIsEnabled(exists)
      setIsExists(exists)

      if (!exists)
        fs.pathExists(disabledFilePath).then((disabledExists) => {
          setIsEnabled(!disabledExists)
          setIsExists(disabledExists)
        })
    })
  }, [])

  const handleToggle = async () => {
    const filepath = !isEnabled ? disabledFilePath : filePath
    const newFilePath = isEnabled ? disabledFilePath : filePath

    await fs.rename(filepath, newFilePath)

    setIsEnabled(!isEnabled)

    addToast({
      color: 'success',
      title: t(isEnabled ? 'modManager.disabled' : 'modManager.enabled')
    })
  }

  return (
    <Button
      variant="flat"
      color={!isExists ? 'default' : isEnabled ? 'success' : 'warning'}
      isDisabled={
        isLoading ||
        !mod.version ||
        !isExists ||
        mod.projectType == ProjectType.WORLD ||
        mod.projectType == ProjectType.DATAPACK
      }
      isIconOnly
      onPress={handleToggle}
    >
      {isEnabled ? <BookCheck size={22} /> : <BookX size={22} />}
    </Button>
  )
}
