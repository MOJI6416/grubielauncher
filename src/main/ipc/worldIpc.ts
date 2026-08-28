import path from 'path'
import { ILocalAccount } from '@/types/Account'
import {
  countWorlds,
  duplicateWorld,
  exportWorld,
  getWorldFolderSizes,
  importWorldArchive,
  loadGlobalAchievementStats,
  loadVersionWorldStatistics,
  readWorld,
  writeWorldName,
} from '../utilities/worlds'
import {
  countWorldBackups,
  createWorldBackup,
  deletePreservedCopy,
  deleteWorldBackup,
  getVersionPathFromWorldPath,
  getWorldBackupList,
  isVersionRunning,
  reassignPreservedCopies,
  reassignWorldBackups,
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
import {
  WorldDuplicateResult,
  WorldExportResult,
  WorldImportResult,
} from '@/types/World'

const LIST_FALLBACK: IWorldBackupList = {
  backups: [],
  skipReason: null,
  preserved: [],
}
const CREATE_FALLBACK: WorldBackupCreateResult = { ok: false, error: 'failed' }
const RESTORE_FALLBACK: WorldBackupRestoreResult = { ok: false, error: 'failed' }
const DELETE_FALLBACK: WorldBackupDeleteResult = { ok: false, error: 'failed' }
const DUPLICATE_FALLBACK: WorldDuplicateResult = { ok: false, error: 'failed' }
const EXPORT_FALLBACK: WorldExportResult = { ok: false, error: 'failed' }
const IMPORT_FALLBACK: WorldImportResult = { ok: false, error: 'failed' }

const isPath = check.nonEmptyString(4096)
const isAccount = check.optional(check.object())
const isBackupId = check.nonEmptyString(512)
const isKeep = check.optional(check.integer())

export function registerWorldIpc() {
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

    const versionPath = getVersionPathFromWorldPath(worldPath)
    if (isVersionRunning(versionPath)) return null

    const nextPath = await writeWorldName(worldPath, newName)
    if (!nextPath) return null

    const fromFolder = path.basename(path.resolve(worldPath))
    const toFolder = path.basename(nextPath)

    if (fromFolder !== toFolder) {
      await reassignWorldBackups(path.basename(path.resolve(versionPath)), fromFolder, toFolder, newName)
      await reassignPreservedCopies(path.dirname(nextPath), fromFolder, toFolder)
    }

    return nextPath
  })

  handleSafe<number | null, [string]>('worlds:count', null, [isPath], async (_, versionPath: string) => {
    assertReadablePath(versionPath, 'worlds:count')
    return await countWorlds(versionPath)
  })

  handleSafe('worlds:folderSizes', {}, [isPath], async (_, versionPath: string) => {
    assertReadablePath(versionPath, 'worlds:folderSizes')
    return await getWorldFolderSizes(versionPath)
  })

  handleSafe(
    'worlds:duplicate',
    DUPLICATE_FALLBACK,
    [isPath, check.string(512)],
    async (_, worldPath: string, newName: string) => {
      assertWritablePath(worldPath, 'worlds:duplicate')

      if (isVersionRunning(getVersionPathFromWorldPath(worldPath))) {
        return { ok: false, error: 'versionRunning' } as WorldDuplicateResult
      }

      return await duplicateWorld(worldPath, newName)
    },
  )

  handleSafe(
    'worlds:export',
    EXPORT_FALLBACK,
    [isPath, isPath],
    async (_, worldPath: string, destinationDir: string) => {
      assertReadablePath(worldPath, 'worlds:export')
      assertWritablePath(destinationDir, 'worlds:export')

      if (isVersionRunning(getVersionPathFromWorldPath(worldPath))) {
        return { ok: false, error: 'versionRunning' } as WorldExportResult
      }

      return await exportWorld(worldPath, destinationDir)
    },
  )

  handleSafe(
    'worlds:import',
    IMPORT_FALLBACK,
    [isPath, isPath],
    async (_, zipPath: string, versionPath: string) => {
      assertReadablePath(zipPath, 'worlds:import')
      assertWritablePath(versionPath, 'worlds:import')

      if (isVersionRunning(versionPath)) {
        return { ok: false, error: 'versionRunning' } as WorldImportResult
      }

      return await importWorldArchive(zipPath, versionPath)
    },
  )

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
