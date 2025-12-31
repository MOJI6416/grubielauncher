import { ipcMain } from 'electron'
import { Mods } from '../game/Mods'
import { TSettings } from '@/types/Settings'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'

export function registerModsIpc() {
  ipcMain.handle(
    'mods:check',
    async (_, settings: TSettings, versionConf: IVersionConf, server?: IServerConf) => {
      const mods = new Mods(settings, versionConf, server)
      await mods.check()
      return true
    }
  )

  ipcMain.handle(
    'mods:downloadOther',
    async (_, settings: TSettings, versionConf: IVersionConf) => {
      const mods = new Mods(settings, versionConf)
      await mods.downloadOther()
      return true
    }
  )
}
