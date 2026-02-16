import { IAuth, ILocalAccount } from '@/types/Account'
import { IImportModpack, IVersionClassData, IVersionConf } from '@/types/IVersion'
import { TSettings } from '@/types/Settings'
import { Version } from '../game/Version'
import { DownloadItem } from '@/types/Downloader'
import { importVersion } from '../utilities/versions'
import { uploadMods } from '../utilities/share'
import { handleSafe } from '../utilities/ipc'

const fallbackVersionInit: IVersionClassData = {
  version: {} as IVersionConf,
  launcherPath: '',
  minecraftPath: '',
  versionPath: '',
  javaPath: '',
  isQuickPlayMultiplayer: false,
  isQuickPlaySingleplayer: false,
  manifest: undefined
}

const fallbackImport: IImportModpack = {
  type: 'other',
  other: null as any
}

const fallbackUploadMods = {
  mods: [],
  success: false
}

export function registerVersionIpc() {
  handleSafe(
    'version:init',
    fallbackVersionInit,
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

  handleSafe(
    'version:install',
    false,
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

  handleSafe(
    'version:getRunCommand',
    null,
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

  handleSafe(
    'version:run',
    false,
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

  handleSafe(
    'version:delete',
    false,
    async (_, versionConf: IVersionConf, isFull: boolean) => {
      const vm = new Version({} as TSettings, versionConf)
      await vm.init()
      await vm.delete(isFull)
      return true
    }
  )

  handleSafe(
    'version:save',
    false,
    async (_, settings: TSettings, versionConf: IVersionConf) => {
      const vm = new Version(settings, versionConf)
      await vm.init()
      await vm.save()
      return true
    }
  )

  handleSafe(
    'version:import',
    fallbackImport,
    async (_, filePath: string, tempPath: string) => {
      const version = await importVersion(filePath, tempPath)
      return version
    }
  )

  handleSafe(
    'share:uploadMods',
    fallbackUploadMods,
    async (_, at: string, versionConf: IVersionConf) => {
      const version = new Version({} as TSettings, versionConf)
      await version.init()
      return uploadMods(at, version)
    }
  )
}
