import { ILocalAccount } from '@/types/Account'
import {
  loadGlobalAchievementStats,
  loadStatistics,
  loadVersionWorldStatistics,
  readWorld,
  writeWorldName,
} from '../utilities/worlds'
import {
  countWorldBackups,
  createWorldBackup,
  deletePreservedCopy,
  deleteWorldBackup,
  getWorldBackupList,
  restoreWorldBackup,
} from '../utilities/worldBackups'
import { check, handleSafe } from '../utilities/ipc'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'
import {
  IWorldBackupList,
  WorldBackupCreateResult,
  WorldBackupDeleteResult,
  WorldBackupRestoreResult,
} from '@/types/WorldBackup'

const LIST_FALLBACK: IWorldBackupList = {
  backups: [],
  skipReason: null,
  preserved: [],
}
const CREATE_FALLBACK: WorldBackupCreateResult = { ok: false, error: 'failed' }
const RESTORE_FALLBACK: WorldBackupRestoreResult = { ok: false, error: 'failed' }
const DELETE_FALLBACK: WorldBackupDeleteResult = { ok: false, error: 'failed' }

const isPath = check.nonEmptyString(4096)
const isAccount = check.optional(check.object())
const isBackupId = check.nonEmptyString(512)
const isKeep = check.optional(check.integer())

export function registerWorldIpc() {
  handleSafe('worlds:loadStatistics', null, [isPath, isAccount], async (_, worldPath: string, account: ILocalAccount) => {
    assertReadablePath(worldPath, 'worlds:loadStatistics')
    return await loadStatistics(worldPath, account)
  })

  handleSafe(
    'worlds:loadVersionStatistics',
    null,
    [isPath, isAccount],
    async (_, versionPath: string, account: ILocalAccount) => {
      assertReadablePath(versionPath, 'worlds:loadVersionStatistics')
      return await loadVersionWorldStatistics(versionPath, account)
    },
  )

  handleSafe('worlds:loadAchievementStats', null, [isAccount], async (_, account: ILocalAccount) => {
    return await loadGlobalAchievementStats(account)
  })

  handleSafe('worlds:readWorld', null, [isPath, isAccount], async (_, worldPath: string, account: ILocalAccount) => {
    assertReadablePath(worldPath, 'worlds:readWorld')
    return await readWorld(worldPath, account)
  })

  handleSafe('worlds:writeName', null, [isPath, check.string(512)], async (_, worldPath: string, newName: string) => {
    assertWritablePath(worldPath, 'worlds:writeName')
    return await writeWorldName(worldPath, newName)
  })

  handleSafe('worlds:listBackups', LIST_FALLBACK, [isPath], async (_, worldPath: string) => {
    assertReadablePath(worldPath, 'worlds:listBackups')
    return await getWorldBackupList(worldPath)
  })

  handleSafe('worlds:countBackups', {}, [isPath], async (_, versionPath: string) => {
    assertReadablePath(versionPath, 'worlds:countBackups')
    return await countWorldBackups(versionPath)
  })

  handleSafe('worlds:createBackup', CREATE_FALLBACK, [isPath, isKeep], async (_, worldPath: string, keep: number) => {
    assertWritablePath(worldPath, 'worlds:createBackup')
    return await createWorldBackup(worldPath, 'manual', keep)
  })

  handleSafe(
    'worlds:restoreBackup',
    RESTORE_FALLBACK,
    [isBackupId, isPath, isKeep],
    async (_, backupId: string, worldPath: string, keep: number) => {
      assertWritablePath(worldPath, 'worlds:restoreBackup')
      return await restoreWorldBackup(backupId, worldPath, keep)
    },
  )

  handleSafe('worlds:deleteBackup', DELETE_FALLBACK, [isBackupId], async (_, backupId: string) => {
    return await deleteWorldBackup(backupId)
  })

  handleSafe('worlds:deletePreserved', DELETE_FALLBACK, [isPath], async (_, targetPath: string) => {
    assertWritablePath(targetPath, 'worlds:deletePreserved')
    return await deletePreservedCopy(targetPath)
  })
}
