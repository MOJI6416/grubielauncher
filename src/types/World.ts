export type WorldGameMode = 'survival' | 'creative' | 'adventure' | 'spectator'

export type WorldDifficulty = 'peaceful' | 'easy' | 'normal' | 'hard'

export interface IWorldMeta {
  gameMode?: WorldGameMode
  difficulty?: WorldDifficulty
  hardcore?: boolean
  cheats?: boolean
  versionName?: string
  dataVersion?: number
  lastPlayed?: number
  worldAgeTicks?: number
  spawn?: { x: number; y: number; z: number }
  enabledDatapacks?: string[]
  disabledDatapacks?: string[]
}

export interface IWorld extends IWorldMeta {
  name: string
  seed: string
  folderName: string
  path: string
  icon?: string
  statistics?: IWorldStatistics
  isDownloaded: boolean
  datapacks: string[]
}

export interface IWorldStatistics {
  stats: Record<string, Record<string, number>>
}

export interface IWorldStatsAggregate {
  worlds: number
  playTimeTicks: number
  deaths: number
  mobKills: number
  distanceCm: number
  blocksMined: number
  jumps: number
}

export type WorldTransferErrorCode =
  | 'worldMissing'
  | 'versionRunning'
  | 'nameTaken'
  | 'archiveInvalid'
  | 'archiveTooLarge'
  | 'failed'

export type WorldDuplicateResult =
  | { ok: true; path: string }
  | { ok: false; error: WorldTransferErrorCode }

export type WorldExportResult =
  | { ok: true; path: string; size: number }
  | { ok: false; error: WorldTransferErrorCode }

export type WorldImportResult =
  | { ok: true; path: string; name: string }
  | { ok: false; error: WorldTransferErrorCode }
