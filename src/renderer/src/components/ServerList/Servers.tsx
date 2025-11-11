import { IServer } from '@/types/ServersList'
import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tooltip,
  Image,
  Alert,
  Card,
  CardBody,
  ScrollShadow,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem
} from '@heroui/react'
import {
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  selectedVersionAtom
} from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Edit,
  EllipsisVertical,
  Gamepad2,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Plus,
  Trash,
  X,
  Zap
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreateServer } from './CreateServer'
import { RunGameParams } from '@renderer/App'

const api = window.api
const clipboard = api.clipboard

export function Servers({
  servers,
  setServers,
  closeModal,
  quickConnectIp,
  setQuickConnectIp,
  runGame,
  isAdding
}: {
  servers: IServer[]
  setServers: (servers: IServer[]) => void
  quickConnectIp: string | undefined
  setQuickConnectIp: (ip: string) => void
  closeModal: (isFull?: boolean) => void
  runGame?: (params: RunGameParams) => Promise<void>
  isAdding?: boolean
}) {
  const { t } = useTranslation()
  const [isDownloadedVersion] = useAtom(isDownloadedVersionAtom)
  const [isOwnerVersion] = useAtom(isOwnerVersionAtom)
  const [selectedVersion] = useAtom(selectedVersionAtom)
  const [isCreatingServer, setIsCreatingServer] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [processingIndex, setProcessingIndex] = useState<number | null>(null)

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          closeModal()
        }}
      >
        <ModalContent>
          <ModalHeader>
            <div className="flex items-center gap-2">
              {t('servers.title')}
              {!isDownloadedVersion && isOwnerVersion && (
                <div>
                  <Button
                    size="sm"
                    color="primary"
                    variant="flat"
                    isIconOnly
                    onPress={() => {
                      setIsCreatingServer(true)
                    }}
                  >
                    <Plus size={20} />
                  </Button>
                </div>
              )}
            </div>
          </ModalHeader>

          <ModalBody>
            <div className="max-h-96 w-full">
              {servers.length == 0 ? (
                <div className="flex w-full items-center">
                  <Alert title={t('worlds.noWorlds')} />
                </div>
              ) : (
                <ScrollShadow className="h-80">
                  <div className="flex flex-col gap-2 pr-1">
                    {servers.map((server, index) => (
                      <Card key={index}>
                        <CardBody>
                          <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {server.icon && (
                                <Image
                                  width={40}
                                  height={40}
                                  className="min-h-10 min-w-10 shrink-0"
                                  src={`data:image/png;base64,${server.icon}`}
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
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-semibold truncate">
                                      {server.name}
                                    </span>
                                    {quickConnectIp == server.ip && (
                                      <Tooltip content={t('servers.quickConnect')} delay={500}>
                                        <Zap size={16} color="yellow" className="shrink-0" />
                                      </Tooltip>
                                    )}
                                  </div>
                                  <span className="text-xs text-gray-400 truncate">
                                    {server.ip}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Tooltip
                                delay={500}
                                size="sm"
                                content={`${t('servers.resources')}: ${
                                  server.acceptTextures == null
                                    ? t('servers.resourceSets.0')
                                    : server.acceptTextures
                                      ? t('servers.resourceSets.1')
                                      : t('servers.resourceSets.2')
                                }`}
                              >
                                {isEditMode && processingIndex == index ? (
                                  <Button
                                    variant="flat"
                                    size="sm"
                                    isIconOnly
                                    onPress={() => {
                                      let newValue: number | null = server.acceptTextures

                                      if (newValue == null) newValue = 1
                                      else if (newValue) newValue = 0
                                      else newValue = null

                                      const newServers = [...servers]
                                      newServers[index] = {
                                        ...newServers[index],
                                        acceptTextures: newValue
                                      }

                                      setServers(newServers)
                                    }}
                                  >
                                    {server.acceptTextures == null ? (
                                      <PackageSearch size={20} />
                                    ) : server.acceptTextures ? (
                                      <PackageCheck size={20} />
                                    ) : (
                                      <PackageMinus size={20} />
                                    )}
                                  </Button>
                                ) : server.acceptTextures == null ? (
                                  <PackageSearch size={20} />
                                ) : server.acceptTextures ? (
                                  <PackageCheck size={20} />
                                ) : (
                                  <PackageMinus size={20} />
                                )}
                              </Tooltip>

                              {!isAdding && (
                                <div className="flex items-center gap-1">
                                  {isEditMode && processingIndex == index && (
                                    <Button
                                      variant="flat"
                                      size="sm"
                                      color={
                                        isEditMode && processingIndex === index
                                          ? 'success'
                                          : 'default'
                                      }
                                      isIconOnly
                                      isDisabled={
                                        editValue.trim() === '' ||
                                        editValue === server.name ||
                                        editValue.trim().length > 64
                                      }
                                      onPress={async () => {
                                        setProcessingIndex(index)

                                        const newServers = [...servers]
                                        newServers[index] = {
                                          ...newServers[index],
                                          name: editValue.trim()
                                        }
                                        setServers(newServers)

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
                                        ...(isDownloadedVersion || !isOwnerVersion
                                          ? ['edit', 'moveUp', 'moveDown', 'quickConnect', 'delete']
                                          : []),
                                        index == 0 ? 'moveUp' : '',
                                        index == servers.length - 1 ? 'moveDown' : ''
                                      ]}
                                    >
                                      <DropdownItem
                                        key="play"
                                        color="secondary"
                                        className="text-secondary"
                                        startContent={<Gamepad2 className="shrink-0" size={20} />}
                                        onPress={() => {
                                          if (!runGame) return

                                          runGame({
                                            version: selectedVersion,
                                            quick: {
                                              multiplayer: server.ip
                                            }
                                          })
                                          closeModal()
                                        }}
                                      >
                                        {t('nav.play')}
                                      </DropdownItem>

                                      <DropdownItem
                                        key="edit"
                                        variant="flat"
                                        startContent={<Edit size={20} />}
                                        onPress={() => {
                                          setIsEditMode(true)
                                          setEditValue(server.name)
                                          setProcessingIndex(index)
                                        }}
                                      >
                                        {t('common.edit')}
                                      </DropdownItem>
                                      <DropdownItem
                                        key="copyAdress"
                                        variant="flat"
                                        startContent={<Copy size={20} />}
                                        onPress={() => {
                                          clipboard.writeText(server.ip)
                                          addToast({
                                            title: t('common.copied')
                                          })
                                        }}
                                      >
                                        {t('servers.copyAddress')}
                                      </DropdownItem>
                                      <DropdownItem
                                        key="moveUp"
                                        variant="flat"
                                        startContent={<ChevronUp size={20} />}
                                        onPress={() => {
                                          const newServers = [...servers]
                                          if (index > 0) {
                                            const temp = newServers[index - 1]
                                            newServers[index - 1] = newServers[index]
                                            newServers[index] = temp
                                            setServers(newServers)
                                          }
                                        }}
                                      >
                                        {t('servers.moveUp')}
                                      </DropdownItem>
                                      <DropdownItem
                                        key="moveDown"
                                        variant="flat"
                                        startContent={<ChevronDown size={20} />}
                                        onPress={() => {
                                          const newServers = [...servers]
                                          if (index < servers.length - 1) {
                                            const temp = newServers[index + 1]
                                            newServers[index + 1] = newServers[index]
                                            newServers[index] = temp
                                            setServers(newServers)
                                          }
                                        }}
                                      >
                                        {t('servers.moveDown')}
                                      </DropdownItem>
                                      <DropdownItem
                                        key="quickConnect"
                                        variant="flat"
                                        startContent={
                                          <Zap
                                            color={`${quickConnectIp != server.ip ? 'yellow' : 'white'} `}
                                            size={20}
                                          />
                                        }
                                        onPress={() => {
                                          if (quickConnectIp == server.ip) setQuickConnectIp('')
                                          else setQuickConnectIp(server.ip)
                                        }}
                                      >
                                        {t('servers.quickConnect')}
                                      </DropdownItem>
                                      <DropdownItem
                                        key="delete"
                                        className="text-danger"
                                        variant="flat"
                                        color="danger"
                                        startContent={<Trash size={20} />}
                                        onPress={async () => {
                                          const newServers = [...servers]
                                          newServers.splice(index, 1)
                                          setServers(newServers)

                                          addToast({
                                            title: t('servers.deleted'),
                                            color: 'success'
                                          })
                                        }}
                                      >
                                        {t('common.delete')}
                                      </DropdownItem>
                                    </DropdownMenu>
                                  </Dropdown>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    ))}
                  </div>
                </ScrollShadow>
              )}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isCreatingServer && (
        <CreateServer
          onClose={() => setIsCreatingServer(false)}
          servers={servers}
          setQuickConnectIp={setQuickConnectIp}
          setServers={setServers}
        />
      )}
    </>
  )
}
