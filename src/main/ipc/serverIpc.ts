import { ILocalAccount } from '@/types/Account'
import { IVersionConf } from '@/types/IVersion'
import {
  IServerConf,
  IServerSettings,
  ServerRunResult,
  ServerRunStatus
} from '@/types/Server'
import {
  ServerGame,
  getServerRunStatus,
  startServer,
  stopServer
} from '../game/Server'
import {
  getServerSettings,
  getServersOfVersions,
  replaceXmxParameter,
  setServerAikarFlags,
  updateServerProperty
} from '../utilities/serverManager'
import { readNBT, writeNBT } from '../utilities/nbt'
import { IServer } from '@/types/ServersList'
import { Loader } from '@/types/Loader'
import { Server } from '../services/Server'
import { compareServers } from '../utilities/serverList'
import { check, handleSafe } from '../utilities/ipc'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'
import { isPortAvailable } from '../utilities/portCheck'

const isPath = check.nonEmptyString(4096)
const isConf = check.object()
const isOptionalConf = check.optional(check.object())
const isServerList = check.arrayOf(check.object(), 5000)
const isLoader = check.oneOf('vanilla', 'forge', 'neoforge', 'fabric', 'quilt')

export function registerServerIpc() {
  handleSafe<
    { success: boolean; error?: string },
    [
      ILocalAccount | undefined,
      number,
      string,
      string,
      IServerConf,
      IVersionConf?,
      { keepProgressOpen?: boolean }?
    ]
  >(
    'server:install',
    { success: false, error: 'Server installation failed.' },
    [
      isOptionalConf,
      check.number(),
      isPath,
      isPath,
      isConf,
      isOptionalConf,
      isOptionalConf
    ],
    async (
      _,
      account,
      downloadLimit,
      versionPath,
      serverPath,
      conf,
      versionConf,
      options
    ) => {
      assertWritablePath(versionPath, 'server:install')
      assertWritablePath(serverPath, 'server:install')

      const installer = new ServerGame(
        account,
        downloadLimit,
        versionPath,
        serverPath,
        conf,
        versionConf
      )

      try {
        await installer.install(options)
        return { success: true }
      } catch (error) {
        console.error('[server:install] failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    }
  )

  handleSafe<any[], [IVersionConf[]]>(
    'servers:versions',
    [],
    [check.arrayOf(check.object(), 5000)],
    async (_, versions) => {
      return await getServersOfVersions(versions)
    }
  )

  handleSafe<boolean, [IServer[], string]>(
    'servers:write',
    false,
    [isServerList, isPath],
    async (_, data, p) => {
      assertWritablePath(p, 'servers:write')
      await readNBT(p)
      await writeNBT(data, p)
      return true
    }
  )

  handleSafe<any[], [string, Loader]>(
    'servers:get',
    [],
    [check.nonEmptyString(64), isLoader],
    async (_, version, loader) => {
      return await Server.get(version, loader)
    }
  )

  handleSafe<IServerSettings, [string]>(
    'server:getSettings',
    {
      maxPlayers: 20,
      gameMode: 'survival',
      difficulty: 'normal',
      whitelist: false,
      onlineMode: true,
      pvp: true,
      enableCommandBlock: false,
      allowFlight: false,
      spawnAnimals: true,
      spawnMonsters: true,
      spawnNpcs: true,
      allowNether: true,
      forceGamemode: false,
      spawnProtection: 16,
      requireResourcePack: false,
      resourcePack: '',
      resourcePackPrompt: '',
      motd: '',
      serverIp: '',
      serverPort: 25565
    },
    [isPath],
    async (_, filePath) => {
      assertReadablePath(filePath, 'server:getSettings')
      return await getServerSettings(filePath)
    }
  )

  handleSafe<ServerRunResult, [string]>(
    'server:start',
    { ok: false, error: 'server_start_failed' },
    [isPath],
    async (_, serverPath) => {
      assertWritablePath(serverPath, 'server:start')
      return await startServer(serverPath)
    }
  )

  handleSafe<ServerRunResult, [string, boolean?]>(
    'server:stop',
    { ok: false, error: 'server_stop_failed' },
    [isPath, check.optional(check.boolean())],
    async (_, serverPath, force) => {
      assertWritablePath(serverPath, 'server:stop')
      return await stopServer(serverPath, force === true)
    }
  )

  handleSafe<ServerRunStatus, [string]>(
    'server:runStatus',
    { serverPath: '', state: 'stopped', pid: null, log: [] },
    [isPath],
    async (_, serverPath) => {
      assertReadablePath(serverPath, 'server:runStatus')
      return await getServerRunStatus(serverPath)
    }
  )

  handleSafe<boolean, [number]>(
    'server:isPortAvailable',
    true,
    [check.integer()],
    async (_, port: number) => await isPortAvailable(port)
  )

  handleSafe<boolean, [string, number]>(
    'server:editXmx',
    false,
    [isPath, check.number()],
    async (_, serverPath, memory) => {
      assertWritablePath(serverPath, 'server:editXmx')
      await replaceXmxParameter(serverPath, `${memory}M`)
      return true
    }
  )

  handleSafe<boolean, [string, boolean]>(
    'server:setAikar',
    false,
    [isPath, check.boolean()],
    async (_, serverPath, enabled) => {
      assertWritablePath(serverPath, 'server:setAikar')
      await setServerAikarFlags(serverPath, enabled)
      return true
    }
  )

  handleSafe<boolean, [string, IServerSettings]>(
    'server:updateProperties',
    false,
    [isPath, isConf],
    async (_, filePath, settings) => {
      assertWritablePath(filePath, 'server:updateProperties')
      await updateServerProperty(filePath, settings)
      return true
    }
  )

  handleSafe<IServer[], [string]>(
    'servers:read',
    [],
    [isPath],
    async (_, p) => {
      assertReadablePath(p, 'servers:read')
      return await readNBT(p)
    }
  )

  handleSafe<boolean, [IServer[], IServer[]]>(
    'servers:compare',
    false,
    [isServerList, isServerList],
    (_, servers1, servers2) => {
      return compareServers(servers1, servers2)
    }
  )
}
