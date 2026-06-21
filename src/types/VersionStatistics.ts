export interface IVersionStatistics {
  playTime: number
  launches: number
  lastLaunched: Date
  firstLaunched?: string
  longestSessionSec?: number
  crashes?: number
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
}

export interface IPlaytimeSyncEntry {
  id: string
  sub: string
  seconds: number
  createdAt: string
}
