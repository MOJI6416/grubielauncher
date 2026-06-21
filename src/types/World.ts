export interface IWorld {
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
