export interface IVersionStatistics {
  playTime: number
  launches: number
  lastLaunched: Date
  firstLaunched?: string
  longestSessionSec?: number
  crashes?: number
}

export interface ISessionResources {
  loadSec?: number
  gc?: string
  heapTypicalMb?: number
  heapPeakMb?: number
  heapCapacityMb?: number
  pauses?: {
    count: number
    long: number
    longestMs: number
    totalMs: number
  }
  processPeakMb?: number
  processTypicalMb?: number
}

export interface ISessionConfig {
  minecraft: string
  loader: string
  loaderVersion?: string
  xmxMb: number
  optimizedJvm: boolean
  javaMajor?: number
  mods: number
  modsAdded?: string[]
  modsRemoved?: string[]
  modsAddedCount?: number
  modsRemovedCount?: number
  modSet?: Record<string, string>
}

export interface IVersionSession {
  id: string
  startedAt: string
  endedAt: string
  durationSec: number
  exitCode: number
  crashed: boolean
  recovered?: boolean
  account?: string
  server?: string
  config?: ISessionConfig
  resources?: ISessionResources
}

export interface IPlaytimeSyncEntry {
  id: string
  sub: string
  seconds: number
  createdAt: string
}
