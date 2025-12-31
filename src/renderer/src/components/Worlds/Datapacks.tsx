import { ILocalProject } from '@/types/ModManager'
import { IWorld } from '@/types/World'
import {
  Alert,
  Button,
  Card,
  CardBody,
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ScrollShadow,
  Select,
  SelectItem
} from '@heroui/react'
import { Folder, PackagePlus, Trash } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const api = window.api

export function Datapacks({
  onClose,
  world,
  datapacks
}: {
  onClose: () => void
  world: IWorld
  datapacks: { mod: ILocalProject; path: string; filename: string }[]
}) {
  const [datapackName, setDatapackName] = useState<string>('')
  const [disabledKeys, setDisabledKeys] = useState<string[]>(world.datapacks)

  const { t } = useTranslation()

  function DatapackItem({ fileName }: { fileName: string }) {
    const datapackInfo = {
      id: fileName,
      title: fileName,
      isLocal: true,
      icon: '',
      path: `${world.path}/datapacks/${fileName}`
    }

    const datapack = datapacks.find((dp) => dp.mod.version?.files[0].filename === fileName)
    if (datapack) {
      datapackInfo.id = datapack.mod.id
      datapackInfo.title = datapack.mod.title
      datapackInfo.isLocal = false
      if (datapack.mod.iconUrl) datapackInfo.icon = datapack.mod.iconUrl
    }

    return (
      <Card>
        <CardBody>
          <div className="flex items-center justify-between gap-4 min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              {datapackInfo.icon && (
                <Image src={datapackInfo.icon} width={32} height={32} className="min-h-8 min-w-8" />
              )}
              <p className="text-sm truncate min-w-0">{datapackInfo.title}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="flat"
                color="danger"
                size="sm"
                isIconOnly
                onPress={async () => {
                  try {
                    await api.fs.rimraf(datapackInfo.path)
                    world.datapacks = world.datapacks.filter((dp) => dp !== fileName)
                    setDisabledKeys(disabledKeys.filter((key) => key !== fileName))
                  } catch {}
                }}
              >
                <Trash size={20} />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Modal isOpen onClose={() => onClose()}>
      <ModalContent>
        <ModalHeader>{t('worlds.datapacks')}</ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            <div className="flex items-cente gap-2">
              <Select
                isDisabled={!datapacks.length}
                selectedKeys={[datapackName]}
                onChange={(e) => setDatapackName(e.target.value)}
                disabledKeys={disabledKeys}
              >
                {datapacks.map((dp) => (
                  <SelectItem key={dp.filename}>{dp.mod.title}</SelectItem>
                ))}
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  isDisabled={!datapackName}
                  variant="flat"
                  color="primary"
                  isIconOnly
                  onPress={async () => {
                    if (!datapackName) return
                    const datapack = datapacks.find(
                      async (dp) => (await api.path.basename(dp.path)) === datapackName
                    )
                    if (!datapack) return

                    const datapackPath = await api.path.join(world.path, 'datapacks', datapackName)

                    try {
                      await api.fs.copy(datapack.path, datapackPath)
                      world.datapacks.push(datapackName)
                      setDisabledKeys([...disabledKeys, datapackName])
                    } catch {}

                    setDatapackName('')
                  }}
                >
                  <PackagePlus size={22} />
                </Button>
                <Button
                  variant="flat"
                  isIconOnly
                  onPress={async () => {
                    await api.shell.openPath(await api.path.join(world.path, 'datapacks'))
                  }}
                >
                  <Folder size={22} />
                </Button>
              </div>
            </div>
            {world.datapacks.length > 0 ? (
              <ScrollShadow className="max-h-64">
                <div className="flex flex-col gap-2">
                  {world.datapacks.map((d, i) => (
                    <DatapackItem fileName={d} key={i} />
                  ))}
                </div>
              </ScrollShadow>
            ) : (
              <Alert title={t('worlds.noDatapacks')} />
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
