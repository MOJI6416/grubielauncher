import { ILocalAccount } from '@/types/Account'
import {
  loadGlobalAchievementStats,
  loadStatistics,
  loadVersionWorldStatistics,
  readWorld,
  writeWorldName,
} from '../utilities/worlds'
import { handleSafe } from '../utilities/ipc'

export function registerWorldIpc() {
  handleSafe('worlds:loadStatistics', null, async (_, worldPath: string, account: ILocalAccount) => {
    return await loadStatistics(worldPath, account)
  })

  handleSafe(
    'worlds:loadVersionStatistics',
    null,
    async (_, versionPath: string, account: ILocalAccount) => {
      return await loadVersionWorldStatistics(versionPath, account)
    },
  )

  handleSafe('worlds:loadAchievementStats', null, async (_, account: ILocalAccount) => {
    return await loadGlobalAchievementStats(account)
  })

  handleSafe('worlds:readWorld', null, async (_, worldPath: string, account: ILocalAccount) => {
    return await readWorld(worldPath, account)
  })

  handleSafe('worlds:writeName', null, async (_, worldPath: string, newName: string) => {
    return await writeWorldName(worldPath, newName)
  })
}
