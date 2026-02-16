import { ILocalAccount } from '@/types/Account'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf, IServerSettings } from '@/types/Server'
import { ServerGame } from '../game/Server'
import {
  getServerSettings,
  getServersOfVersions,
  replaceXmxParameter,
  updateServerProperty
} from '../utilities/serverManager'
import { readNBT, writeNBT } from '../utilities/nbt'
import { IServer } from '@/types/ServersList'
import { Loader } from '@/types/Loader'
import { Server } from '../services/Server'
import { compareServers } from '../utilities/serverList'
import { handleSafe } from '../utilities/ipc'

export function registerServerIpc() {
  handleSafe<boolean, [ILocalAccount | undefined, number, string, string, IServerConf, IVersionConf?]>(
    'server:install',
    false,
    async (_, account, downloadLimit, versionPath, serverPath, conf, versionConf) => {
      const installer = new ServerGame(
        account,
        downloadLimit,
        versionPath,
        serverPath,
        conf,
        versionConf
      )
      await installer.install()
      return true
    }
  )

  handleSafe<any[], [IVersionConf[]]>(
    'servers:versions',
    [],
    async (_, versions) => {
      return await getServersOfVersions(versions)
    }
  )

  handleSafe<boolean, [IServer[], string]>(
    'servers:write',
    false,
    async (_, data, p) => {
      await writeNBT(data, p)
      return true
    }
  )

  handleSafe<any[], [string, Loader]>(
    'servers:get',
    [],
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
    async (_, filePath) => {
      return await getServerSettings(filePath)
    }
  )

  handleSafe<boolean, [string, number]>(
    'server:editXmx',
    false,
    async (_, serverPath, memory) => {
      await replaceXmxParameter(serverPath, `${memory}M`)
      return true
    }
  )

  handleSafe<boolean, [string, IServerSettings]>(
    'server:updateProperties',
    false,
    async (_, filePath, settings) => {
      await updateServerProperty(filePath, settings)
      return true
    }
  )

  handleSafe<IServer[], [string]>(
    'servers:read',
    [],
    async (_, p) => {
      return await readNBT(p)
    }
  )

  handleSafe<boolean, [IServer[], IServer[]]>(
    'servers:compare',
    false,
    (_, servers1, servers2) => {
      return compareServers(servers1, servers2)
    }
  )
}
