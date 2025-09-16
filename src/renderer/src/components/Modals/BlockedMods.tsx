import {
  Alert,
  Button,
  Card,
  CardBody,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader
} from '@heroui/react'
import { ILocalProject, ProjectType, Provider } from '@/types/ModManager'
import { ExternalLink, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { projetTypeToFolder } from '@renderer/utilities/ModManager'

const api = window.api
const shell = api.shell
const getPath = api.getPath
const fs = api.fs
const path = api.path

export interface IBlockedMod {
  projectId: string
  fileName: string
  hash: string
  url: string
  filePath?: string
}

export async function checkBlockedMods(mods: ILocalProject[], versionPath?: string) {
  if (mods.length === 0) return []

  const blockedMods: IBlockedMod[] = []

  for (const mod of mods) {
    if (mod.provider != Provider.CURSEFORGE) continue
    const file = mod.version?.files[0]
    if (!file || !file.url) continue

    if (!file.url.startsWith('blocked::')) continue

    if (versionPath) {
      let folderName = projetTypeToFolder(mod.projectType)
      if (mod.projectType == ProjectType.WORLD) folderName = path.join('storage', 'worlds')
      const filePath = path.join(versionPath, folderName, file.filename)
      try {
        await fs.access(filePath)
        continue
      } catch {}
    }

    blockedMods.push({
      fileName: file.filename,
      hash: file.sha1,
      url: file.url.replace('blocked::', ''),
      projectId: mod.id
    })
  }

  return blockedMods
}

export function BlockedMods({
  onClose,
  mods
}: {
  onClose: (mods: IBlockedMod[]) => void
  mods: IBlockedMod[]
}) {
  const [blockedMods, setBlockedMods] = useState<IBlockedMod[]>(mods)
  const [downloadsPath, setDownloadsPath] = useState<string>('')
  const [viewMode, setViewMode] = useState<'all' | 'notInstalled'>('notInstalled')

  const intervalRef = useRef<NodeJS.Timeout>(null)

  useEffect(() => {
    let isMounted = true

    async function check(downloadsPath: string) {
      const files = await fs.readdir(downloadsPath)
      const blockedNames = blockedMods.map((mod) => mod.fileName)
      let found = false

      for (const file of files) {
        if (!blockedNames.includes(file)) continue

        let filePath = path.join(downloadsPath, file)

        const blockedMod = blockedMods.find((mod) => mod.fileName === file)
        if (!blockedMod) continue

        const hash = await api.getSha1(filePath)

        if (hash !== blockedMod.hash) continue

        blockedMod.filePath = filePath
        found = true
      }

      for (const mod of blockedMods.filter((mod) => mod.filePath)) {
        if (!mod.filePath) continue

        try {
          await fs.access(mod.filePath)
        } catch {
          mod.filePath = undefined
          found = true
        }
      }

      if (found && isMounted) {
        setBlockedMods((prev) => [...prev])
      }
    }

    getPath('downloads').then((path: string) => {
      if (!isMounted) return

      setDownloadsPath(path)

      intervalRef.current = setInterval(() => {
        check(path)
      }, 1000)
    })

    return () => {
      isMounted = false
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  useEffect(() => {
    if (blockedMods.filter((mod) => !mod.filePath).length === 0) {
      onClose(blockedMods)
    }
  }, [blockedMods])

  const { t } = useTranslation()

  return (
    <>
      <Modal
        isOpen={true}
        size="xl"
        isDismissable={false}
        isKeyboardDismissDisabled={true}
        onClose={() => {
          onClose([])
        }}
      >
        <ModalContent>
          <ModalHeader>{t('blockedMods.title')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col space-y-2">
              <Alert color="warning" title={t('blockedMods.description')} />
              <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <p>
                    {t('blockedMods.files')} ({blockedMods.length})
                  </p>
                  <Button
                    variant="flat"
                    size="sm"
                    isIconOnly
                    isDisabled={blockedMods.filter((mod) => !!mod.filePath).length == 0}
                    color={viewMode === 'notInstalled' ? 'warning' : undefined}
                    onPress={() => {
                      setViewMode((prev) => (prev === 'all' ? 'notInstalled' : 'all'))
                    }}
                  >
                    <Eye size={22} />
                  </Button>
                </div>
                <div className="max-h-[215px] overflow-auto pr-1">
                  {blockedMods.length > 0 &&
                    blockedMods
                      .filter((mod) => {
                        if (viewMode === 'all') return true
                        return !mod.filePath
                      })
                      .map((mod, index) => (
                        <Card key={index} className="mb-2">
                          <CardBody>
                            <div className="flex justify-between space-x-2 items-center">
                              <div className="flex flex-col">
                                <p
                                  className={`text-sm font-semibold ${mod.filePath ? 'text-success' : 'text-warning'}`}
                                >
                                  {mod.fileName}
                                </p>
                                <p className="text-xs text-gray-400">{mod.hash}</p>
                              </div>
                              {!mod.filePath && (
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  className="text-xs"
                                  onPress={() => {
                                    shell.openExternal(mod.url)
                                  }}
                                >
                                  {<ExternalLink size={22} />}
                                </Button>
                              )}
                            </div>
                          </CardBody>
                        </Card>
                      ))}
                </div>
              </div>
              <p className="text-primary-500 text-sm font-semibold">
                {t('blockedMods.watchedFolder')}: {downloadsPath}
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                blockedMods
                  .filter((mod) => !mod.filePath)
                  .forEach((mod) => {
                    shell.openPath(mod.url)
                  })
              }}
            >
              {t('blockedMods.openAll')}
            </Button>
            <Button variant="flat" color="danger" onPress={() => onClose([])}>
              {t('common.close')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
