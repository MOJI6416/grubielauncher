import { Mods } from '../game/Mods'
import { TSettings } from '@/types/Settings'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'
import { handleSafe } from '../utilities/ipc'

export function registerModsIpc() {
  handleSafe<boolean>(
    'mods:check',
    false,
    async (_event, settings: TSettings, versionConf: IVersionConf, server?: IServerConf) => {
      const mods = new Mods(settings, versionConf, server)
      await mods.check()
      return true
    }
  )

  handleSafe<boolean>(
    'mods:downloadOther',
    false,
    async (_event, settings: TSettings, versionConf: IVersionConf) => {
      const mods = new Mods(settings, versionConf)
      await mods.downloadOther()
      return true
    }
  )
}
