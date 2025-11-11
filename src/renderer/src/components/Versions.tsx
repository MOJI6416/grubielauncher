const api = window.api
const path = api.path
const fs = api.fs
const shell = api.shell
const rimraf = api.rimraf

import { useState } from 'react'
import { loaders } from './Loaders'

import { IServer as IServerSM } from '@/types/ServersList'
import { readNBT } from '../utilities/Nbt'
import { useTranslation } from 'react-i18next'
import { IServerConf } from '@/types/Server'
import { ServerControl } from './ServerControl/Control'
import { Settings, Folder, ServerCog, ChartArea } from 'lucide-react'
import { VersionStatistics } from './VersionStatistics'
import { IVersionStatistics } from '@/types/VersionStatistics'
import { useAtom } from 'jotai'
import {
  accountAtom,
  accountsAtom,
  backendServiceAtom,
  consolesAtom,
  isDownloadedVersionAtom,
  isOwnerVersionAtom,
  isRunningAtom,
  networkAtom,
  pathsAtom,
  selectedVersionAtom,
  serverAtom,
  versionsAtom,
  versionServersAtom
} from '@renderer/stores/Main'
import { EditVersion } from './Modals/Version/EditVersion'
import { addToast, Alert, Avatar, Button, Card, CardBody, Image, ScrollShadow } from '@heroui/react'
import { checkDiffenceUpdateData } from '@renderer/utilities/Versions'
import { isOwner } from '@renderer/utilities/Other'
import { RunGameParams } from '@renderer/App'

export interface IProgress {
  value: number
  title: string
}

enum LoadingType {
  SERVER = 'server',
  INSTALL_SERVER = 'install_server',
  INSTALL = 'install',
  DELETE = 'delete',
  SEARCH = 'search',
  SHARE = 'share',
  LOAD = 'load',
  CHECK = 'check',
  SAVE = 'save',
  UPDATE = 'update',
  VERSIONS = 'versions',
  LOADERS = 'loaders',
  SYNC = 'sync',
  STATISTICS = 'statistics',
  CHECK_DIFF_SHARE = 'check_diff_share'
}

export type VersionDiffence = 'sync' | 'new' | 'old'

export function Versions({ runGame }: { runGame: (params: RunGameParams) => Promise<void> }) {
  const [editVersion, setEditVersion] = useState(false)

  const [isLoading, setIsLoading] = useState(false)
  const setServers = useAtom(versionServersAtom)[1]
  const [versionDiffence, setVersionDiffence] = useState<VersionDiffence>('sync')

  const [loadingType, setLoadingType] = useState<LoadingType | null>(null)
  const [isServerManager, setIsServerManager] = useState(false)
  const [server, setServer] = useAtom(serverAtom)
  const [account] = useAtom(accountAtom)
  const [isStatistics, setIsStatistics] = useState(false)
  const [statisticsOpen, setStatisticsOpen] = useState(false)
  const [statistics, setStatistics] = useState<IVersionStatistics | null>(null)
  const [isRunning] = useAtom(isRunningAtom)
  const [selectedVersion, setSelectedVersion] = useAtom(selectedVersionAtom)
  const [paths] = useAtom(pathsAtom)
  const { t } = useTranslation()
  const [versions] = useAtom(versionsAtom)
  const [isNetwork] = useAtom(networkAtom)
  const [accounts] = useAtom(accountsAtom)
  const setIsDownloadedVersion = useAtom(isDownloadedVersionAtom)[1]
  const setIsOwnerVersion = useAtom(isOwnerVersionAtom)[1]
  const backendService = useAtom(backendServiceAtom)[0]
  const [consoles] = useAtom(consolesAtom)

  return (
    <>
      <div className="w-full h-full">
        {versions.length == 0 ? (
          <div className="flex items-start space-x-4 w-full">
            <Alert color="warning" title={t('versions.noVersions')} />
          </div>
        ) : (
          <ScrollShadow className="h-full">
            {versions
              .sort((a, b) => {
                const aTime = new Date(a.version.lastLaunch)?.getTime() ?? 0
                const bTime = new Date(b.version.lastLaunch)?.getTime() ?? 0
                return bTime - aTime
              })
              .map((vc, index) => {
                const isRunningInstance = consoles.consoles.some(
                  (c) => c.versionName == vc.version.name && c.status == 'running'
                )

                return (
                  <Card
                    className={`w-full mb-2 ${selectedVersion?.version.name == vc.version.name ? 'border-primary-200 border-1' : ''}`}
                    key={index}
                    isPressable={!isRunning && !!account}
                    onPress={async () => {
                      if (!account || isLoading || isRunning) return

                      setSelectedVersion(vc)
                      setIsDownloadedVersion(vc.version.downloadedVersion)
                      setIsOwnerVersion(isOwner(vc.version.owner, account))

                      const serverPath = path.join(vc.versionPath, 'server')
                      const serverConf = path.join(serverPath, 'conf.json')

                      try {
                        await fs.access(serverPath)
                        const conf: IServerConf = await fs.readJSON(serverConf, {
                          encoding: 'utf-8'
                        })

                        setServer(conf)
                      } catch {
                        setServer(undefined)
                      }

                      const statisticsPath = path.join(vc.versionPath, 'statistics.json')
                      let isStatistics = false
                      try {
                        await fs.access(statisticsPath)
                        isStatistics = true
                      } catch {}

                      setIsStatistics(isStatistics)
                    }}
                  >
                    <CardBody>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-4 items-center min-w-0">
                          {vc.version.owner && !isOwner(vc.version.owner, account) && (
                            <Avatar
                              src={
                                accounts?.find(
                                  (a) =>
                                    a.type == vc.version.owner?.split('_')[0] &&
                                    a.nickname == vc.version.owner?.split('_')[1]
                                )?.image
                              }
                              name={
                                accounts?.find(
                                  (a) =>
                                    a.type == vc.version.owner?.split('_')[0] &&
                                    a.nickname == vc.version.owner?.split('_')[1]
                                )?.nickname
                              }
                              size="sm"
                            />
                          )}

                          {vc.version.image && (
                            <Image
                              src={vc.version.image}
                              width={44}
                              height={44}
                              className="h-11 w-11"
                            />
                          )}

                          <p className="truncate flex-grow">{vc.version.name}</p>

                          <p className={loaders[vc.version.loader.name].style}>
                            {loaders[vc.version.loader.name].name}
                          </p>
                          <p>{vc.version.version.id}</p>
                        </div>
                        {selectedVersion == vc && (
                          <div className="flex gap-1 items-center">
                            {isStatistics && vc.versionPath && (
                              <Button
                                variant="flat"
                                isIconOnly
                                isLoading={isLoading && loadingType == LoadingType.STATISTICS}
                                isDisabled={!isOwner(vc.version.owner, account)}
                                onPress={async () => {
                                  const filePath = path.join(vc.versionPath, 'statistics.json')

                                  try {
                                    try {
                                      await fs.access(filePath)
                                    } catch {
                                      return
                                    }

                                    setIsLoading(true)
                                    setLoadingType(LoadingType.STATISTICS)

                                    const data: IVersionStatistics = await fs.readJSON(filePath, {
                                      encoding: 'utf-8'
                                    })

                                    setStatistics(data)
                                    setStatisticsOpen(true)
                                  } catch (err) {
                                    try {
                                      await rimraf(filePath)
                                      setIsStatistics(false)
                                    } catch {}
                                    addToast({
                                      title: t('versionStatistics.error'),
                                      color: 'danger'
                                    })
                                  } finally {
                                    setIsLoading(false)
                                    setLoadingType(null)
                                  }
                                }}
                              >
                                <ChartArea size={22} />
                              </Button>
                            )}

                            <Button
                              variant="flat"
                              isIconOnly
                              onPress={() => {
                                shell.openPath(vc.versionPath)
                              }}
                            >
                              <Folder size={22} />
                            </Button>

                            {server && (
                              <Button
                                variant="flat"
                                isIconOnly
                                isDisabled={!isOwner(vc.version.owner, account)}
                                onPress={() => setIsServerManager(true)}
                              >
                                <ServerCog size={22} />
                              </Button>
                            )}

                            <Button
                              variant="flat"
                              isIconOnly
                              isLoading={isLoading && loadingType == LoadingType.LOAD}
                              isDisabled={isRunning || isRunningInstance}
                              onPress={async () => {
                                setLoadingType(LoadingType.LOAD)
                                setIsLoading(true)

                                let servers: IServerSM[] = []
                                if (selectedVersion) {
                                  const serversPath = path.join(vc.versionPath, 'servers.dat')

                                  try {
                                    const data = await readNBT(serversPath)
                                    setServers(data)
                                  } catch {
                                    setServers([])
                                  }
                                }

                                if (
                                  selectedVersion &&
                                  selectedVersion.version.shareCode &&
                                  isOwner(selectedVersion.version.owner, account) &&
                                  isNetwork
                                ) {
                                  try {
                                    const modpackData = await backendService.getModpack(
                                      selectedVersion.version.shareCode
                                    )

                                    if (modpackData.status == 'not_found') {
                                      selectedVersion.version.shareCode = undefined
                                      selectedVersion.version.downloadedVersion = false
                                      await selectedVersion.save()
                                    } else if (modpackData.data) {
                                      const modpack = modpackData.data

                                      let status: VersionDiffence = 'sync'

                                      if (modpack.build) {
                                        if (
                                          selectedVersion.version.downloadedVersion &&
                                          modpack.build < vc.version.build
                                        ) {
                                          status = 'new'
                                        } else if (modpack.build > vc.version.build) {
                                          status = 'old'
                                        }
                                      }

                                      if (status == 'sync') {
                                        const diff = await checkDiffenceUpdateData({
                                          mods: vc.version.loader.mods,
                                          runArguments: vc.version.runArguments || {
                                            game: '',
                                            jvm: ''
                                          },
                                          servers,
                                          version: vc.version,
                                          versionPath: vc.versionPath,
                                          logo: vc.version.image || '',
                                          quickServer: vc.version.quickServer || ''
                                        })

                                        if (diff) {
                                          status = !vc.version.downloadedVersion ? 'new' : 'old'
                                        }
                                      }

                                      setVersionDiffence(status)
                                    }
                                  } catch {}
                                }

                                setEditVersion(true)
                                setLoadingType(null)
                                setIsLoading(false)
                              }}
                            >
                              <Settings size={22} />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                )
              })}
          </ScrollShadow>
        )}
      </div>

      {editVersion && selectedVersion && (
        <EditVersion
          closeModal={async () => {
            setEditVersion(false)
            await rimraf(path.join(paths.launcher, 'temp'))
          }}
          vd={versionDiffence}
          runGame={runGame}
        />
      )}

      {statisticsOpen && statistics && (
        <VersionStatistics
          onClose={() => {
            setStatisticsOpen(false)
            setStatistics(null)
          }}
          statistics={statistics}
        />
      )}

      {isServerManager && server && selectedVersion && (
        <ServerControl
          onClose={() => setIsServerManager(false)}
          onDelete={() => setServer(undefined)}
        />
      )}
    </>
  )
}
