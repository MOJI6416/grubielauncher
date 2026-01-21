import { ILocalAccount } from '@/types/Account'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf, IServerSettings } from '@/types/Server'
import { ipcMain } from 'electron'
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

export function registerServerIpc() {
  ipcMain.handle(
    'server:install',
    async (
      _,
      account: ILocalAccount | undefined,
      downloadLimit: number,
      versionPath: string,
      serverPath: string,
      conf: IServerConf,
      versionConf?: IVersionConf
    ) => {
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

  ipcMain.handle('servers:versions', async (_, versions: IVersionConf[]) => {
    return await getServersOfVersions(versions)
  })

  ipcMain.handle('servers:write', async (_, data: IServer[], path: string) => {
    await writeNBT(data, path)
  })

  ipcMain.handle('servers:get', async (_, version: string, loader: Loader) => {
    const servers = await Server.get(version, loader)
    return servers
  })

  ipcMain.handle('server:getSettings', async (_, filePath: string) => {
    return await getServerSettings(filePath)
  })

  ipcMain.handle('server:editXmx', async (_, serverPath: string, memory: number) => {
    await replaceXmxParameter(serverPath, `${memory}M`)
  })

  ipcMain.handle(
    'server:updateProperties',
    async (_, filePath: string, settings: IServerSettings) => {
      await updateServerProperty(filePath, settings)
    }
  )

  ipcMain.handle('servers:read', async (_, path: string) => {
    return await readNBT(path)
  })

  ipcMain.handle('servers:compare', (_, servers1: IServer[], servers2: IServer[]) => {
    return compareServers(servers1, servers2)
  })
}
