import { IAuth, ILocalAccount } from '@/types/Account'
import { IVersionClassData, IVersionConf } from '@/types/IVersion'
import { TSettings } from '@/types/Settings'
import { ipcMain } from 'electron'
import { Version } from '../game/Version'
import { DownloadItem } from '@/types/Downloader'
import { importVersion } from '../utilities/versions'
import { uploadMods } from '../utilities/share'

export function registerVersionIpc() {
  ipcMain.handle(
    'version:init',
    async (_, settings: TSettings, versionConf: IVersionConf): Promise<IVersionClassData> => {
      const vm = new Version(settings, versionConf)
      await vm.init()
      return {
        version: vm.version,
        launcherPath: vm.launcherPath,
        minecraftPath: vm.minecraftPath,
        versionPath: vm.versionPath,
        javaPath: vm.javaPath,
        isQuickPlayMultiplayer: vm.isQuickPlayMultiplayer,
        isQuickPlaySingleplayer: vm.isQuickPlaySingleplayer,
        manifest: vm.manifest
      }
    }
  )

  ipcMain.handle(
    'version:install',
    async (
      _,
      settings: TSettings,
      versionConf: IVersionConf,
      account: ILocalAccount,
      extraItems?: DownloadItem[]
    ) => {
      const vm = new Version(settings, versionConf)
      await vm.init()
      await vm.install(account, extraItems || [])
      await vm.save()
      return true
    }
  )

  ipcMain.handle(
    'version:getRunCommand',
    async (
      _,
      settings: TSettings,
      versionConf: IVersionConf,
      account: ILocalAccount,
      authData: IAuth | null,
      isRelative: boolean,
      quick?: { single?: string; multiplayer?: string }
    ) => {
      const vm = new Version(settings, versionConf)
      await vm.init()
      return await vm.getRunCommand(
        account,
        settings,
        authData,
        isRelative,
        quick?.single,
        quick?.multiplayer
      )
    }
  )

  ipcMain.handle(
    'version:run',
    async (
      _,
      settings: TSettings,
      versionConf: IVersionConf,
      account: ILocalAccount,
      authData: IAuth | null,
      instance: number,
      quick: { single?: string; multiplayer?: string }
    ) => {
      const vm = new Version(settings, versionConf)
      await vm.init()
      await vm.run(account, settings, authData, instance, quick)
      return true
    }
  )

  ipcMain.handle('version:delete', async (_, versionConf: IVersionConf, isFull: boolean) => {
    const vm = new Version({} as TSettings, versionConf)
    await vm.init()
    await vm.delete(isFull)
    return true
  })

  ipcMain.handle('version:save', async (_, settings: TSettings, versionConf: IVersionConf) => {
    const vm = new Version(settings, versionConf)
    await vm.init()
    await vm.save()
  })

  ipcMain.handle('version:import', async (_, filePath: string, tempPath) => {
    const version = await importVersion(filePath, tempPath)
    return version
  })

  ipcMain.handle('share:uploadMods', async (_, at: string, versionConf: IVersionConf) => {
    const version = new Version({} as TSettings, versionConf)
    await version.init()
    return uploadMods(at, version)
  })
}
