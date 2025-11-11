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
  stats: {
    'minecraft:custom': {
      'minecraft:play_time': number
    }
  }
}
