import { ILocalAccount } from '@/types/Account'
import {
  loadGlobalAchievementStats,
  loadStatistics,
  loadVersionWorldStatistics,
  readWorld,
  writeWorldName,
} from '../utilities/worlds'
import { handleSafe } from '../utilities/ipc'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'

export function registerWorldIpc() {
  handleSafe('worlds:loadStatistics', null, async (_, worldPath: string, account: ILocalAccount) => {
    assertReadablePath(worldPath, 'worlds:loadStatistics')
    return await loadStatistics(worldPath, account)
  })

  handleSafe(
    'worlds:loadVersionStatistics',
    null,
    async (_, versionPath: string, account: ILocalAccount) => {
      assertReadablePath(versionPath, 'worlds:loadVersionStatistics')
      return await loadVersionWorldStatistics(versionPath, account)
    },
  )

  handleSafe('worlds:loadAchievementStats', null, async (_, account: ILocalAccount) => {
    return await loadGlobalAchievementStats(account)
  })

  handleSafe('worlds:readWorld', null, async (_, worldPath: string, account: ILocalAccount) => {
    assertReadablePath(worldPath, 'worlds:readWorld')
    return await readWorld(worldPath, account)
  })

  handleSafe('worlds:writeName', null, async (_, worldPath: string, newName: string) => {
    assertWritablePath(worldPath, 'worlds:writeName')
    return await writeWorldName(worldPath, newName)
  })
}
