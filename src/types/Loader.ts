import { ILocalProject } from './ModManager'

export type Loader = 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt'

export interface ILoader {
  name: Loader
  version?: {
    id: string
    url: string
  }
  mods: ILocalProject[]
  other?: {
    paths: string[]
    url: string
    size: number
  }
}
