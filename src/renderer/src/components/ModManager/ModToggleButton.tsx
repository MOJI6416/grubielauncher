import { ILocalProject, ProjectType } from '@/types/ModManager'
import { addToast, Button } from '@heroui/react'
import { BookCheck, BookX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const { t } = useTranslation()

  const filename = mod.version?.files?.[0]?.filename ?? ''

  const [isEnabled, setIsEnabled] = useState<boolean>(true)
  const [isExists, setIsExists] = useState<boolean>(false)
  const [filePath, setFilePath] = useState<string>('')
  const [disabledFilePath, setDisabledFilePath] = useState<string>('')

  const [isToggling, setIsToggling] = useState(false)

  const isToggleAllowed = useMemo(() => {
    return (
      !isLoading &&
      !isToggling &&
      Boolean(mod.version) &&
      Boolean(filename) &&
      Boolean(versionPath) &&
      isExists &&
      mod.projectType !== ProjectType.WORLD &&
      mod.projectType !== ProjectType.DATAPACK
    )
  }, [isLoading, isToggling, mod.version, filename, versionPath, isExists, mod.projectType])

  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!mod.version || !filename || !versionPath) {
        if (cancelled) return
        setIsExists(false)
        setIsEnabled(true)
        setFilePath('')
        setDisabledFilePath('')
        return
      }

      try {
        const folderName = await api.modManager.ptToFolder(mod.projectType)
        const folderPath = await api.path.join(versionPath, folderName)

        const enabledPath = await api.path.join(folderPath, filename)
        const disabledPath = await api.path.join(folderPath, filename + '.disabled')

        const [enabledExists, disabledExists] = await Promise.all([
          api.fs.pathExists(enabledPath),
          api.fs.pathExists(disabledPath)
        ])

        if (cancelled) return

        setFilePath(enabledPath)
        setDisabledFilePath(disabledPath)

        setIsExists(Boolean(enabledExists || disabledExists))
        setIsEnabled(Boolean(enabledExists))
      } catch {
        if (cancelled) return
        setIsExists(false)
        setIsEnabled(true)
      }
    }

    init()

    return () => {
      cancelled = true
    }
  }, [mod.projectType, mod.version, filename, versionPath])

  const handleToggle = useCallback(async () => {
    if (!isToggleAllowed) return
    if (!filePath || !disabledFilePath) return

    const from = isEnabled ? filePath : disabledFilePath
    const to = isEnabled ? disabledFilePath : filePath

    setIsToggling(true)
    try {
      const fromExists = await api.fs.pathExists(from)
      if (!fromExists) {
        addToast({ color: 'warning', title: t('modManager.invalidMod') })
        return
      }

      await api.fs.rename(from, to)

      setIsEnabled((prev) => !prev)

      addToast({
        color: 'success',
        title: t(isEnabled ? 'modManager.disabled' : 'modManager.enabled')
      })
    } catch {
      addToast({
        color: 'danger',
        title: t('common.error')
      })
    } finally {
      setIsToggling(false)
    }
  }, [isToggleAllowed, filePath, disabledFilePath, isEnabled, t])

  return (
    <Button
      variant="flat"
      color={!isExists ? 'default' : isEnabled ? 'success' : 'warning'}
      isDisabled={!isToggleAllowed}
      isIconOnly
      onPress={handleToggle}
    >
      {isEnabled ? <BookCheck size={22} /> : <BookX size={22} />}
    </Button>
  )
}
