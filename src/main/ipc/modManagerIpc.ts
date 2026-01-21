import { Loader } from '@/types/Loader'
import { IProject, IVersion, IVersionDependency, ProjectType, Provider } from '@/types/ModManager'
import { ServerCore } from '@/types/Server'
import { ipcMain } from 'electron'
import { ModManager } from '../services/ModManager'
import { checkLocalMod, checkModpack, projetTypeToFolder } from '../utilities/modManager'

export function registerModManagerIpc() {
  ipcMain.handle(
    'modManager:search',
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

  ipcMain.handle('modManager:getSort', (_, provider: Provider) => {
    return ModManager.getSort(provider)
  })

  ipcMain.handle('modManager:getFilter', (_, provider: Provider, projectType: ProjectType) => {
    return ModManager.getFilter(provider, projectType)
  })

  ipcMain.handle('modManager:getProject', async (_, provider: Provider, projectId: string) => {
    return await ModManager.getProject(provider, projectId)
  })

  ipcMain.handle(
    'modManager:getVersions',
    async (
      _,
      provider: Provider,
      projectId: string,
      options: { version?: string; loader?: Loader; projectType: ProjectType; modUrl: string }
    ) => {
      return await ModManager.getVersions(provider, projectId, options)
    }
  )

  ipcMain.handle(
    'modManager:getDependencies',
    async (_, provider: Provider, projectId: string, deps: IVersionDependency[]) => {
      return await ModManager.getDependencies(provider, projectId, deps)
    }
  )

  ipcMain.handle('modManager:checkLocalMod', (_, modPath: string) => {
    return checkLocalMod(modPath)
  })

  ipcMain.handle(
    'modManager:checkModpack',
    (_, modpackPath: string, pack?: IProject, selectVersion?: IVersion) => {
      return checkModpack(modpackPath, pack, selectVersion)
    }
  )

  ipcMain.handle('modManager:ptToFolder', (_, pt: ProjectType) => {
    return projetTypeToFolder(pt)
  })
}
