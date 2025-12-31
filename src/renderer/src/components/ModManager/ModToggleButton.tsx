import { ILocalProject, ProjectType } from '@/types/ModManager'
import { addToast, Button } from '@heroui/react'
import { BookCheck, BookX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api

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
  const [filePath, setFilePath] = useState('')
  const [disabledFilePath, setDisabledFilePath] = useState('')

  const { t } = useTranslation()

  const filename = mod.version?.files[0]?.filename || ''

  useEffect(() => {
    async function init() {
      const folderName = await api.modManager.ptToFolder(mod.projectType)
      const folderPath = await api.path.join(versionPath, folderName)
      const filePath = await api.path.join(folderPath, filename)
      const disabledFilePath = await api.path.join(folderPath, filename + '.disabled')

      setFilePath(filePath)
      setDisabledFilePath(disabledFilePath)
      api.fs.pathExists(filePath).then((exists) => {
        setIsEnabled(exists)
        setIsExists(exists)

        if (!exists)
          api.fs.pathExists(disabledFilePath).then((disabledExists) => {
            setIsEnabled(!disabledExists)
            setIsExists(disabledExists)
          })
      })
    }

    init()
  }, [])

  const handleToggle = async () => {
    const filepath = !isEnabled ? disabledFilePath : filePath
    const newFilePath = isEnabled ? disabledFilePath : filePath

    await api.fs.rename(filepath, newFilePath)

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
