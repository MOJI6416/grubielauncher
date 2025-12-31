import { IWorld } from '@/types/World'
import {
  addToast,
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Image,
  Input,
  ScrollShadow
} from '@heroui/react'
import { RunGameParams } from '@renderer/App'
import { selectedVersionAtom } from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import {
  Clock,
  Copy,
  Edit,
  EllipsisVertical,
  Folder,
  Gamepad2,
  ImageOff,
  Package,
  Trash,
  X
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Datapacks } from './Datapacks'
import { ILocalProject, ProjectType } from '@/types/ModManager'
import { formatTime } from '@renderer/utilities/date'

const api = window.api

export function WorldList({
  worlds,
  setWorlds,
  isOwner,
  runGame,
  closeModal
}: {
  worlds: IWorld[]
  setWorlds: (worlds: IWorld[]) => void
  isOwner: boolean
  runGame: (params: RunGameParams) => Promise<void>
  closeModal: () => void
}) {
  const [processingIndex, setProcessingIndex] = useState<number | null>(null)
  const [version] = useAtom(selectedVersionAtom)
  const [editValue, setEditValue] = useState<string>('')
  const [isEditMode, setIsEditMode] = useState(false)
  const [isDatapacksOpen, setIsDatapacksOpen] = useState(false)
  const [selectedWorld, setSelectedWorld] = useState<IWorld | null>(null)
  const [datapacks, setDatapacks] = useState<
    { mod: ILocalProject; path: string; filename: string }[]
  >([])

  useEffect(() => {
    ;(async () => {
      if (!version) {
        setDatapacks([])
        return
      }

      const mods = version.version.loader.mods.filter((m) => m.projectType === ProjectType.DATAPACK)
      const folderPath = await api.path.join(
        version.versionPath,
        await api.modManager.ptToFolder(ProjectType.DATAPACK)
      )
      const datapacks: {
        mod: ILocalProject
        path: string
        filename: string
      }[] = []

      for (const mod of mods) {
        const modPath = await api.path.join(folderPath, mod.version?.files[0].filename || '')
        if (!(await api.fs.pathExists(modPath))) continue

        datapacks.push({
          mod,
          path: modPath,
          filename: await api.path.basename(modPath)
        })
      }

      setDatapacks(datapacks)
    })()
  }, [version])

  const { t } = useTranslation()

  return (
    <>
      <ScrollShadow className="h-80 w-full min-w-0">
        <div className="flex flex-col gap-2 pr-1 min-w-0">
          {worlds.map((world, index) => (
            <Card>
              <CardBody>
                <div className="flex items-center gap-3 justify-between min-w-0">
                  <div key={world.name} className="flex items-center space-x-2 min-w-0">
                    {world.icon && (
                      <Image
                        src={world.icon}
                        alt={`${world.name} icon`}
                        width={40}
                        height={40}
                        className="min-h-10 min-w-10 shrink-0"
                      />
                    )}
                    {isEditMode && processingIndex == index ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        size="sm"
                      />
                    ) : (
                      <div className="flex flex-col min-w-0">
                        <p className="text-sm font-semibold truncate">{world.name}</p>
                        {world.name !== world.folderName && (
                          <p className="text-xs text-gray-400 truncate">{world.folderName}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    {world.statistics && !isEditMode && (
                      <div className="flex items-center gap-1">
                        <Clock className="text-gray-400 shrink-0" size={18} />
                        <p className="text-xs text-gray-400">
                          {formatTime(
                            (world.statistics.stats['minecraft:custom']['minecraft:play_time'] *
                              50) /
                              1000,
                            {
                              h: t('time.h'),
                              m: t('time.m'),
                              s: t('time.s')
                            }
                          )}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      {isEditMode && processingIndex == index && (
                        <Button
                          variant="flat"
                          size="sm"
                          color={isEditMode && processingIndex === index ? 'success' : 'default'}
                          isIconOnly
                          isDisabled={
                            editValue.trim() === '' ||
                            editValue === world.name ||
                            worlds.some((w) => w.name === editValue) ||
                            editValue.trim().length > 64
                          }
                          onPress={async () => {
                            setProcessingIndex(index)

                            const result = await (world.path, editValue.trim())

                            if (!result) {
                              addToast({
                                title: t('worlds.renameError'),
                                color: 'danger'
                              })

                              setProcessingIndex(null)
                              setEditValue('')
                              setIsEditMode(false)
                              return
                            }

                            const i = worlds.findIndex((w) => w.path === world.path)
                            if (i !== -1) {
                              worlds[i].name = editValue.trim()
                              worlds[i].path = result
                              worlds[i].folderName = result.split('\\').pop() || ''
                              if (world.icon) worlds[i].icon = `${result}/icon.png`

                              setWorlds([...worlds])
                            }

                            setIsEditMode(false)
                            setEditValue('')
                            setProcessingIndex(null)
                          }}
                        >
                          <Edit size={20} />
                        </Button>
                      )}

                      {isEditMode && processingIndex === index && (
                        <Button
                          variant="flat"
                          color="danger"
                          size="sm"
                          isIconOnly
                          onPress={() => {
                            setIsEditMode(false)
                            setEditValue('')
                            setProcessingIndex(null)
                          }}
                        >
                          <X size={20} />
                        </Button>
                      )}
                      <Dropdown isTriggerDisabled={isEditMode} key={index} size="sm">
                        <DropdownTrigger>
                          <Button isIconOnly variant="flat" size="sm">
                            <EllipsisVertical size={22} />
                          </Button>
                        </DropdownTrigger>
                        <DropdownMenu
                          disabledKeys={[
                            !version?.isQuickPlayMultiplayer ? 'play' : '',
                            ...(!isOwner
                              ? ['datapacks', 'rename', 'resetIcon', 'openFolder', 'delete']
                              : []),
                            ...(world.isDownloaded ? ['rename', 'delete'] : []),
                            !world.icon ? 'resetIcon' : ''
                          ]}
                        >
                          <DropdownItem
                            key="play"
                            color="secondary"
                            className="text-secondary"
                            startContent={<Gamepad2 className="shrink-0" size={20} />}
                            onPress={() => {
                              runGame({
                                version,
                                quick: {
                                  single: world.folderName
                                }
                              })
                              closeModal()
                            }}
                          >
                            {t('nav.play')}
                          </DropdownItem>
                          <DropdownItem
                            key="datapacks"
                            variant="flat"
                            className="text-primary-500"
                            color="primary"
                            startContent={<Package size={20} />}
                            onPress={() => {
                              setSelectedWorld(world)
                              setIsDatapacksOpen(true)
                            }}
                          >
                            {t('worlds.datapacks')}
                          </DropdownItem>
                          <DropdownItem
                            key="rename"
                            variant="flat"
                            startContent={<Edit size={20} />}
                            onPress={() => {
                              setIsEditMode(true)
                              setEditValue(world.name)
                              setProcessingIndex(index)
                            }}
                          >
                            {t('common.rename')}
                          </DropdownItem>
                          <DropdownItem
                            key="copySeed"
                            variant="flat"
                            startContent={<Copy size={20} />}
                            onPress={async () => {
                              await api.clipboard.writeText(world.seed)
                              addToast({
                                title: t('common.copied')
                              })
                            }}
                          >
                            {t('worlds.copySeed')}
                          </DropdownItem>
                          <DropdownItem
                            key="resetIcon"
                            variant="flat"
                            startContent={<ImageOff size={20} />}
                            onPress={async () => {
                              try {
                                await api.fs.rimraf(await api.path.join(world.path, 'icon.png'))

                                setWorlds(
                                  worlds.map((w) =>
                                    w.path === world.path ? { ...w, icon: undefined } : w
                                  )
                                )
                              } catch {}
                            }}
                          >
                            {t('worlds.resetIcon')}
                          </DropdownItem>
                          <DropdownItem
                            key="openFolder"
                            variant="flat"
                            startContent={<Folder size={20} />}
                            onPress={async () => await api.shell.openPath(world.path)}
                          >
                            {t('worlds.openFolder')}
                          </DropdownItem>
                          <DropdownItem
                            key="delete"
                            className="text-danger"
                            variant="flat"
                            color="danger"
                            startContent={<Trash size={20} />}
                            onPress={async () => {
                              try {
                                await api.fs.rimraf(world.path)
                                setWorlds(worlds.filter((w) => w.path !== world.path))

                                addToast({
                                  title: t('worlds.deleted'),
                                  color: 'success'
                                })
                              } catch {
                                addToast({
                                  title: t('worlds.deleteError'),
                                  color: 'danger'
                                })
                              }
                            }}
                          >
                            {t('common.delete')}
                          </DropdownItem>
                        </DropdownMenu>
                      </Dropdown>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      </ScrollShadow>

      {isDatapacksOpen && version && selectedWorld && (
        <Datapacks
          datapacks={datapacks}
          onClose={() => setIsDatapacksOpen(false)}
          world={selectedWorld}
        />
      )}
    </>
  )
}
