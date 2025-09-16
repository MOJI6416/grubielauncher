export type TVersion = 'release' | 'snapshot' | 'old_alpha' | 'old_beta'

export interface IVersionManifest {
  minecraftArguments?: string
  arguments?: {
    game: Array<
      | {
          rules: Array<{
            action: 'allow' | 'disallow'
            features: {
              is_demo_user?: boolean
              has_custom_resolution?: boolean
              has_quick_plays_support?: boolean
              is_quick_play_singleplayer?: boolean
              is_quick_play_multiplayer?: boolean
              is_quick_play_realms?: boolean
            }
          }>
          value: string | Array<string>
        }
      | string
    >
    jvm: Array<
      | {
          rules: Array<{
            action: 'allow' | 'disallow'
            os: IOS
          }>
          value: string | Array<string>
        }
      | string
    >
  }
  assetIndex: {
    id: string
    sha1: string
    size: number
    totalSize: number
    url: string
  }
  assets: string
  complianceLevel: number
  downloads: {
    client: IDownload
    server: IDownload
    client_mappings?: IDownload
    server_mappings?: IDownload
    windows_server?: IDownload
  }
  id: string
  javaVersion: {
    component: string
    majorVersion: number
  }
  libraries: Array<{
    downloads: {
      artifact: IDownload & {
        path: string
      }
      classifiers?: {
        [key: string]: IDownload & { path: string }
      }
    }
    name: string
    url?: string
    natives?: {
      linux?: string
      osx?: string
      windows?: string
    }
    rules?: Array<{
      action: 'allow' | 'disallow'
      os?: IOS
    }>
  }>
  logging: {
    client: {
      argument: string
      file: IDownload & {
        id: string
      }
      type: string
    }
  }
  mainClass: string
  minimumLauncherVersion: number
  releaseTime: string
  time: string
  type: TVersion
}

export interface IOS {
  name: 'osx' | 'windows' | 'linux'
  version?: string
  arch?: string
}

export interface IDownload {
  sha1: string
  size: number
  url: string
}
