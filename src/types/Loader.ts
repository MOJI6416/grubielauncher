import { ILocalProject } from './ModManager'

export const LOADERS = [
  'vanilla',
  'forge',
  'neoforge',
  'fabric',
  'quilt',
  'legacy-fabric',
  'babric',
  'ornithe',
  'bta-babric'
] as const

export type Loader = (typeof LOADERS)[number]

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
    world?: boolean
  }
}
