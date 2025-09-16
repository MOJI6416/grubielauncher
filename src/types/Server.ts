export interface IVanillaCores {
  vanilla: IServerVersion[]
  spigot: IServerVersion[]
  bukkit: IServerVersion[]
}

export interface IServerVersion {
  version: string
  url: string
}

export enum ServerCore {
  VANILLA = 'vanilla',
  SPIGOT = 'spigot',
  BUKKIT = 'bukkit',
  PAPER = 'paper',
  FABRIC = 'fabric',
  QUILT = 'quilt',
  FORGE = 'forge',
  NEOFORGE = 'neoforge',
  PURPUR = 'purpur',
  SPONGE = 'sponge'
}

export interface IServerOption {
  core: ServerCore
  url: string
  additionalPackage: string | null
}

export interface IServerConf {
  core: ServerCore
  javaMajorVersion: number
  memory: number
  downloads: {
    server: string
    additionalPackage: string | null
  }
}

export interface IPaper {
  project_id: string
  project_name: string
  version: string
  builds: IPaperBuild[]
}

export interface IPaperBuild {
  build: number
  time: string
  channel: string
  promoted: boolean
  changes: [
    {
      commit: string
      summary: string
      message: string
    }
  ]
  downloads: {
    application: {
      name: string
      sha256: string
    }
  }
}

export interface IFablicLoader {
  loader: {
    version: string
  }
}

export interface IFabricInstaller {
  version: string
  url: string
}

export interface IPurpurVersion {
  builds: {
    latest: string
  }
}

export interface ISpongeSearchResult {
  artifacts: {
    [key: string]: any
  }
}

export interface ISpongeVersion {
  assets: {
    classifier: string
    downloadUrl: string
    extension: string
  }[]
}

export interface IServerSettings {
  maxPlayers: number
  gameMode: string
  difficulty: string
  whitelist: boolean
  onlineMode: boolean
  pvp: boolean
  enableCommandBlock: boolean
  allowFlight: boolean
  spawnAnimals: boolean
  spawnMonsters: boolean
  spawnNpcs: boolean
  allowNether: boolean
  forceGamemode: boolean
  spawnProtection: number
  requireResourcePack: boolean
  resourcePack: string
  resourcePackPrompt: string
  motd: string
  serverIp: string
  serverPort: number
}
