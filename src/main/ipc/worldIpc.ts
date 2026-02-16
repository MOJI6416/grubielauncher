import { ILocalAccount } from '@/types/Account'
import { loadStatistics, readWorld, writeWorldName } from '../utilities/worlds'
import { handleSafe } from '../utilities/ipc'

export function registerWorldIpc() {
  handleSafe('worlds:loadStatistics', null, async (_, worldPath: string, account: ILocalAccount) => {
    return await loadStatistics(worldPath, account)
  })

  handleSafe('worlds:readWorld', null, async (_, worldPath: string, account: ILocalAccount) => {
    return await readWorld(worldPath, account)
  })

  handleSafe('worlds:writeName', null, async (_, worldPath: string, newName: string) => {
    return await writeWorldName(worldPath, newName)
  })
}
