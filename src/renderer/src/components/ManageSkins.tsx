import { SkinsManager } from '@renderer/utilities/SkinsManager'
import { ISkinsConfig } from '@/types/SkinManager'
import {
  Button,
  Card,
  CardBody,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
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
  Switch,
  Tooltip,
  useDisclosure
} from '@heroui/react'
import { accountAtom, authDataAtom, pathsAtom } from '@renderer/stores/Main'
import { useAtom } from 'jotai'
import { FilePlus2, Link, Mars, Trash, User, Venus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactSkinview3d from 'react-skinview3d'

export function ManageSkins({
  onClose,
  skinsManager
}: {
  onClose: () => void
  skinsManager: SkinsManager
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [loadingType, setLoadingType] = useState<
    'apply' | 'byFile' | 'reset' | 'byLink' | 'byPlayer'
  >()
  const [paths] = useAtom(pathsAtom)
  const [skinManager, setSkinManager] = useState<SkinsManager>(skinsManager)
  const [selectedAccount] = useAtom(accountAtom)
  const [inputValue, setInputValue] = useState<string>('')
  const [authData] = useAtom(authDataAtom)
  const [skinType, setSkinType] = useState<'skin' | 'cape'>('skin')

  const selectedCape = useMemo(() => {
    return skinManager.capes.find((c) => c.id === skinManager.getSelectedSkin()?.capeId)
  }, [skinManager])

  const selectedSkin = useMemo(() => {
    return skinManager.getSelectedSkin()
  }, [skinManager])

  const { t } = useTranslation()

  function getNewManager() {
    return new SkinsManager(
      paths.launcher,
      selectedAccount?.type as 'microsoft' | 'discord',
      authData?.uuid || '',
      selectedAccount?.nickname || '',
      selectedAccount?.type == 'microsoft'
        ? authData?.auth.accessToken || ''
        : selectedAccount?.accessToken || '',
      skinManager ? skinManager.getSelectedSkin()?.id : undefined,
      skinManager ? skinManager.capes : undefined,
      skinManager ? skinManager.skins : undefined,
      skinManager ? skinManager.activeSkin : undefined,
      skinManager ? skinManager.activeCape : undefined,
      skinManager ? skinManager.activeModel : undefined
    )
  }

  function SkinCard({
    skin,
    isSelected,
    isActive
  }: {
    skin: ISkinsConfig['skins'][0]
    isSelected: boolean
    isActive: boolean
  }) {
    const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure()
    const triggerRef = useRef(null)

    const handleRightClick = (e: React.MouseEvent) => {
      e.preventDefault()
      onOpen()
    }

    return (
      <div onContextMenu={handleRightClick} ref={triggerRef}>
        <Dropdown isOpen={isOpen} onOpenChange={onOpenChange} placement="bottom-end">
          <DropdownTrigger>
            <Card
              isDisabled={isLoading}
              isPressable
              onPress={async () => {
                if (isSelected || !skinManager) return

                skinManager.selectedSkin = skin.id

                setSkinManager(getNewManager())
              }}
              className={`w-28 break-all ${isActive ? 'border border-success-500' : isSelected ? 'border border-primary-500' : ''}`}
            >
              <CardBody>
                <div className="flex flex-col items-center space-y-2">
                  <Image src={skin.character} width={64} height={128} />
                  <p className="text-xs">{skin.name}</p>
                </div>
              </CardBody>
            </Card>
          </DropdownTrigger>

          <DropdownMenu
            aria-label="Skin Actions"
            onAction={onClose}
            disabledKeys={[
              `${!inputValue || skinManager.skins.skins.find((s) => s.name == inputValue.trim()) ? 'rename' : ''}`,
              `${skinManager.activeSkin == skin.id ? 'delete' : ''}`
            ]}
          >
            <DropdownItem
              key="rename"
              onPress={async () => {
                if (!skinManager) return

                await skinManager.renameSkin(skin.id, inputValue.trim())
                setSkinManager(getNewManager())
                setInputValue('')
              }}
            >
              {t('manageSkins.rename')}
            </DropdownItem>
            <DropdownItem
              key="delete"
              className="text-danger"
              color="danger"
              onPress={async () => {
                if (!skinManager) return

                await skinManager.deleteSkin(skin.id)
                setSkinManager(getNewManager())
              }}
            >
              {t('manageSkins.deleteSkin')}
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    )
  }

  return (
    <>
      <Modal
        size="4xl"
        isOpen={true}
        onClose={() => {
          if (isLoading) return
          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('manageSkins.title')}</ModalHeader>
          <ModalBody>
            {skinManager && selectedAccount?.accessToken && (
              <div className="flex items-center space-x-2 justify-between max-h-[375px]">
                <div className="h-full flex flex-col space-y-2 items-center">
                  <ReactSkinview3d
                    skinUrl={selectedSkin?.skinUrl || 'steve'}
                    capeUrl={selectedSkin?.capeUrl}
                    height={300}
                    width={220}
                    options={{
                      preserveDrawingBuffer: true,
                      model: 'slim'
                    }}
                  />

                  <div className="flex items-center gap-1 w-56">
                    <div className="flex-1 w-full min-w-0">
                      <Select
                        className="w-full"
                        isDisabled={isLoading || skinManager.capes.length == 0}
                        selectedKeys={selectedCape?.id ? [selectedCape?.id || ''] : []}
                        onChange={async (event) => {
                          const value = event.target.value
                          if (!value) await skinManager.setCapeId(undefined)
                          else await skinManager.setCapeId(event.target.value)

                          await skinManager.saveSkins()

                          setSkinManager(getNewManager())
                        }}
                        placeholder={t('manageSkins.noCape')}
                        renderValue={(items) => {
                          const selectedCape = skinManager.capes.find(
                            (cape) => cape.id == items[0]?.key
                          )
                          if (!selectedCape) return <p>{t('manageSkins.noCape')}</p>
                          return (
                            <div className="flex items-center space-x-2 max-w-full">
                              <div className="flex-shrink-0">
                                <Image
                                  src={selectedCape.cape}
                                  className="h-8 w-auto rounded-none flex-shrink-0"
                                />
                              </div>
                              <p className="truncate max-w-28">{selectedCape.alias}</p>
                            </div>
                          )
                        }}
                      >
                        {skinManager.capes.map((cape) => (
                          <SelectItem key={cape.id}>
                            <div className="flex items-center space-x-2 max-w-full">
                              <div className="flex-shrink-0">
                                <Image
                                  src={cape.cape}
                                  className="h-10 w-auto rounded-none flex-shrink-0"
                                />
                              </div>
                              <p className="truncate max-w-28">{cape.alias}</p>
                            </div>
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                    {selectedAccount.type == 'discord' && (
                      <Tooltip delay={200} content={t('manageSkins.deleteCape')}>
                        <Button
                          variant="flat"
                          color="danger"
                          isIconOnly
                          isDisabled={
                            isLoading ||
                            selectedCape?.id == undefined ||
                            selectedCape.id == skinManager.activeCape
                          }
                          onPress={async () => {
                            if (!skinManager || !selectedCape) return

                            await skinManager.deleteSkin(selectedCape.id, 'cape')
                            setSkinManager(getNewManager())
                          }}
                        >
                          <Trash size={22} />
                        </Button>
                      </Tooltip>
                    )}

                    <Tooltip
                      delay={500}
                      content={
                        selectedSkin?.model == 'slim'
                          ? t('manageSkins.slimModel')
                          : t('manageSkins.classicModel')
                      }
                    >
                      <Button
                        variant="flat"
                        isIconOnly
                        onPress={async () => {
                          if (!skinManager) return

                          await skinManager.changeModel(
                            selectedSkin?.model == 'classic' ? 'slim' : 'classic'
                          )
                          setSkinManager(getNewManager())
                        }}
                      >
                        {selectedSkin?.model == 'classic' ? (
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
                    isDisabled={isLoading || skinManager.isActive()}
                    isLoading={isLoading && loadingType === 'apply'}
                    onPress={async () => {
                      if (!selectedSkin) return

                      setIsLoading(true)
                      setLoadingType('apply')

                      await skinManager.uploadSkin(selectedSkin.id)

                      setIsLoading(false)
                      setLoadingType(undefined)
                    }}
                  >
                    {t('manageSkins.apply')}
                  </Button>
                </div>
                <div className="h-full flex flex-col space-y-2">
                  <p>{t('manageSkins.skins')}</p>
                  <ScrollShadow className="grid grid-cols-5 gap-2 max-h-[375px] min-h-[375px] overflow-y-auto pr-1">
                    {skinManager.skins.skins.map((skin, index) => {
                      const isSelected = skin.id == selectedSkin?.id
                      const isActive = skin.id == skinManager.activeSkin

                      return (
                        <SkinCard
                          key={index}
                          skin={skin}
                          isSelected={isSelected}
                          isActive={isActive}
                        />
                      )
                    })}
                  </ScrollShadow>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            {selectedAccount?.type == 'discord' && (
              <div className="flex items-center space-x-2">
                <p>{t('manageSkins.skin')}</p>
                <Switch
                  size="sm"
                  onChange={() => {
                    setSkinType(skinType === 'skin' ? 'cape' : 'skin')
                    setInputValue('')
                  }}
                  isSelected={skinType === 'cape'}
                />
                <p>{t('manageSkins.cape')}</p>
              </div>
            )}
            <Input
              className="w-40"
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value)
              }}
            />
            <Tooltip delay={500} content={t('manageSkins.importByNick')}>
              <Button
                variant="flat"
                isIconOnly
                isLoading={isLoading && loadingType == 'byPlayer'}
                isDisabled={isLoading || skinType == 'cape' || !inputValue.length}
                onPress={async () => {
                  if (!skinManager || !inputValue.length) return

                  setIsLoading(true)
                  setLoadingType('byPlayer')

                  const playerName = inputValue.trim()

                  try {
                    await skinManager.importByNickname(playerName)
                  } catch {
                    setIsLoading(false)
                    setLoadingType(undefined)
                    setInputValue('')
                    return
                  }

                  setSkinManager(getNewManager())
                  setInputValue('')

                  setIsLoading(false)
                  setLoadingType(undefined)
                }}
              >
                <User size={22} />
              </Button>
            </Tooltip>
            <Tooltip delay={500} content={t('manageSkins.importByLink')}>
              <Button
                variant="flat"
                isIconOnly
                isLoading={isLoading && loadingType == 'byLink'}
                isDisabled={isLoading || !inputValue.length}
                onPress={async () => {
                  if (!skinManager || !inputValue.length) return

                  setIsLoading(true)
                  setLoadingType('byLink')

                  const skinUrl = inputValue.trim()

                  try {
                    await skinManager.importByUrl(skinUrl, skinType)
                  } catch {
                    setIsLoading(false)
                    setLoadingType(undefined)
                    setInputValue('')
                    return
                  }

                  setSkinManager(getNewManager())
                  setInputValue('')

                  setIsLoading(false)
                  setLoadingType(undefined)
                }}
              >
                <Link size={22} />
              </Button>
            </Tooltip>
            <Tooltip delay={500} content={t('manageSkins.importByFile')}>
              <Button
                isIconOnly
                variant="flat"
                isDisabled={isLoading}
                isLoading={isLoading && loadingType == 'byFile'}
                onPress={async () => {
                  if (!skinManager) return

                  setIsLoading(true)
                  setLoadingType('byFile')

                  const filePaths = await window.electron.ipcRenderer.invoke(
                    'openFileDialog',
                    false,
                    [
                      {
                        name: 'Skins',
                        extensions: ['png']
                      }
                    ]
                  )

                  if (!filePaths.length) {
                    setIsLoading(false)
                    setLoadingType(undefined)
                    return
                  }

                  await skinManager.importByFile(filePaths[0], skinType)

                  setSkinManager(getNewManager())

                  setIsLoading(false)
                  setLoadingType(undefined)
                }}
              >
                <FilePlus2 size={22} />
              </Button>
            </Tooltip>
            {selectedAccount?.type === 'microsoft' && (
              <Button
                variant="flat"
                isDisabled={isLoading}
                isLoading={isLoading && loadingType == 'reset'}
                onPress={async () => {
                  if (!skinManager) return

                  setIsLoading(true)
                  setLoadingType('reset')

                  await skinManager.resetSkin()

                  setSkinManager(getNewManager())

                  setIsLoading(false)
                  setLoadingType(undefined)
                }}
              >
                {t('manageSkins.reset')}
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
