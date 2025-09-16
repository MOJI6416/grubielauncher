import { Ban, Cable, Check, CirclePlus, ImagePlus, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageCropper } from '../ImageCropper'
import { IModpack } from '@/types/Backend'
import { FaDiscord, FaMicrosoft } from 'react-icons/fa'
import { TbSquareLetterE } from 'react-icons/tb'
import { IServer, serverTags } from '@/types/Browser'
import { useAtom } from 'jotai'
import { accountAtom, authDataAtom, backendServiceAtom } from '@renderer/stores/Main'
import {
  addToast,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  SelectSection,
  Spinner,
  Textarea,
  Image
} from '@heroui/react'
import { IVersion } from '@/types/IVersion'
import { VersionsService } from '@renderer/services/Versions'
import { base64ToUrl } from '@renderer/utilities/Files'

type LoadingType = 'status' | 'init' | 'add' | 'update' | 'delete'

export function Server({
  onClose,
  server
}: {
  onClose: (isReload: boolean) => void
  server: IServer | null
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<LoadingType | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [version, setVersion] = useState('')
  const [auth, setAuth] = useState<'microsoft' | 'discord' | 'elyby' | 'null'>('null')
  const [modpack, setModpack] = useState<string | null>(null)
  const [icon, setIcon] = useState('')
  const [address, setAddress] = useState('')
  const [tempIcon, setTempIcon] = useState('')
  const [isCropping, setIsCropping] = useState(false)
  const [modpacks, setModpacks] = useState<IModpack[]>([])
  const [connected, setConnected] = useState(false)
  const [lastAdress, setLastAdress] = useState('')
  const [account] = useAtom(accountAtom)
  const [versios, setVersions] = useState<string[]>([])
  const [authData] = useAtom(authDataAtom)
  const [backendService] = useAtom(backendServiceAtom)

  useEffect(() => {
    const init = async () => {
      if (!account) return

      setIsLoading(true)
      setLoadingType('init')

      const versions = await VersionsService.getVersions('vanilla')
      setVersions(versions.map((version: IVersion) => version.id))

      if (authData) {
        const modpacks = await backendService.allModpacksByUser(authData.sub)
        setModpacks(modpacks)
      }

      setIsLoading(false)
      setLoadingType(null)
    }

    init()

    if (server) {
      setName(server.name)
      setDescription(server.description)
      setTags(server.tags)
      setVersion(server.version)
      setAuth(server.auth as 'microsoft' | 'elyby' | 'null')
      setModpack(server.modpack?._id || null)
      setIcon(server.icon)
      setAddress(server.address)
      setConnected(true)
      setLastAdress(server.address)
    }
  }, [])

  const { t } = useTranslation()

  async function addServer() {
    try {
      if (!account || !authData) return

      setIsLoading(true)
      setLoadingType('add')

      const serverId = (
        await backendService.createServer({
          name,
          address,
          description,
          tags,
          version,
          auth,
          icon,
          modpack: modpack,
          owner: authData.sub
        })
      )?.id

      if (serverId && icon) {
        const url = await uploadIcon(serverId)
        await backendService.updateServer(serverId, {
          name,
          address,
          description,
          tags,
          version,
          auth,
          icon: url || '',
          modpack,
          owner: authData.sub
        })
      }

      addToast({ color: 'success', title: t('browserServer.serverAdded') })
      onClose(true)
    } catch (error) {
      addToast({ color: 'danger', title: t('browserServer.failedAddServer') })
    } finally {
      setIsLoading(false)
      setLoadingType(null)
    }
  }

  async function uploadIcon(serverId: string) {
    const response = await fetch(icon)
    const blob = await response.blob()
    const file = new File([blob], `icon.png`, { type: blob.type })

    return await backendService.uploadFile(file, `servers/${serverId}`)
  }

  async function updateServer() {
    if (!server || !account || !authData) return

    try {
      setIsLoading(true)
      setLoadingType('update')

      let url = server.icon
      if (server.icon !== icon) url = (await uploadIcon(server._id)) || server.icon

      await backendService.updateServer(server._id, {
        name,
        address,
        description,
        tags,
        version,
        auth,
        icon: url,
        modpack,
        owner: authData.sub
      })

      addToast({ color: 'success', title: t('browserServer.serverUpdated') })
      onClose(true)
    } catch (error) {
      addToast({ color: 'danger', title: t('browserServer.failedUpdateServer') })
    } finally {
      setIsLoading(false)
      setLoadingType(null)
    }
  }

  async function deleteServer() {
    if (!server) return

    try {
      setIsLoading(true)
      setLoadingType('delete')

      await backendService.deleteServer(server._id)
      addToast({ color: 'success', title: t('browserServer.serverDeleted') })
      onClose(true)
    } catch (error) {
      addToast({ color: 'danger', title: t('browserServer.failedDeleteServer') })
    } finally {
      setIsLoading(false)
      setLoadingType(null)
    }
  }

  return (
    <>
      <Modal
        isOpen={true}
        onClose={() => {
          if (!isLoading) onClose(false)
        }}
      >
        <ModalContent>
          <ModalHeader>{server ? t('browserServer.edit') : t('browserServer.add')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4 pr-1">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {icon && (
                    <Image
                      src={icon}
                      alt=""
                      height={64}
                      width={64}
                      onClick={() => setIcon('')}
                      className="min-w-16 min-h-16 cursor-pointer"
                    />
                  )}
                  {!icon && (
                    <Button
                      variant="flat"
                      isIconOnly
                      isDisabled={isLoading}
                      onPress={async () => {
                        const filePaths = await window.electron.ipcRenderer.invoke('openFileDialog')
                        setTempIcon(filePaths[0])
                        setIsCropping(true)
                      }}
                    >
                      <ImagePlus size={22} />
                    </Button>
                  )}
                  <Input
                    size="sm"
                    label={t('versions.name')}
                    isDisabled={isLoading}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    size="sm"
                    label={t('browserServer.address')}
                    isDisabled={isLoading}
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value)

                      if (event.target.value == lastAdress) setConnected(true)
                      else setConnected(false)
                    }}
                  />
                  <div
                    className={`${!(address.length == 0 || lastAdress === address || isLoading) ? 'animate-pulse' : ''}`}
                  >
                    <Button
                      variant="flat"
                      isIconOnly
                      color="primary"
                      isDisabled={address.length == 0 || lastAdress === address || isLoading}
                      isLoading={isLoading && loadingType === 'status'}
                      onPress={async () => {
                        try {
                          setIsLoading(true)
                          setLoadingType('status')

                          const status = await backendService.getStatus(address)

                          if (!status) {
                            setLastAdress('')
                            addToast({ color: 'danger', title: t('browserServer.failedConnect') })

                            return
                          }

                          setConnected(true)
                          setLastAdress(address)
                          addToast({ color: 'success', title: t('browserServer.dataReceived') })

                          setDescription(status.motd.clean)

                          if (status.icon) {
                            const url = base64ToUrl(status.icon)
                            setIcon(url)
                          }

                          if (versios.includes(status.version.name_raw)) {
                            setVersion(status.version.name_raw)
                          }
                        } catch (error) {
                        } finally {
                          setIsLoading(false)
                          setLoadingType(null)
                        }
                      }}
                    >
                      <Cable size={22} />
                    </Button>
                  </div>
                </div>

                <Select
                  size="sm"
                  label={t('versions.version')}
                  placeholder={t('versions.selectVersion')}
                  selectedKeys={[version]}
                  startContent={isLoading && loadingType === 'init' && <Spinner size="sm" />}
                  isDisabled={isLoading}
                  onChange={(event) => {
                    const value = event.target.value
                    if (!value) return
                    setVersion(value)
                  }}
                >
                  {versios.map((version) => (
                    <SelectItem key={version}>{version}</SelectItem>
                  ))}
                </Select>

                <Textarea
                  label={t('common.description')}
                  endContent={<p className="text-xs">{description.length}/256</p>}
                  value={description}
                  isDisabled={isLoading}
                  onChange={(e) => {
                    setDescription(e.target.value)
                  }}
                  maxRows={5}
                  minRows={3}
                />

                <Select
                  size="sm"
                  label={t('browserServer.authSystem')}
                  selectedKeys={[auth]}
                  isDisabled={isLoading}
                  onChange={(event) => {
                    const value = event.target.value
                    if (!value) return
                    setAuth(value as 'microsoft' | 'discord' | 'elyby' | 'null')
                  }}
                  renderValue={(items) => {
                    return items.map((item) => {
                      return (
                        <div className="flex items-center gap-1">
                          {item.key == 'microsoft' && <FaMicrosoft size={20} />}
                          {item.key === 'discord' && <FaDiscord size={20} />}
                          {item.key === 'elyby' && <TbSquareLetterE size={20} />}
                          {item.key === 'null' && <Ban size={20} />}

                          {item.textValue}
                        </div>
                      )
                    })
                  }}
                >
                  <SelectItem key="microsoft" startContent={<FaMicrosoft size={20} />}>
                    Microsoft
                  </SelectItem>
                  <SelectItem key="discord" startContent={<FaDiscord size={20} />}>
                    Discord
                  </SelectItem>
                  <SelectItem key="elyby" startContent={<TbSquareLetterE size={20} />}>
                    Ely.by
                  </SelectItem>
                  <SelectItem key="null" startContent={<Ban size={20} />}>
                    {t('browserServer.nullAuth')}
                  </SelectItem>
                </Select>

                <Select
                  size="sm"
                  label={t('browserServer.linkModpack')}
                  placeholder={t('browserServer.selectModpack')}
                  startContent={isLoading && loadingType === 'init' && <Spinner size="sm" />}
                  isDisabled={isLoading || !modpacks.length}
                  selectedKeys={[modpack || '']}
                  onChange={(event) => {
                    const value = event.target.value as string
                    setModpack(value)
                  }}
                >
                  {modpacks.map((modpack) => (
                    <SelectItem key={modpack._id} title={modpack.conf.name}>
                      <div className="flex items-center gap-2">
                        {modpack.conf.image && (
                          <Image
                            className="min-w-6 min-h-6"
                            src={modpack.conf.image}
                            alt=""
                            height={24}
                            width={24}
                          />
                        )}
                        {modpack.conf.name}
                      </div>
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  size="sm"
                  label={t('browser.tagsTitle')}
                  placeholder={t('versions.selectTags')}
                  selectionMode="multiple"
                  selectedKeys={tags}
                  isDisabled={isLoading}
                  onChange={(event) => {
                    const values = event.target.value.split(',')
                    setTags(values)
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
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <div className="flex items-center gap-2">
              <Button
                color="success"
                variant="flat"
                isLoading={isLoading && (loadingType === 'add' || loadingType === 'update')}
                isDisabled={
                  isLoading ||
                  !connected ||
                  !name ||
                  !address ||
                  !version ||
                  !description ||
                  name.length > 32 ||
                  description.length > 256 ||
                  (!!server &&
                    !!name &&
                    name === server.name &&
                    !!address &&
                    address === server.address &&
                    !!version &&
                    version === server.version &&
                    !!description &&
                    description === server.description &&
                    tags === server.tags &&
                    auth === server.auth &&
                    modpack === (server.modpack?._id ?? null) &&
                    icon === server.icon)
                }
                startContent={server ? <Check size={22} /> : <CirclePlus size={22} />}
                onPress={async () => {
                  if (server) {
                    await updateServer()
                    return
                  }

                  await addServer()
                }}
              >
                {server ? t('browser.editServer') : t('browser.addServer')}
              </Button>
              {server && (
                <Button
                  variant="flat"
                  color="danger"
                  isDisabled={isLoading}
                  startContent={<Trash size={22} />}
                  onPress={async () => {
                    await deleteServer()
                  }}
                  isLoading={isLoading && loadingType === 'delete'}
                >
                  {t('common.delete')}
                </Button>
              )}
            </div>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {isCropping && (
        <ImageCropper
          title={t('common.editingLogo')}
          image={tempIcon}
          onClose={() => setIsCropping(false)}
          size={{
            height: 256,
            width: 256
          }}
          changeImage={async (url: string) => {
            setIcon(url)
          }}
        />
      )}
    </>
  )
}
