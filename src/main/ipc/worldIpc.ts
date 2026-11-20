import path from 'path'
import { ILocalAccount } from '@/types/Account'
import {
  countWorlds,
  duplicateWorld,
  exportWorld,
  getWorldFolderSizes,
  getWorldName,
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
import type { WebContents } from 'electron'
import { check, handleSafe } from '../utilities/ipc'
import { sendProgress, throttleProgress } from '../utilities/progressEvents'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'
import {
  IWorldBackupList,
  WorldBackupCreateResult,
  WorldBackupDeleteResult,
  WorldBackupProgressUpdate,
  WorldBackupRestoreResult,
} from '@/types/WorldBackup'
import {
  WorldDuplicateResult,
  WorldExportResult,
  WorldImportResult,
} from '@/types/World'
import { loadWorldAdvancements } from '../utilities/worldAdvancements'
import {
  inspectSchematic,
  listSchematics,
  transferSchematic,
} from '../utilities/schematics'
import {
  BlockInfo,
  BlockModelSet,
  ISchematicFile,
  SchematicInspectResult,
  SchematicTransferResult,
  SchematicVolumeResult,
} from '@/types/Schematic'
import { loadSchematicVolume } from '../utilities/schematicVolume'
import { describeBlocks } from '../utilities/blockInfo'
import { bakeBlockModels } from '../utilities/blockModels'
import { readSchematicThumbnail, saveSchematicThumbnail } from '../utilities/schematicThumbnails'

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
const INSPECT_FALLBACK: SchematicInspectResult = { ok: false, error: 'unreadable' }
const TRANSFER_FALLBACK: SchematicTransferResult = { ok: false, error: 'failed' }
const NO_SCHEMATICS: ISchematicFile[] = []
const VOLUME_FALLBACK: SchematicVolumeResult = { ok: false, error: 'unreadable' }
const NO_BLOCK_INFO: Record<string, BlockInfo> = {}
const NO_MODELS: BlockModelSet = { textures: [], blocks: [], vanillaSource: 'none' }
const isBlockId = check.nonEmptyString(512)
const isLocale = check.pattern(/^[a-zA-Z_-]{2,16}$/, 16)
const isPng = (value: unknown) => value instanceof Uint8Array && value.byteLength <= 512 * 1024

const isPath = check.nonEmptyString(4096)
const isAccount = check.optional(check.object())
const isBackupId = check.nonEmptyString(512)
const isKeep = check.optional(check.integer())

function backupProgressReporter(sender: WebContents, worldPath: string) {
  return throttleProgress((progress: WorldBackupProgressUpdate) =>
    sendProgress(sender, 'worlds:backupProgress', { worldPath, ...progress }),
  )
}

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
      await reassignWorldBackups(versionPath, fromFolder, toFolder, newName)
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
    [isPath, isPath, check.optional(check.boolean())],
    async (_, zipPath: string, versionPath: string, freeName?: boolean) => {
      assertReadablePath(zipPath, 'worlds:import')
      assertWritablePath(versionPath, 'worlds:import')

      if (isVersionRunning(versionPath)) {
        return { ok: false, error: 'versionRunning' } as WorldImportResult
      }

      return await importWorldArchive(zipPath, versionPath, { freeName: freeName === true })
    },
  )

  handleSafe('worlds:archiveName', null, [isPath], async (_, zipPath: string) => {
    assertReadablePath(zipPath, 'worlds:archiveName')
    return await getWorldName(zipPath)
  })

  handleSafe(
    'worlds:advancements',
    null,
    [isPath, isAccount, check.optional(check.string(128)), check.optional(check.arrayOf(check.string(512)))],
    async (_, worldPath: string, account: ILocalAccount, gameVersion?: string, disabled?: string[]) => {
      assertReadablePath(worldPath, 'worlds:advancements')
      return await loadWorldAdvancements(
        getVersionPathFromWorldPath(worldPath),
        worldPath,
        account,
        gameVersion ?? null,
        disabled ?? [],
      )
    },
  )

  handleSafe('schematics:list', NO_SCHEMATICS, [isPath], async (_, versionPath: string) => {
    assertReadablePath(versionPath, 'schematics:list')
    return await listSchematics(versionPath)
  })

  handleSafe('schematics:inspect', INSPECT_FALLBACK, [isPath], async (_, filePath: string) => {
    assertReadablePath(filePath, 'schematics:inspect')
    return await inspectSchematic(filePath)
  })

  handleSafe(
    'schematics:volume',
    VOLUME_FALLBACK,
    [isPath, check.optional(check.integer())],
    async (_, filePath: string, yFrom?: number | null) => {
      assertReadablePath(filePath, 'schematics:volume')
      return await loadSchematicVolume(filePath, yFrom ?? 0)
    },
  )

  handleSafe(
    'schematics:blocks',
    NO_BLOCK_INFO,
    [isPath, check.arrayOf(isBlockId, 20000), isLocale],
    async (_, versionPath: string, ids: string[], locale: string) => {
      assertReadablePath(versionPath, 'schematics:blocks')
      return await describeBlocks(versionPath, ids, locale)
    },
  )

  handleSafe(
    'schematics:models',
    NO_MODELS,
    [isPath, check.arrayOf(isBlockId, 65535)],
    async (_, versionPath: string, states: string[]) => {
      assertReadablePath(versionPath, 'schematics:models')
      return await bakeBlockModels(versionPath, states)
    },
  )

  handleSafe('schematics:thumbnail', null, [isPath], async (_, filePath: string) => {
    assertReadablePath(filePath, 'schematics:thumbnail')
    return await readSchematicThumbnail(filePath)
  })

  handleSafe(
    'schematics:saveThumbnail',
    false,
    [isPath, isPng],
    async (_, filePath: string, png: Uint8Array) => {
      assertReadablePath(filePath, 'schematics:saveThumbnail')
      return await saveSchematicThumbnail(filePath, png)
    },
  )

  handleSafe(
    'schematics:transfer',
    TRANSFER_FALLBACK,
    [isPath, check.nonEmptyString(1024), isPath, check.oneOf('copy', 'move')],
    async (_, sourceVersionPath: string, relativePath: string, targetVersionPath: string, mode: 'copy' | 'move') => {
      assertWritablePath(sourceVersionPath, 'schematics:transfer')
      assertWritablePath(targetVersionPath, 'schematics:transfer')
      return await transferSchematic(sourceVersionPath, relativePath, targetVersionPath, mode)
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

  handleSafe('worlds:createBackup', CREATE_FALLBACK, [isPath, isKeep], async (event, worldPath: string, keep: number) => {
    assertWritablePath(worldPath, 'worlds:createBackup')
    return await createWorldBackup(
      worldPath,
      'manual',
      keep,
      backupProgressReporter(event.sender, worldPath),
    )
  })

  handleSafe(
    'worlds:restoreBackup',
    RESTORE_FALLBACK,
    [isBackupId, isPath, isKeep],
    async (event, backupId: string, worldPath: string, keep: number) => {
      assertWritablePath(worldPath, 'worlds:restoreBackup')
      return await restoreWorldBackup(
        backupId,
        worldPath,
        keep,
        backupProgressReporter(event.sender, worldPath),
      )
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
