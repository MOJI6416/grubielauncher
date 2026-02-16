import { Loader } from '@/types/Loader'
import {
  ILocalProject,
  IProject,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider
} from '@/types/ModManager'
import { ServerCore } from '@/types/Server'
import { ModManager } from '../services/ModManager'
import { checkLocalMod, checkModpack, compareMods, projetTypeToFolder } from '../utilities/modManager'
import { handleSafe } from '../utilities/ipc'


export function registerModManagerIpc() {
  handleSafe(
    'modManager:search',
    (_query: string, _provider: Provider, _options: any, pagination: { offset: number; limit: number }) => ({
      projects: [],
      limit: pagination?.limit ?? 0,
      offset: 0,
      total: 0
    }),
    async (
      _,
      query: string,
      provider: Provider,
      options: {
        version: string | undefined
        loader: Loader | ServerCore | undefined
        projectType: ProjectType
        sort: string
        filter: string[]
      },
      pagination: {
        offset: number
        limit: number
      }
    ) => {
      return await ModManager.search(query, provider, options, pagination)
    }
  )

  handleSafe<string[]>('modManager:getSort', [], async (_, provider: Provider) => {
    return ModManager.getSort(provider)
  })

  handleSafe<any[]>('modManager:getFilter', [], async (_, provider: Provider, projectType: ProjectType) => {
    return ModManager.getFilter(provider, projectType)
  })

  handleSafe<IProject | null>('modManager:getProject', null, async (_, provider: Provider, projectId: string) => {
    return await ModManager.getProject(provider, projectId)
  })

  handleSafe<IVersion[]>('modManager:getVersions', [], async (
    _,
    provider: Provider,
    projectId: string,
    options: { version?: string; loader?: Loader; projectType: ProjectType; modUrl: string }
  ) => {
    return await ModManager.getVersions(provider, projectId, options)
  })

  handleSafe<IVersionDependency[]>('modManager:getDependencies', [], async (
    _,
    provider: Provider,
    projectId: string,
    deps: IVersionDependency[]
  ) => {
    return await ModManager.getDependencies(provider, projectId, deps)
  })

  handleSafe('modManager:checkLocalMod', null, async (_, modPath: string) => {
    return await checkLocalMod(modPath)
  })

  handleSafe('modManager:checkModpack', null, async (
    _,
    modpackPath: string,
    pack?: IProject,
    selectVersion?: IVersion
  ) => {
    return await checkModpack(modpackPath, pack, selectVersion)
  })

  handleSafe<string>('modManager:ptToFolder', '', async (_, pt: ProjectType) => {
    return projetTypeToFolder(pt)
  })

  handleSafe<boolean>('modManager:compareMods', false, async (
    _,
    mods1: ILocalProject[],
    mods2: ILocalProject[]
  ) => {
    return compareMods(mods1, mods2)
  })
}
