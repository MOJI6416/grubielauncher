import { IBackendServer, IModpack } from '@/types/Backend'
import { CirclePlus, EthernetPort, Gamepad2, Link2, Minus, Users, ScanFace } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { IServer as IServerSM } from '@/types/ServersList'
import { FaDiscord, FaMicrosoft } from 'react-icons/fa'
import { TbSquareLetterE } from 'react-icons/tb'
import { useAtom } from 'jotai'
import { accountAtom, versionsAtom } from '@renderer/stores/Main'
import { AddVersion } from '../Modals/Version/AddVersion'
import {
  addToast,
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Tooltip,
  Image,
  Card,
  CardBody
} from '@heroui/react'
import { isOwner } from '@renderer/utilities/version'

const api = window.api

interface IVersionServer {
  version: string
  servers: IServerSM[]
  path: string
}

export function ServerInfo({ onClose, server }: { onClose: () => void; server: IBackendServer }) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<'versions' | 'add' | 'delete' | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [proccessKey, setProccessKey] = useState<number | null>(null)
  const [account] = useAtom(accountAtom)
  const [versionsServers, setVersionsServers] = useState<IVersionServer[]>([])
  const [versions] = useAtom(versionsAtom)
  const [isAddVersion, setIsAddVersion] = useState(false)
  const [tempModpack, setTempModpack] = useState<IModpack>()

  async function getVersionsServers() {
    setIsLoading(true)
    setLoadingType('versions')

    const versionsServers = await api.servers.versions(
      versions
        .filter((v) => v.version.owner && isOwner(v.version.owner, account))
        .map((v) => v.version)
    )

    setVersionsServers(versionsServers)
    setIsLoading(false)
    setLoadingType(null)
  }

  async function addServer(key: number, servers: IVersionServer) {
    try {
      setIsLoading(true)
      setLoadingType('add')
      setProccessKey(key)

      await api.servers.write(
        servers.servers.concat({
          ip: server.address,
          name: server.name,
          acceptTextures: null
        }),
        servers.path
      )

      await getVersionsServers()

      addToast({
        title: t('serverInfo.serverAdded'),
        color: 'success'
      })
    } catch (error) {
      addToast({
        title: t('browserServer.failedAddServer'),
        color: 'danger'
      })
    } finally {
      setIsLoading(false)
      setLoadingType(null)
      setProccessKey(null)
    }
  }

  async function deleteServer(key: number, servers: IVersionServer) {
    try {
      setIsLoading(true)
      setLoadingType('delete')
      setProccessKey(key)

      await api.servers.write(
        servers.servers.filter((s) => s.ip != server.address),
        servers.path
      )

      await getVersionsServers()

      addToast({
        title: t('serverInfo.serverRemoved'),
        color: 'success'
      })
    } catch (error) {
      addToast({
        title: t('browserServer.failedDeleteServer'),
        color: 'danger'
      })
    } finally {
      setIsLoading(false)
      setLoadingType(null)
      setProccessKey(null)
    }
  }

  const { t } = useTranslation()
  return (
    <>
      <Modal isOpen={true} onClose={onClose} size="xl">
        <ModalContent>
          <ModalHeader>{t('serverInfo.title')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4 items-center justify-center">
              <div className="flex flex-col space-y-2 items-center justify-center">
                {server.icon && (
                  <Image
                    src={server.icon}
                    alt={server.name}
                    width={96}
                    height={96}
                    className="flex-shrink-0"
                  />
                )}
                <p className="text-center text-lg font-bold truncate flex-grow">{server.name}</p>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <p className="text-center text-xs break-words">{server.description}</p>
                  {server.tags.length > 0 && (
                    <div className="flex flex-wrap justify-center">
                      {server.tags
                        .map((tag) => t(`browser.serverTags.${tag}`))
                        .map((tag, index) => (
                          <div className="flex-none h-full pr-1" key={index}>
                            <Chip variant="flat" size="sm">
                              {tag}
                            </Chip>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 text-center mx-auto">
                <p className="text-sm font-bold">{t('serverInfo.details')}</p>
                <div className="flex items-center gap-4 mx-auto">
                  <div className="flex items-center gap-1">
                    <Gamepad2 size={18} />
                    <p className="text-xs">{server.version}</p>
                  </div>
                  {server.auth != 'null' && (
                    <div className="flex items-center gap-1">
                      <ScanFace size={18} />
                      {server.auth == 'microsoft' && (
                        <div className="flex items-center gap-1">
                          <FaMicrosoft size={18} />
                          <p className="text-xs">Microsoft</p>
                        </div>
                      )}
                      {server.auth == 'discord' && (
                        <div className="flex items-center gap-1">
                          <FaDiscord size={18} />
                          <p className="text-xs">Discord</p>
                        </div>
                      )}
                      {server.auth == 'elyby' && (
                        <div className="flex items-center gap-1">
                          <TbSquareLetterE size={18} />
                          <p className="text-xs">Ely.by</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {server.modpack && (
                  <div className="flex items-center gap-2">
                    <Link2 size={18} />
                    <div className="flex items-center gap-1">
                      {server.modpack.conf.image && (
                        <Image
                          src={server.modpack.conf.image}
                          alt={server.modpack.conf.name}
                          width={24}
                          height={24}
                          className="min-w-6 min-h-6"
                        />
                      )}
                      <p className="text-xs">{server.modpack.conf.name}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 mx-auto">
                  <EthernetPort size={18} />
                  <p color="primary" className="text-center text-xs">
                    {server.address}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1 text-center mx-auto">
                <span>
                  {server.status && server.status.online ? (
                    <Chip variant="flat" size="sm" color="success">
                      {t('friends.online')}
                    </Chip>
                  ) : (
                    <Chip variant="flat" size="sm" color="danger">
                      {t('friends.offline')}
                    </Chip>
                  )}
                </span>

                {server.status && server.status.online && (
                  <div className="flex items-center gap-4 mx-auto">
                    <Tooltip
                      size="sm"
                      isDisabled={server.status.players.online == 0}
                      content={
                        <div className="flex flex-col gap-1">
                          <p>{t('serverInfo.players')}</p>
                          <div className="flex flex-col gap-1 overflow-auto pr-1">
                            {server.status.players.list.map((player, index) => (
                              <p className="text-xs" key={index}>
                                {player.name_clean}
                              </p>
                            ))}
                          </div>
                        </div>
                      }
                    >
                      <div className="flex items-center gap-2">
                        <Users size={18} />
                        <p className="text-xs">
                          {server.status.players.online}/{server.status.players.max}
                        </p>
                      </div>
                    </Tooltip>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mx-auto">
                <Button
                  color="primary"
                  variant="flat"
                  isLoading={isLoading && loadingType == 'versions'}
                  startContent={<CirclePlus size={22} />}
                  onPress={async () => {
                    if (!account) return

                    if (server.modpack) {
                      const modpackData = await api.backend.getModpack(
                        account?.accessToken || '',
                        server.modpack._id
                      )
                      if (!modpackData.data) return

                      setTempModpack(modpackData.data)
                      setIsAddVersion(true)
                      return
                    }

                    if (
                      versions.length == 0 ||
                      versions.filter(
                        (v) =>
                          v.version.version.id == server.version &&
                          !v.version.downloadedVersion &&
                          isOwner(v.version.owner, account)
                      ).length == 0
                    ) {
                      addToast({ title: t('serverInfo.noVersions'), color: 'warning' })
                      return
                    }

                    await getVersionsServers()
                    setIsAddModalOpen(true)
                  }}
                >
                  {t('browser.addServer')}
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isAddModalOpen && (
        <Modal isOpen={true} onClose={() => setIsAddModalOpen(false)} size="xs">
          <ModalContent>
            <ModalHeader>{t('browserServer.add')}</ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 overflow-auto max-h-96 pr-1 min-w-0">
                  {versions
                    .filter(
                      (v) =>
                        v.version.version.id == server.version &&
                        !v.version.downloadedVersion &&
                        v.version.owner &&
                        isOwner(v.version.owner, account)
                    )
                    .map((version, index) => {
                      const servers = versionsServers.find((v) => v.version == version.version.name)
                      const isAdded = servers?.servers.find((s) => s.ip == server.address)

                      if (!servers) return

                      return (
                        <Card key={index}>
                          <CardBody>
                            <div className="flex items-center gap-2 min-w-0">
                              {version.version.image && (
                                <Image
                                  src={version.version.image}
                                  alt={version.version.name}
                                  width={32}
                                  height={32}
                                  className="min-w-8 min-h-8"
                                />
                              )}
                              <p className="truncate flex-grow">{version.version.name}</p>
                              {!isAdded && (
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  size="sm"
                                  key={index}
                                  color="success"
                                  isLoading={
                                    isLoading && loadingType == 'add' && proccessKey == index
                                  }
                                  onPress={async () => {
                                    await addServer(index, servers)
                                  }}
                                >
                                  <CirclePlus size={22} />
                                </Button>
                              )}
                              {isAdded && (
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  color="danger"
                                  key={index}
                                  size="sm"
                                  isLoading={
                                    isLoading && loadingType == 'delete' && proccessKey == index
                                  }
                                  onPress={async () => {
                                    await deleteServer(index, servers)
                                  }}
                                >
                                  <Minus size={22} />
                                </Button>
                              )}
                            </div>
                          </CardBody>
                        </Card>
                      )
                    })}
                </div>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
      {isAddVersion && tempModpack && (
        <AddVersion closeModal={() => setIsAddVersion(false)} modpack={tempModpack} />
      )}
    </>
  )
}
