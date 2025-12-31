import { IBackendServer, IModpack } from '@/types/Backend'
import {
  ArrowDownToLine,
  CirclePlus,
  Gamepad2,
  Library,
  ListPlus,
  Plus,
  RefreshCcw,
  Search,
  Server,
  Settings,
  Copy,
  Crown,
  Cpu,
  Trash
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Server as ServerComponent } from './Server'
import { IServer, modpackTags, serverTags } from '@/types/Browser'
import { ServerInfo } from './ServerInfo'
import { useAtom } from 'jotai'
import { accountAtom, authDataAtom } from '@renderer/stores/Main'
import { AddVersion } from '../Modals/Version/AddVersion'
import { addToast } from '@heroui/toast'
import { Modal, ModalBody, ModalContent, ModalHeader } from '@heroui/modal'
import { Button } from '@heroui/button'
import { Input } from '@heroui/input'
import { Select, SelectItem, SelectSection } from '@heroui/select'
import { Spinner } from '@heroui/spinner'
import { Alert } from '@heroui/alert'
import { Chip } from '@heroui/chip'
import { Avatar, Card, CardBody, ScrollShadow, Tooltip } from '@heroui/react'
import { Image } from '@heroui/react'
import { loaders } from '../Loaders'
import { IUser } from '@/types/IUser'
import AccountInfo from '../Account/AccountInfo'

type LoadingType = 'search' | 'serverInfo' | 'delete'
type Sort = 'downloads' | 'name' | 'update' | 'newest'

const api = window.api

export function Browser({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true)
  const [loadingType, setLoadingType] = useState<LoadingType | null>('search')
  const [modpacks, setModpacks] = useState<IModpack[]>([])
  const [servers, setServers] = useState<IServer[]>([])
  const [type, setType] = useState<'modpacks' | 'servers'>('modpacks')
  const [sort, setSort] = useState<Sort>('downloads')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string[]>([])
  const [isServerModalOpen, setIsServerModalOpen] = useState(false)
  const { t } = useTranslation()
  const [serverData, setServerData] = useState<IServer | null>(null)
  const [isServerInfoModalOpen, setIsServerInfoModalOpen] = useState(false)
  const [serverInfo, setServerInfo] = useState<IBackendServer | null>(null)
  const [proccessKey, setProccessKey] = useState<number | null>(null)
  const [account] = useAtom(accountAtom)
  const [isAddVerion, setAddVersion] = useState(false)
  const [tempModpack, setTempModpack] = useState<IModpack>()
  const [authData] = useAtom(authDataAtom)
  const [accountInfo, setAccountInfo] = useState(false)
  const [user, setUser] = useState<IUser | null>(null)

  useEffect(() => {
    defaultModpacks()
  }, [])

  async function defaultModpacks() {
    setIsLoading(true)
    setLoadingType('search')

    setServers([])
    setType('modpacks')
    setSearch('')
    setFilter([])
    setSort('downloads')

    const modpacks = await api.backend.modpackSearch(account?.accessToken || '', {
      filter: [],
      limit: 20,
      offset: 0,
      search: '',
      sort: 'downloads'
    })

    setModpacks(modpacks)

    setIsLoading(false)
    setLoadingType(null)
  }

  async function defaultServers() {
    setIsLoading(true)
    setLoadingType('search')

    setModpacks([])
    setType('servers')
    setSearch('')
    setFilter([])

    const servers = await api.backend.searchServers(account?.accessToken || '', {
      filter: [],
      limit: 20,
      offset: 0,
      search: ''
    })

    setServers(servers)

    setIsLoading(false)
    setLoadingType(null)
  }

  const copyAddress = useCallback(async (adress: string) => {
    await api.clipboard.writeText(adress)
    addToast({
      title: t('browser.copiedAddress')
    })
  }, [])

  return (
    <>
      <Modal
        size="5xl"
        isOpen
        onClose={() => {
          if (isLoading) return
          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{`${t('browser.title')} (${t(`browser.${type}`)})`}</ModalHeader>
          <ModalBody>
            <div className="flex space-x-2">
              <div className="flex flex-col gap-4 h-full justify-between max-w-[200px] min-w-[200px]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="flat"
                      isDisabled={isLoading}
                      onPress={async () => {
                        if (type == 'modpacks') await defaultModpacks()
                        else if (type == 'servers') await defaultServers()
                      }}
                      startContent={<RefreshCcw size={22} />}
                    >
                      {t('browser.refresh')}
                    </Button>
                    {type == 'servers' && (
                      <Button
                        color="primary"
                        variant="flat"
                        isDisabled={isLoading}
                        onPress={async () => {
                          await defaultModpacks()
                        }}
                        startContent={<Library size={22} />}
                      >
                        {t('browser.modpacks')}
                      </Button>
                    )}
                    {type == 'modpacks' && (
                      <Button
                        color="primary"
                        variant="flat"
                        isDisabled={isLoading}
                        onPress={async () => {
                          await defaultServers()
                        }}
                        startContent={<Server size={22} />}
                      >
                        {t('browser.servers')}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Input
                      isDisabled={isLoading}
                      startContent={<Search size={22} />}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    {type == 'modpacks' && (
                      <Select
                        label={t('browser.sort')}
                        selectedKeys={[sort]}
                        isDisabled={isLoading}
                        onChange={(e) => {
                          const value = e.target.value
                          if (!value) return

                          setSort(value as Sort)
                        }}
                      >
                        <SelectItem key="name">{t('browser.sorts.0')}</SelectItem>
                        <SelectItem key="downloads">{t('browser.sorts.1')}</SelectItem>
                        <SelectItem key="update">{t('browser.sorts.2')}</SelectItem>
                        <SelectItem key="newest">{t('browser.sorts.3')}</SelectItem>
                      </Select>
                    )}
                    <div className="flex flex-col gap-1">
                      {type == 'modpacks' && (
                        <Select
                          label={t('browser.filter')}
                          placeholder={t('versions.selectTags')}
                          isDisabled={isLoading}
                          selectionMode="multiple"
                          selectedKeys={filter}
                          className="max-w-xs"
                          onChange={(e) => {
                            const values = e.target.value.split(',')
                            setFilter(values.sort((a, b) => a.localeCompare(b)))
                          }}
                        >
                          {modpackTags.map((tag) => {
                            return (
                              <SelectItem key={tag}>{t('browser.modpackTags.' + tag)}</SelectItem>
                            )
                          })}
                        </Select>
                      )}
                      {type == 'servers' && (
                        <Select
                          label={t('browser.filter')}
                          placeholder={t('versions.selectTags')}
                          selectionMode="multiple"
                          selectedKeys={filter}
                          className="max-w-xs"
                          isDisabled={isLoading}
                          onChange={(event) => {
                            const values = event.target.value.split(',')
                            setFilter(values)
                          }}
                          renderValue={(selected) => {
                            if (!selected) return null

                            return <p>{`${t('modManager.selected')}: ${selected.length}`}</p>
                          }}
                        >
                          {Object.entries(serverTags).map(([name, tags]) => (
                            <SelectSection title={t(`browser.serverTags.${name}`)}>
                              {tags.map((tag) => (
                                <SelectItem key={tag}>{t(`browser.serverTags.${tag}`)}</SelectItem>
                              ))}
                            </SelectSection>
                          ))}
                        </Select>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="flat"
                    isDisabled={isLoading}
                    onPress={async () => {
                      setIsLoading(true)
                      setLoadingType('search')

                      if (type == 'modpacks') {
                        const modpacks = await api.backend.modpackSearch(
                          account?.accessToken || '',
                          {
                            filter,
                            limit: 20,
                            offset: 0,
                            search,
                            sort
                          }
                        )

                        setModpacks(modpacks)
                      }

                      if (type == 'servers') {
                        const servers = await api.backend.searchServers(
                          account?.accessToken || '',
                          {
                            filter,
                            limit: 20,
                            offset: 0,
                            search
                          }
                        )

                        setServers(servers)
                      }

                      setIsLoading(false)
                      setLoadingType(null)
                    }}
                    startContent={<Search size={22} />}
                  >
                    {t('browser.search')}
                  </Button>
                </div>
                <div className="flex flex-col space-y-2">
                  <Button
                    variant="flat"
                    isDisabled={isLoading || account?.type == 'plain'}
                    startContent={<Crown size={22} />}
                    onPress={async () => {
                      if (!account || !authData) return

                      setIsLoading(true)
                      setLoadingType('search')

                      if (type == 'modpacks') {
                        setServers([])
                        setType('modpacks')
                        setSearch('')
                        setFilter([])
                        setSort('downloads')
                        const modpacks = await api.backend.allModpacksByUser(
                          account?.accessToken || '',
                          authData.sub
                        )
                        setModpacks(modpacks)
                      }

                      if (type == 'servers') {
                        setModpacks([])
                        setType('servers')
                        setSearch('')
                        setFilter([])

                        const servers = await api.backend.ownerServers(
                          account?.accessToken || '',
                          authData.sub
                        )
                        setServers(servers)
                      }

                      setIsLoading(false)
                      setLoadingType(null)
                    }}
                  >
                    {t('browser.showMine')}
                  </Button>

                  {type == 'servers' && (
                    <Button
                      color="secondary"
                      variant="flat"
                      isDisabled={isLoading || account?.type == 'plain'}
                      startContent={<CirclePlus size={22} />}
                      onPress={() => setIsServerModalOpen(true)}
                    >
                      {t('browser.addServer')}
                    </Button>
                  )}
                </div>
              </div>

              {!isLoading &&
                loadingType != 'search' &&
                modpacks.length == 0 &&
                servers.length == 0 && (
                  <div className="w-full">
                    <Alert title={t('common.notFound')} />
                  </div>
                )}

              <ScrollShadow className="max-h-[408px] min-h-[408px] w-full">
                {isLoading && loadingType == 'search' && (
                  <div className="w-full flex justify-center items-center h-full">
                    <Spinner size="sm" label={t('common.searching')} />
                  </div>
                )}

                {type == 'modpacks' &&
                  modpacks.length > 0 &&
                  loadingType != 'search' &&
                  modpacks.map((modpack, index) => {
                    const owner = modpack.owner as IUser

                    return (
                      <Card key={modpack._id} className="mb-2">
                        <CardBody>
                          <div className="flex gap-2 items-center justify-between">
                            <div className="flex items-center gap-4 min-w-0">
                              <div className="flex gap-2 items-center w-8/12 min-w-0">
                                {modpack.conf.image && (
                                  <Image
                                    src={modpack.conf.image}
                                    alt={modpack.conf.name}
                                    width={64}
                                    height={64}
                                    className="min-w-16 min-h-16"
                                    loading="lazy"
                                  />
                                )}
                                <div className="flex flex-col min-w-0">
                                  <p className="flex-grow truncate">{modpack.conf.name}</p>
                                  <Tooltip
                                    size="sm"
                                    content={
                                      <p className="break-words max-w-96">{modpack.description}</p>
                                    }
                                    delay={1000}
                                  >
                                    <p className="text-xs flex-grow truncate text-gray-500">
                                      {modpack.description}
                                    </p>
                                  </Tooltip>

                                  {modpack.tags.length > 0 && (
                                    <span>
                                      <Tooltip
                                        size="sm"
                                        isDisabled={modpack.tags.length <= 3}
                                        content={
                                          <p className="break-words max-w-96">
                                            {modpack.tags
                                              .map((tag) => t(`browser.modpackTags.${tag}`))
                                              .join(', ')}
                                          </p>
                                        }
                                      >
                                        <Chip size="sm" variant="flat">
                                          {modpack.tags
                                            .slice(0, 3)
                                            .map((tag) => t(`browser.modpackTags.${tag}`))
                                            .join(', ') + (modpack.tags.length > 3 ? ', ...' : '')}
                                        </Chip>
                                      </Tooltip>
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 w-4/12">
                                <div className="flex items-center gap-1">
                                  <Gamepad2 size={18} />
                                  <p className="text-xs">{modpack.conf.version.id}</p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Cpu size={18} />
                                  <p className="text-xs">
                                    {loaders[modpack.conf.loader.name].name}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <ArrowDownToLine size={18} />
                                  <p className="text-xs">{modpack.downloads}</p>
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-1 cursor-pointer"
                              onClick={() => {
                                setUser(owner)
                                setAccountInfo(true)
                              }}
                            >
                              <Crown color="gold" size={18} />
                              {owner.image && (
                                <Avatar
                                  className="flex-shrink-0"
                                  src={owner.image}
                                  alt={owner.nickname}
                                  size="sm"
                                />
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="flat"
                                isIconOnly
                                isDisabled={isLoading}
                                onPress={async () => {
                                  setTempModpack({ ...modpack, owner: owner._id })
                                  setAddVersion(true)
                                }}
                              >
                                <ListPlus size={22} />
                              </Button>
                              {authData?.sub == '66c34ea402dcdeabca54619c' && (
                                <Button
                                  variant="flat"
                                  isIconOnly
                                  color="danger"
                                  isDisabled={isLoading}
                                  isLoading={
                                    isLoading && loadingType == 'delete' && proccessKey == index
                                  }
                                  onPress={async () => {
                                    setIsLoading(true)
                                    setLoadingType('delete')
                                    setProccessKey(index)

                                    await api.backend.deleteModpack(
                                      account?.accessToken || '',
                                      modpack._id
                                    )

                                    setIsLoading(false)
                                    setLoadingType(null)
                                    setProccessKey(null)

                                    await defaultModpacks()
                                  }}
                                >
                                  <Trash size={22} />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardBody>
                      </Card>
                    )
                  })}

                {type == 'servers' &&
                  servers.length > 0 &&
                  loadingType != 'search' &&
                  servers.map((server, index) => (
                    <Card key={index} className="mb-2">
                      <CardBody>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <div className="flex gap-2 items-center w-5/6 min-w-0">
                              {server.icon && (
                                <Image
                                  src={server.icon}
                                  alt={server.name}
                                  width={64}
                                  height={64}
                                  className="min-w-16 min-h-16"
                                  loading="lazy"
                                />
                              )}
                              <div className="flex flex-col min-w-0">
                                <p className="truncate flex-grow">{server.name}</p>
                                <Tooltip
                                  size="sm"
                                  content={
                                    <p className="break-words max-w-96">{server.description}</p>
                                  }
                                  delay={1000}
                                >
                                  <p className="text-xs break-all text-gray-500 truncate flex-grow">
                                    {server.description}
                                  </p>
                                </Tooltip>

                                {server.tags.length > 0 && (
                                  <span>
                                    <Tooltip
                                      size="sm"
                                      isDisabled={server.tags.length <= 3}
                                      content={
                                        <p className="break-words max-w-96">
                                          {server.tags
                                            .map((tag) => t(`browser.serverTags.${tag}`))
                                            .join(', ')}
                                        </p>
                                      }
                                    >
                                      <Chip size="sm">
                                        {server.tags
                                          .slice(0, 3)
                                          .map((tag) => t(`browser.serverTags.${tag}`))
                                          .join(', ') + (server.tags.length > 3 ? ', ...' : '')}
                                      </Chip>
                                    </Tooltip>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-4 items-center w-1/6">
                              <div className="flex items-center gap-1">
                                <Gamepad2 size={18} />
                                <p className="text-xs">{server.version}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {server.owner._id == authData?.sub && (
                              <Button
                                variant="flat"
                                isIconOnly
                                isDisabled={isLoading}
                                onPress={async () => {
                                  setServerData(server)
                                  setIsServerModalOpen(true)
                                }}
                              >
                                <Settings size={22} />
                              </Button>
                            )}
                            <Button
                              variant="flat"
                              isIconOnly
                              isDisabled={isLoading}
                              onPress={() => copyAddress(server.address)}
                            >
                              <Copy size={22} />
                            </Button>
                            <Button
                              variant="flat"
                              isIconOnly
                              color="primary"
                              isDisabled={isLoading}
                              isLoading={
                                isLoading && loadingType == 'serverInfo' && proccessKey == index
                              }
                              onPress={async () => {
                                try {
                                  setIsLoading(true)
                                  setLoadingType('serverInfo')
                                  setProccessKey(index)

                                  const serverInfo = await api.backend.getServer(
                                    account?.accessToken || '',
                                    server._id
                                  )

                                  if (!serverInfo) {
                                    addToast({
                                      title: t('browser.errorLoadServer'),
                                      color: 'danger'
                                    })
                                    return
                                  }

                                  setServerInfo(serverInfo)
                                  setIsServerInfoModalOpen(true)
                                } finally {
                                  setIsLoading(false)
                                  setLoadingType(null)
                                  setProccessKey(null)
                                }
                              }}
                            >
                              <Plus size={22} />
                            </Button>
                            {authData && authData?.sub == '66c34ea402dcdeabca54619c' && (
                              <Button
                                variant="flat"
                                isIconOnly
                                isDisabled={isLoading}
                                color="danger"
                                isLoading={
                                  isLoading && loadingType == 'delete' && proccessKey == index
                                }
                                onPress={async () => {
                                  setIsLoading(true)
                                  setLoadingType('delete')
                                  setProccessKey(index)

                                  await api.backend.deleteServer(
                                    account?.accessToken || '',
                                    server._id
                                  )

                                  setIsLoading(false)
                                  setLoadingType(null)
                                  setProccessKey(null)

                                  await defaultServers()
                                }}
                              >
                                <Trash size={22} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
              </ScrollShadow>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isServerModalOpen && (
        <ServerComponent
          onClose={async (isReload: boolean) => {
            setIsServerModalOpen(false)
            setServerData(null)

            if (isReload) await defaultServers()
          }}
          server={serverData}
        />
      )}
      {isServerInfoModalOpen && serverInfo && (
        <ServerInfo
          onClose={() => {
            setIsServerInfoModalOpen(false)
          }}
          server={serverInfo}
        />
      )}
      {isAddVerion && tempModpack && (
        <AddVersion
          closeModal={() => {
            setAddVersion(false)
            setTempModpack(undefined)
          }}
          modpack={tempModpack}
          successCallback={onClose}
        />
      )}
      {accountInfo && account && user && (
        <AccountInfo
          onClose={() => {
            setAccountInfo(false)
          }}
          user={user}
          isOwner={false}
        />
      )}
    </>
  )
}
