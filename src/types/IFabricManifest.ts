import { IOS } from './IVersionManifest'

interface IProfileDownload {
  url?: string
  path?: string
  sha1?: string
  size?: number
}

export interface IFabricManifest {
  id: string
  inheritsFrom: string
  releaseTime: string
  time: string
  type: string
  mainClass: string
  arguments?: {
    game?: string[]
    jvm?: string[]
  }
  libraries: {
    name: string
    url?: string
    sha1?: string
    size?: number
    natives?: {
      linux?: string
      osx?: string
      windows?: string
    }
    rules?: {
      action: 'allow' | 'disallow'
      os?: IOS
    }[]
    downloads?: {
      artifact?: IProfileDownload
      classifiers?: Record<string, IProfileDownload>
    }
  }[]
}
