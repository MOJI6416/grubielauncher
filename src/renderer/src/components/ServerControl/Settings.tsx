import { IServerConf, IServerSettings } from '@/types/Server'

import { useEffect, useState } from 'react'
import { ILocalProject } from '@/types/ModManager'
import { useTranslation } from 'react-i18next'
import { Link, Package, Save } from 'lucide-react'
import {
  addToast,
  Alert,
  Button,
  Checkbox,
  Image,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  NumberInput,
  ScrollShadow,
  Select,
  SelectItem,
  Slider
} from '@heroui/react'
import {
  getServerSettings,
  replaceXmxParameter,
  updateServerProperty
} from '@renderer/utilities/ServerManager'

const api = window.api
const fs = api.fs
const os = api.os
const path = api.path

const gameModes = ['survival', 'creative', 'adventure', 'spectator']
const difficulties = ['peaceful', 'easy', 'normal', 'hard']

export function ServerSettings({
  open,
  onClose,
  server,
  serverPath,
  resourcePacks
}: {
  server: IServerConf
  open: boolean
  onClose: () => void
  serverPath: string
  resourcePacks: ILocalProject[]
}) {
  const [memory, setMemory] = useState(2048)
  const [settings, setSettings] = useState<IServerSettings | null>(null)
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [gameMode, setGameMode] = useState('survival')
  const [difficulty, setDifficulty] = useState('normal')
  const [whitelist, setWhitelist] = useState(false)
  const [onlineMode, setOnlineMode] = useState(false)
  const [pvp, setPvp] = useState(false)
  const [enableCommandBlock, setEnableCommandBlock] = useState(false)
  const [allowFlight, setAllowFlight] = useState(false)
  const [spawnAnimals, setSpawnAnimals] = useState(false)
  const [spawnMonsters, setSpawnMonsters] = useState(false)
  const [spawnNpcs, setSpawnNpcs] = useState(false)
  const [allowNether, setAllowNether] = useState(false)
  const [forceGamemode, setForceGamemode] = useState(false)
  const [spawnProtection, setSpawnProtection] = useState(0)
  const [requireResourcePack, setRequireResourcePack] = useState(false)
  const [resourcePack, setResourcePack] = useState('')
  const [resourcePackPrompt, setResourcePackPrompt] = useState('')
  const [motd, setMotd] = useState('')
  const [isWarnModal, setIsWarnModal] = useState(false)
  const [serverIp, setServerIp] = useState('')
  const [serverPort, setServerPort] = useState(25565)
  const [isResourcePack, setIsResourcePack] = useState(false)
  const [serverMemory, setServerMemory] = useState(2048)

  const { t } = useTranslation()

  function isSaveBtnisDisabled() {
    return (
      memory == serverMemory &&
      !(
        settings &&
        (maxPlayers != settings.maxPlayers ||
          gameMode != settings.gameMode ||
          difficulty != settings.difficulty ||
          whitelist != settings.whitelist ||
          onlineMode != settings.onlineMode ||
          pvp != settings.pvp ||
          enableCommandBlock != settings.enableCommandBlock ||
          allowFlight != settings.allowFlight ||
          spawnAnimals != settings.spawnAnimals ||
          spawnMonsters != settings.spawnMonsters ||
          spawnNpcs != settings.spawnNpcs ||
          allowNether != settings.allowNether ||
          forceGamemode != settings.forceGamemode ||
          spawnProtection != settings.spawnProtection ||
          requireResourcePack != settings.requireResourcePack ||
          resourcePack != settings.resourcePack ||
          resourcePackPrompt != settings.resourcePackPrompt ||
          motd != settings.motd ||
          serverIp != settings.serverIp ||
          serverPort != settings.serverPort)
      )
    )
  }

  useEffect(() => {
    if (!server) return

    setMemory(server.memory)

    const settings = getServerSettings(path.join(serverPath, 'server.properties'))

    setSettings(settings)
    setServerMemory(server.memory)
    setMaxPlayers(settings.maxPlayers)
    setGameMode(settings.gameMode)
    setDifficulty(settings.difficulty)
    setWhitelist(settings.whitelist)
    setOnlineMode(settings.onlineMode)
    setPvp(settings.pvp)
    setEnableCommandBlock(settings.enableCommandBlock)
    setAllowFlight(settings.allowFlight)
    setSpawnAnimals(settings.spawnAnimals)
    setSpawnMonsters(settings.spawnMonsters)
    setSpawnNpcs(settings.spawnNpcs)
    setAllowNether(settings.allowNether)
    setForceGamemode(settings.forceGamemode)
    setSpawnProtection(settings.spawnProtection)
    setRequireResourcePack(settings.requireResourcePack)
    setResourcePack(settings.resourcePack)
    setResourcePackPrompt(settings.resourcePackPrompt)
    setMotd(settings.motd)
    setServerIp(settings.serverIp)
    setServerPort(settings.serverPort)

    if (resourcePacks.length > 0) {
      const pack = resourcePacks.find((pack) => pack.version?.files[0].url == settings.resourcePack)
      if (pack) setIsResourcePack(true)
    }
  }, [])

  return (
    <>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!isSaveBtnisDisabled()) {
            setIsWarnModal(true)
            return
          }

          onClose()
        }}
      >
        <ModalContent>
          <ModalHeader>{t('settings.title')}</ModalHeader>
          <ModalBody>
            <div className="flex flex-col gap-4">
              <Slider
                size="sm"
                label={t('settings.memory')}
                step={512}
                value={memory}
                onChange={(value) => {
                  if (typeof value == 'number') {
                    setMemory(Number(value.toFixed(0)))
                  }
                }}
                minValue={1024}
                maxValue={os.totalmem() / (1024 * 1024)}
                renderValue={(value) => {
                  return `${value.children?.toString()} ${t('settings.mb')}`
                }}
              />

              <ScrollShadow className="h-[300px] pr-1">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    <Input
                      label="IP"
                      size="sm"
                      value={serverIp}
                      onChange={(event) => {
                        if (!event) return
                        setServerIp(event.currentTarget.value)
                      }}
                    />

                    <NumberInput
                      label={t('serverSettings.port')}
                      size="sm"
                      value={serverPort}
                      minValue={0}
                      maxValue={65535}
                      onValueChange={setServerPort}
                    />

                    <NumberInput
                      label={t('serverSettings.maxPlayers')}
                      size="sm"
                      value={maxPlayers}
                      minValue={0}
                      onValueChange={setMaxPlayers}
                    />

                    <Input
                      label={t('serverSettings.description')}
                      size="sm"
                      value={motd}
                      onChange={(event) => {
                        if (!event) return
                        setMotd(event.currentTarget.value)
                      }}
                    />

                    <Select
                      label={t('serverSettings.gameMode')}
                      size="sm"
                      selectedKeys={[gameMode]}
                      onChange={(event) => {
                        const value = event.target.value
                        if (!value) return
                        setGameMode(value)
                      }}
                    >
                      {gameModes.map((mode, index) => {
                        return (
                          <SelectItem key={mode}>
                            {t(`serverSettings.gameModes.${index}`)}
                          </SelectItem>
                        )
                      })}
                    </Select>

                    <Select
                      label={t('serverSettings.difficulty')}
                      size="sm"
                      selectedKeys={[difficulty]}
                      onChange={(event) => {
                        const value = event.target.value

                        setDifficulty(value)
                      }}
                    >
                      {difficulties.map((diff, index) => {
                        return (
                          <SelectItem key={diff}>
                            {t(`serverSettings.difficulties.${index}`)}
                          </SelectItem>
                        )
                      })}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={whitelist}
                      onChange={(event) => {
                        setWhitelist(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.whitelist')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={onlineMode}
                      onChange={(event) => {
                        setOnlineMode(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.onlineMode')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={pvp}
                      onChange={(event) => {
                        setPvp(event.currentTarget.checked)
                      }}
                    >
                      PVP
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={enableCommandBlock}
                      onChange={(event) => {
                        setEnableCommandBlock(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.enableCommandBlock')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={allowFlight}
                      onChange={(event) => {
                        setAllowFlight(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.allowFlight')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={spawnAnimals}
                      onChange={(event) => {
                        setSpawnAnimals(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.spawnAnimals')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={spawnMonsters}
                      onChange={(event) => {
                        setSpawnMonsters(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.spawnMonsters')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={spawnNpcs}
                      onChange={(event) => {
                        setSpawnNpcs(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.spawnNPCs')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={allowNether}
                      onChange={(event) => {
                        setAllowNether(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.allowNether')}
                    </Checkbox>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={forceGamemode}
                      onChange={(event) => {
                        setForceGamemode(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.forceGamemode')}
                    </Checkbox>
                  </div>

                  <NumberInput
                    label={t('serverSettings.spawnProtection')}
                    size="sm"
                    value={spawnProtection}
                    minValue={0}
                    onValueChange={setSpawnProtection}
                  />

                  <div className="flex items-center gap-2">
                    <Checkbox
                      isSelected={requireResourcePack}
                      onChange={(event) => {
                        setRequireResourcePack(event.currentTarget.checked)
                      }}
                    >
                      {t('serverSettings.requireResourcePack')}
                    </Checkbox>
                  </div>

                  <div className="flex items-center gap-2">
                    {isResourcePack ? (
                      <Select
                        size="sm"
                        label={t('serverSettings.resourcePack')}
                        placeholder={t('common.select')}
                        selectedKeys={[resourcePack]}
                        onChange={(event) => {
                          const value = event.target.value

                          setResourcePack(value)
                        }}
                        renderValue={(options) => {
                          return options.map((option) => {
                            const pack = resourcePacks.find(
                              (r) => r.version?.files[0].url == option.key
                            )
                            if (!pack) return <p>{option.textValue}</p>

                            return (
                              <div className="flex items-center gap-2">
                                {pack.iconUrl && (
                                  <Image
                                    className="min-w-6 min-h-6"
                                    src={pack.iconUrl}
                                    height={24}
                                    width={24}
                                    alt=""
                                  />
                                )}
                                <p>{pack.title}</p>
                              </div>
                            )
                          })
                        }}
                      >
                        {resourcePacks.map((pack, index) => {
                          const url = pack.version?.files[0].url
                          return (
                            <SelectItem key={url || index}>
                              <div className="flex items-center gap-2">
                                {pack.iconUrl && (
                                  <Image
                                    className="min-w-6 min-h-6"
                                    src={pack.iconUrl}
                                    height={24}
                                    width={24}
                                    alt=""
                                  />
                                )}
                                <p>{pack.title}</p>
                              </div>
                            </SelectItem>
                          )
                        })}
                      </Select>
                    ) : (
                      <Input
                        label={t('serverSettings.resourcePack')}
                        size="sm"
                        value={resourcePack}
                        onChange={(event) => {
                          const value = event.currentTarget.value
                          if (!value) return
                          setResourcePack(value)
                        }}
                      />
                    )}
                    <Button
                      variant="flat"
                      isIconOnly
                      isDisabled={resourcePacks.length == 0}
                      onPress={() => {
                        const checked = !isResourcePack

                        if (checked && resourcePacks.length > 0) {
                          const pack = resourcePacks.find(
                            (pack) => pack.version?.files[0].url == resourcePack
                          )
                          if (pack && pack.version) setResourcePack(pack.version.files[0].url)
                        }

                        setIsResourcePack(checked)
                      }}
                    >
                      {isResourcePack ? <Package size={22} /> : <Link size={22} />}
                    </Button>
                  </div>

                  <Input
                    label={t('serverSettings.requestResourcePack')}
                    size="sm"
                    value={resourcePackPrompt}
                    onChange={(event) => setResourcePackPrompt(event.currentTarget.value)}
                  />
                </div>
              </ScrollShadow>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              color="success"
              variant="flat"
              isDisabled={isSaveBtnisDisabled()}
              startContent={<Save size={22} />}
              onPress={async () => {
                if (serverMemory != memory) {
                  setServerMemory(memory)
                  replaceXmxParameter(serverPath, `${memory}M`)
                }

                if (settings) {
                  if (maxPlayers != settings.maxPlayers) settings.maxPlayers = maxPlayers
                  if (gameMode != settings.gameMode) settings.gameMode = gameMode
                  if (difficulty != settings.difficulty) settings.difficulty = difficulty
                  if (whitelist != settings.whitelist) settings.whitelist = whitelist
                  if (onlineMode != settings.onlineMode) settings.onlineMode = onlineMode
                  if (pvp != settings.pvp) settings.pvp = pvp
                  if (enableCommandBlock != settings.enableCommandBlock)
                    settings.enableCommandBlock = enableCommandBlock
                  if (allowFlight != settings.allowFlight) settings.allowFlight = allowFlight
                  if (spawnAnimals != settings.spawnAnimals) settings.spawnAnimals = spawnAnimals
                  if (spawnMonsters != settings.spawnMonsters)
                    settings.spawnMonsters = spawnMonsters
                  if (spawnNpcs != settings.spawnNpcs) settings.spawnNpcs = spawnNpcs
                  if (allowNether != settings.allowNether) settings.allowNether = allowNether
                  if (forceGamemode != settings.forceGamemode)
                    settings.forceGamemode = forceGamemode
                  if (spawnProtection != settings.spawnProtection)
                    settings.spawnProtection = spawnProtection
                  if (requireResourcePack != settings.requireResourcePack)
                    settings.requireResourcePack = requireResourcePack
                  if (resourcePack != settings.resourcePack) settings.resourcePack = resourcePack
                  if (resourcePackPrompt != settings.resourcePackPrompt)
                    settings.resourcePackPrompt = resourcePackPrompt
                  if (motd != settings.motd) settings.motd = motd
                  if (serverIp != settings.serverIp) settings.serverIp = serverIp
                  if (serverPort != settings.serverPort) settings.serverPort = serverPort

                  updateServerProperty(path.join(serverPath, 'server.properties'), settings)
                }

                await fs.writeFile(
                  path.join(serverPath, 'conf.json'),
                  JSON.stringify(server),
                  'utf-8'
                )

                addToast({
                  title: t('settings.saved'),
                  color: 'success'
                })
              }}
            >
              {t('common.save')}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={isWarnModal} onClose={() => setIsWarnModal(false)}>
        <ModalContent>
          <ModalHeader>{t('common.confirmation')}</ModalHeader>

          <ModalBody>
            <div className="flex flex-col gap-4">
              <Alert color="warning" title={t('serverSettings.unsavedChanges')} />
              <div className="flex items-center gap-2">
                <Button
                  color="warning"
                  variant="flat"
                  onPress={() => {
                    setIsWarnModal(false)
                    onClose()
                  }}
                >
                  {t('common.yes')}
                </Button>
                <Button
                  variant="flat"
                  onPress={() => {
                    setIsWarnModal(false)
                  }}
                >
                  {t('common.no')}
                </Button>
              </div>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}
