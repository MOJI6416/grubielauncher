import { pingServer, type ServerPingResult } from '../utilities/serverPing'
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
  hasRunningServers,
  sendServerCommand,
  startServer,
  stopAllServers,
  stopServer
} from '../game/Server'
import {
  getServerSettings,
  getServersOfVersions,
  readServerRunOptions,
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
import { tryBeginInstallOperation } from './installLock'
import { resumeDownloads } from '../utilities/downloader'
import { VERSION_INSTALL_CANCELLED } from '@/types/InstallationProgress'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'
import { isPortAvailable } from '../utilities/portCheck'
import { getLanAddress } from '../utilities/lanAddress'

const isPath = check.nonEmptyString(4096)
const isConf = check.object()
const isOptionalConf = check.optional(check.object())
const isServerList = check.arrayOf(check.object(), 5000)
const isLoader = check.oneOf('vanilla', 'forge', 'neoforge', 'fabric', 'quilt')

export function registerServerIpc() {
  handleSafe<
    { success: boolean; error?: string; cancelled?: boolean },
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

      let installer: ServerGame | null = null
      const lock = tryBeginInstallOperation(() => installer?.cancel())

      if (!lock) {
        return {
          success: false,
          error: 'Another installation operation is already running.'
        }
      }

      resumeDownloads()

      try {
        installer = new ServerGame(
          account,
          downloadLimit,
          versionPath,
          serverPath,
          conf,
          versionConf
        )

        await installer.install({ ...options, signal: lock.controller.signal })
        return { success: true }
      } catch (error) {
        if (
          lock.controller.signal.aborted ||
          (error instanceof Error && error.message === 'AbortError')
        ) {
          return {
            success: false,
            cancelled: true,
            error: VERSION_INSTALL_CANCELLED
          }
        }

        console.error('[server:install] failed:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      } finally {
        resumeDownloads()
        lock.end()
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

  handleSafe<IServerSettings | null, [string]>(
    'server:getSettings',
    null,
    [isPath],
    async (_, filePath) => {
      assertReadablePath(filePath, 'server:getSettings')
      return await getServerSettings(filePath)
    }
  )

  handleSafe<
    { memory: number | null; aikarFlags: boolean | null },
    [string]
  >(
    'server:runOptions',
    { memory: null, aikarFlags: null },
    [isPath],
    async (_, serverPath) => {
      assertReadablePath(serverPath, 'server:runOptions')
      return await readServerRunOptions(serverPath)
    }
  )

  handleSafe<boolean, []>('server:stopAll', false, [], async () => {
    await stopAllServers()
    return !hasRunningServers()
  })

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

  handleSafe<ServerRunResult, [string, string]>(
    'server:command',
    { ok: false, error: 'server_command_failed' },
    [isPath, check.nonEmptyString(512)],
    async (_, serverPath, command) => {
      assertWritablePath(serverPath, 'server:command')
      return await sendServerCommand(serverPath, command)
    }
  )

  handleSafe<string | null, []>('server:lanAddress', null, [], () =>
    getLanAddress()
  )

  handleSafe<ServerRunStatus, [string]>(
    'server:runStatus',
    { serverPath: '', state: 'stopped', pid: null, startedAt: null, log: [] },
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
      return await replaceXmxParameter(serverPath, `${memory}M`)
    }
  )

  handleSafe<boolean, [string, boolean]>(
    'server:setAikar',
    false,
    [isPath, check.boolean()],
    async (_, serverPath, enabled) => {
      assertWritablePath(serverPath, 'server:setAikar')
      return await setServerAikarFlags(serverPath, enabled)
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

  handleSafe<ServerPingResult, [string]>(
    'servers:ping',
    { online: false },
    [check.nonEmptyString(512)],
    async (_, address) => {
      return await pingServer(address)
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
