import { ISkinEntry, SkinsData } from '@/types/SkinManager'
import {
  Button,
  Card,
  CardBody,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ScrollShadow,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Tooltip
} from '@heroui/react'
import { accountAtom, authDataAtom, pathsAtom } from '@renderer/stores/atoms'
import { useAtom } from 'jotai'
import { FilePlus2, Link, Mars, Trash, User, Venus } from 'lucide-react'
import { useEffect, useMemo, useState, useCallback, memo } from 'react'
import { useTranslation } from 'react-i18next'
import ReactSkinview3d from 'react-skinview3d'

const api = window.api

const SkinCard = memo(
  ({
    skin,
    isSelected,
    isActive,
    isLoading,
    actionLoading,
    inputValue,
    skinsData,
    onSelectSkin,
    onRename,
    onDelete,
    t
  }: {
    skin: ISkinEntry
    isSelected: boolean
    isActive: boolean
    isLoading: boolean
    actionLoading: string | null
    inputValue: string
    skinsData: SkinsData
    onSelectSkin: (id: string) => void
    onRename: (id: string) => void
    onDelete: (id: string, type: 'skin' | 'cape') => void
    t: any
  }) => {
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

    const handleRightClick = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ x: e.clientX, y: e.clientY })
    }, [])

    const closeContextMenu = useCallback(() => {
      setContextMenu(null)
    }, [])

    useEffect(() => {
      if (contextMenu) {
        document.addEventListener('click', closeContextMenu)
        return () => document.removeEventListener('click', closeContextMenu)
      }
      return undefined
    }, [contextMenu, closeContextMenu])

    const handlePress = useCallback(() => {
      onSelectSkin(skin.id)
    }, [onSelectSkin, skin.id])

    const handleRename = useCallback(() => {
      closeContextMenu()
      onRename(skin.id)
    }, [onRename, skin.id, closeContextMenu])

    const handleDelete = useCallback(() => {
      closeContextMenu()
      onDelete(skin.id, 'skin')
    }, [onDelete, skin.id, closeContextMenu])

    const isRenameDisabled =
      inputValue.trim() === '' || skinsData?.skins.skins.some((s) => s.name === inputValue.trim())
    const isDeleteDisabled = skin.id === skinsData?.activeSkin

    return (
      <div onContextMenu={handleRightClick}>
        <Card
          isDisabled={isLoading || actionLoading !== null}
          isPressable
          onPress={handlePress}
          className={`w-28 break-all ${isActive ? 'border border-success-500' : isSelected ? 'border border-primary-500' : ''}`}
        >
          <CardBody>
            <div className="flex flex-col items-center space-y-2">
              <Image src={skin.character || skin.url} width={64} height={128} loading="lazy" />
              <p className="text-xs">{skin.name}</p>
            </div>
          </CardBody>
        </Card>

        {contextMenu && (
          <div
            className="fixed z-50 bg-content1 rounded-medium shadow-large py-1 min-w-[160px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full text-left px-4 py-2 text-small hover:bg-default-200 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRename}
              disabled={isRenameDisabled}
            >
              {t('manageSkins.rename')}
            </button>
            <button
              className="block w-full text-left px-4 py-2 text-small text-danger hover:bg-danger-100 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleDelete}
              disabled={isDeleteDisabled}
            >
              {t('manageSkins.deleteSkin')}
            </button>
          </div>
        )}
      </div>
    )
  }
)

SkinCard.displayName = 'SkinCard'

export function ManageSkins({ onClose }: { onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<
    'apply' | 'byFile' | 'reset' | 'byLink' | 'byPlayer' | null
  >(null)
  const [skinsData, setSkinsData] = useState<SkinsData | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [skinType, setSkinType] = useState<'skin' | 'cape'>('skin')

  const [paths] = useAtom(pathsAtom)
  const [selectedAccount] = useAtom(accountAtom)
  const [authData] = useAtom(authDataAtom)

  const { t } = useTranslation()

  useEffect(() => {
    const loadSkins = async () => {
      if (!selectedAccount || !authData) return

      setIsLoading(true)
      try {
        const accessToken =
          selectedAccount.type === 'microsoft'
            ? authData.auth.accessToken || ''
            : selectedAccount.accessToken || ''

        const data = await api.skins.load(
          paths.launcher,
          selectedAccount.type as 'microsoft' | 'discord',
          authData.uuid || '',
          selectedAccount.nickname || '',
          accessToken
        )
        setSkinsData(data)
      } catch {
      } finally {
        setIsLoading(false)
      }
    }

    loadSkins()
  }, [selectedAccount, authData, paths.launcher])

  const selectedCape = useMemo(() => {
    if (!skinsData) return null
    return skinsData.capes.find(
      (c) => c.id === skinsData.skins.skins.find((s) => s.id === skinsData.selectedSkin)?.capeId
    )
  }, [skinsData])

  const selectedSkinEntry = useMemo(() => {
    if (!skinsData) return null
    return skinsData.skins.skins.find((s) => s.id === skinsData.selectedSkin)
  }, [skinsData])

  const refreshSkins = useCallback(async () => {
    if (!selectedAccount || !authData) return
    const accessToken =
      selectedAccount.type === 'microsoft'
        ? authData.auth.accessToken || ''
        : selectedAccount.accessToken || ''

    const data = await api.skins.load(
      paths.launcher,
      selectedAccount.type as 'microsoft' | 'discord',
      authData.uuid || '',
      selectedAccount.nickname || '',
      accessToken
    )
    setSkinsData(data)
  }, [selectedAccount, authData, paths.launcher])

  const handleSelectSkin = useCallback(
    async (skinId: string) => {
      if (!authData || !selectedAccount) return
      await api.skins.selectSkin(authData.uuid, selectedAccount.type, skinId)
      await refreshSkins()
    },
    [authData, selectedAccount, refreshSkins]
  )

  const handleSetCape = useCallback(
    async (capeId: string | undefined) => {
      if (!authData || !selectedAccount) return
      await api.skins.setCape(authData.uuid, selectedAccount.type, capeId)
      await refreshSkins()
    },
    [authData, selectedAccount, refreshSkins]
  )

  const handleChangeModel = useCallback(async () => {
    if (!authData || !selectedAccount || !selectedSkinEntry) return
    const newModel = selectedSkinEntry.model === 'classic' ? 'slim' : 'classic'
    await api.skins.changeModel(authData.uuid, selectedAccount.type, newModel)
    await refreshSkins()
  }, [authData, selectedAccount, selectedSkinEntry, refreshSkins])

  const handleApply = useCallback(async () => {
    if (!authData || !selectedAccount || !selectedSkinEntry) return
    setActionLoading('apply')
    await api.skins.uploadSkin(authData.uuid, selectedAccount.type, selectedSkinEntry.id)
    await refreshSkins()
    setActionLoading(null)
  }, [authData, selectedAccount, selectedSkinEntry, refreshSkins])

  const handleDeleteSkin = useCallback(
    async (skinId: string, type: 'skin' | 'cape') => {
      if (!authData || !selectedAccount) return
      await api.skins.deleteSkin(authData.uuid, selectedAccount.type, skinId, type)
      await refreshSkins()
    },
    [authData, selectedAccount, refreshSkins]
  )

  const handleReset = useCallback(async () => {
    if (!authData || !selectedAccount) return
    setActionLoading('reset')
    await api.skins.resetSkin(authData.uuid, selectedAccount.type)
    await refreshSkins()
    setActionLoading(null)
  }, [authData, selectedAccount, refreshSkins])

  const handleImportByUrl = useCallback(async () => {
    if (!authData || !selectedAccount || !inputValue.trim()) return
    setActionLoading('byLink')
    try {
      await api.skins.importByUrl(authData.uuid, selectedAccount.type, inputValue.trim(), skinType)
      await refreshSkins()
      setInputValue('')
    } catch {
    } finally {
      setActionLoading(null)
    }
  }, [authData, selectedAccount, inputValue, skinType, refreshSkins])

  const handleImportByNickname = useCallback(async () => {
    if (!authData || !selectedAccount || !inputValue.trim()) return
    setActionLoading('byPlayer')
    try {
      await api.skins.importByNickname(authData.uuid, selectedAccount.type, inputValue.trim())
      await refreshSkins()
      setInputValue('')
    } catch {
    } finally {
      setActionLoading(null)
    }
  }, [authData, selectedAccount, inputValue, refreshSkins])

  const handleImportByFile = useCallback(async () => {
    if (!authData || !selectedAccount) return
    setActionLoading('byFile')
    const filePaths = await api.other.openFileDialog(false, [
      { name: 'Skins', extensions: ['png'] }
    ])
    if (!filePaths?.length) {
      setActionLoading(null)
      return
    }
    await api.skins.importByFile(authData.uuid, selectedAccount?.type, filePaths[0], skinType)
    await refreshSkins()
    setActionLoading(null)
  }, [authData, selectedAccount, skinType, refreshSkins])

  const handleRename = useCallback(
    async (skinId: string) => {
      if (!authData || !selectedAccount || !inputValue.trim()) return
      await api.skins.renameSkin(authData.uuid, selectedAccount?.type, skinId, inputValue.trim())
      await refreshSkins()
      setInputValue('')
    },
    [authData, selectedAccount, inputValue, refreshSkins]
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
  }, [])

  const handleSkinTypeToggle = useCallback(() => {
    setSkinType((prev) => (prev === 'skin' ? 'cape' : 'skin'))
    setInputValue('')
  }, [])

  const handleCapeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      handleSetCape(e.target.value || undefined)
    },
    [handleSetCape]
  )

  return (
    <Modal size="4xl" isOpen={true} onClose={onClose} isDismissable={!isLoading && !actionLoading}>
      <ModalContent>
        <ModalHeader>{t('manageSkins.title')}</ModalHeader>
        <ModalBody>
          <div className="flex items-center space-x-2 justify-between min-h-[375px] max-h-[375px]">
            {isLoading || !skinsData || !selectedAccount || !selectedAccount?.accessToken ? (
              <div className="h-full w-full flex items-center justify-center">
                <Spinner />
              </div>
            ) : (
              <>
                <div className="h-full flex flex-col space-y-2 items-center">
                  <ReactSkinview3d
                    skinUrl={selectedSkinEntry?.url || 'steve'}
                    capeUrl={selectedCape?.url}
                    height={300}
                    width={220}
                    options={{ preserveDrawingBuffer: true }}
                  />

                  <div className="flex items-center gap-1 w-56">
                    <div className="flex-1 w-full min-w-0">
                      <Select
                        className="w-full"
                        isDisabled={actionLoading !== null || skinsData.capes.length === 0}
                        selectedKeys={selectedCape?.id ? [selectedCape.id] : []}
                        onChange={handleCapeChange}
                        placeholder={t('manageSkins.noCape')}
                        renderValue={(items) => {
                          const cape = skinsData.capes.find((c) => c.id === items[0]?.key)
                          if (!cape) return <p>{t('manageSkins.noCape')}</p>
                          return (
                            <div className="flex items-center space-x-2 max-w-full">
                              <div className="flex-shrink-0">
                                <Image
                                  src={cape.cape || cape.url}
                                  className="h-8 w-auto rounded-none flex-shrink-0"
                                  loading="lazy"
                                />
                              </div>
                              <p className="truncate max-w-28">{cape.alias}</p>
                            </div>
                          )
                        }}
                      >
                        {skinsData.capes.map((cape) => (
                          <SelectItem key={cape.id}>
                            <div className="flex items-center space-x-2 max-w-full">
                              <div className="flex-shrink-0">
                                <Image
                                  src={cape.cape || cape.url}
                                  className="h-10 w-auto rounded-none flex-shrink-0"
                                  loading="lazy"
                                />
                              </div>
                              <p className="truncate max-w-28">{cape.alias}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                    </div>

                    {selectedAccount.type === 'discord' && (
                      <Tooltip delay={200} content={t('manageSkins.deleteCape')}>
                        <Button
                          variant="flat"
                          color="danger"
                          isIconOnly
                          isDisabled={
                            actionLoading !== null ||
                            !selectedCape ||
                            selectedCape.id === skinsData.activeCape
                          }
                          onPress={() => selectedCape && handleDeleteSkin(selectedCape.id, 'cape')}
                        >
                          <Trash size={22} />
                        </Button>
                      </Tooltip>
                    )}

                    <Tooltip
                      delay={500}
                      content={
                        selectedSkinEntry?.model === 'slim'
                          ? t('manageSkins.slimModel')
                          : t('manageSkins.classicModel')
                      }
                    >
                      <Button variant="flat" isIconOnly onPress={handleChangeModel}>
                        {selectedSkinEntry?.model === 'classic' ? (
                          <Mars size={20} />
                        ) : (
                          <Venus size={20} />
                        )}
                      </Button>
                    </Tooltip>
                  </div>

                  <Button
                    variant="flat"
                    color="primary"
                    className="w-full"
                    isDisabled={
                      skinsData.activeSkin === skinsData.selectedSkin &&
                      selectedSkinEntry?.model === skinsData.activeModel &&
                      selectedCape?.id === skinsData.activeCape
                    }
                    isLoading={actionLoading === 'apply'}
                    onPress={handleApply}
                  >
                    {t('manageSkins.apply')}
                  </Button>
                </div>

                <div className="h-full flex flex-col space-y-2">
                  <p>{t('manageSkins.skins')}</p>
                  <ScrollShadow className="grid grid-cols-5 gap-2 max-h-[375px] min-h-[375px] overflow-y-auto pr-1">
                    {skinsData.skins.skins.map((skin) => {
                      const isSelected = skin.id === skinsData.selectedSkin
                      const isActive = skin.id === skinsData.activeSkin
                      return (
                        <SkinCard
                          key={skin.id}
                          skin={skin}
                          isSelected={isSelected}
                          isActive={isActive}
                          isLoading={isLoading}
                          actionLoading={actionLoading}
                          inputValue={inputValue}
                          skinsData={skinsData}
                          onSelectSkin={handleSelectSkin}
                          onRename={handleRename}
                          onDelete={handleDeleteSkin}
                          t={t}
                        />
                      )
                    })}
                  </ScrollShadow>
                </div>
              </>
            )}
          </div>
        </ModalBody>

        {!isLoading && skinsData && selectedAccount && (
          <ModalFooter>
            {selectedAccount.type === 'discord' && (
              <div className="flex items-center space-x-2">
                <p>{t('manageSkins.skin')}</p>
                <Switch
                  size="sm"
                  isSelected={skinType === 'cape'}
                  onChange={handleSkinTypeToggle}
                />
                <p>{t('manageSkins.cape')}</p>
              </div>
            )}

            <Input className="w-40" value={inputValue} onChange={handleInputChange} />

            <Tooltip delay={500} content={t('manageSkins.importByNick')}>
              <Button
                variant="flat"
                isIconOnly
                isLoading={actionLoading === 'byPlayer'}
                isDisabled={
                  actionLoading !== null || skinType === 'cape' || inputValue.trim() === ''
                }
                onPress={handleImportByNickname}
              >
                <User size={22} />
              </Button>
            </Tooltip>

            <Tooltip delay={500} content={t('manageSkins.importByLink')}>
              <Button
                variant="flat"
                isIconOnly
                isLoading={actionLoading === 'byLink'}
                isDisabled={actionLoading !== null || inputValue.trim() === ''}
                onPress={handleImportByUrl}
              >
                <Link size={22} />
              </Button>
            </Tooltip>

            <Tooltip delay={500} content={t('manageSkins.importByFile')}>
              <Button
                variant="flat"
                isIconOnly
                isLoading={actionLoading === 'byFile'}
                isDisabled={actionLoading !== null}
                onPress={handleImportByFile}
              >
                <FilePlus2 size={22} />
              </Button>
            </Tooltip>

            {selectedAccount.type === 'microsoft' && (
              <Button
                variant="flat"
                isDisabled={actionLoading !== null}
                isLoading={actionLoading === 'reset'}
                onPress={handleReset}
              >
                {t('manageSkins.reset')}
              </Button>
            )}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  )
}
