import { ipcMain } from 'electron'
import { Backend } from '../services/Backend'
import { ICreateServer } from '@/types/Browser'
import { IUpdateUser } from '@/types/IUser'
import { IModpack, IModpackUpdate } from '@/types/Backend'
import { VersionsService } from '../services/Versions'

export function registerBackendIpc() {
  ipcMain.handle('backend:getModpack', async (_, at: string, code: string) => {
    const backend = new Backend(at)
    const response = await backend.getModpack(code)
    return response
  })

  ipcMain.handle(
    'backend:shareModpack',
    async (_, at: string, modpack: { conf: IModpack['conf'] }) => {
      const backend = new Backend(at)
      const response = await backend.shareModpack(modpack)
      return response
    }
  )

  ipcMain.handle(
    'backend:updateModpack',
    async (_, at: string, shareCode: string, update: IModpackUpdate) => {
      const backend = new Backend(at)
      const response = await backend.updateModpack(shareCode, update)
      return response
    }
  )

  ipcMain.handle('backend:deleteModpack', async (_, at: string, shareCode: string) => {
    const backend = new Backend(at)
    const response = await backend.deleteModpack(shareCode)
    return response
  })

  ipcMain.handle('backend:updateUser', async (_, at: string, id: string, user: IUpdateUser) => {
    const backend = new Backend(at)
    const response = await backend.updateUser(id, user)
    return response
  })

  ipcMain.handle('backend:getUser', async (_, at: string, id: string) => {
    const backend = new Backend(at)
    const response = await backend.getUser(id)
    return response
  })

  ipcMain.handle(
    'backend:uploadFileFromPath',
    async (_, at: string, filePath: string, fileName?: string, folder?: string) => {
      const backend = new Backend(at)
      const response = await backend.uploadFileFromPath(filePath, fileName, folder)
      return response
    }
  )

  ipcMain.handle('backend:deleteFile', async (_, at: string, key: string, isDirectory = false) => {
    const backend = new Backend(at)
    const response = await backend.deleteFile(key, isDirectory)
    return response
  })

  ipcMain.handle(
    'backend:modpackSearch',
    async (
      _,
      at: string,
      data: {
        offset: number
        limit: number
        search: string
        sort: string
        filter: string[]
      }
    ) => {
      const backend = new Backend(at)
      const response = await backend.modpackSearch(data)
      return response
    }
  )

  ipcMain.handle('backend:modpackDownloaded', async (_, at: string, shareCode: string) => {
    const backend = new Backend(at)
    const response = await backend.modpackDownloaded(shareCode)
    return response
  })

  ipcMain.handle('backend:allModpacksByUser', async (_, at: string, owner: string) => {
    const backend = new Backend(at)
    const response = await backend.allModpacksByUser(owner)
    return response
  })

  ipcMain.handle('backend:getNews', async () => {
    const backend = new Backend()
    const response = await backend.getNews()
    return response
  })

  ipcMain.handle(
    'backend:login',
    async (
      _,
      at: string,
      id: string,
      auth: {
        accessToken: string
        refreshToken: string
        expiresAt: number
      }
    ) => {
      const backend = new Backend(at)
      const response = await backend.login(id, auth)
      return response
    }
  )

  ipcMain.handle('backend:getServer', async (_, at: string, serverId: string) => {
    const backend = new Backend(at)
    const response = await backend.getServer(serverId)
    return response
  })

  ipcMain.handle(
    'backend:updateServer',
    async (_, at: string, serverId: string, server: ICreateServer) => {
      const backend = new Backend(at)
      const response = await backend.updateServer(serverId, server)
      return response
    }
  )

  ipcMain.handle('backend:createServer', async (_, at: string, server: ICreateServer) => {
    const backend = new Backend(at)
    const response = await backend.createServer(server)
    return response.id
  })

  ipcMain.handle('backend:deleteServer', async (_, at: string, serverId: string) => {
    const backend = new Backend(at)
    const response = await backend.deleteServer(serverId)
    return response
  })

  ipcMain.handle(
    'backend:searchServers',
    async (
      _,
      at: string,
      data: {
        offset: number
        limit: number
        search: string
        filter: string[]
      }
    ) => {
      const backend = new Backend(at)
      const response = await backend.searchServers(data)
      return response
    }
  )

  ipcMain.handle('backend:getStatus', async (_, at: string, address: string) => {
    const backend = new Backend(at)
    const response = await backend.getStatus(address)
    return response
  })

  ipcMain.handle('backend:ownerServers', async (_, at: string, owner: string) => {
    const backend = new Backend(at)
    const response = await backend.ownerServers(owner)
    return response
  })

  ipcMain.handle('backend:getSkin', async (_, at: string, uuid: string) => {
    const backend = new Backend(at)
    const response = await backend.getSkin(uuid)
    return response
  })

  ipcMain.handle('backend:discordAuthenticated', async (_, at: string, userId: string) => {
    const backend = new Backend(at)
    const response = await backend.discordAuthenticated(userId)
    return response
  })

  ipcMain.handle('backend:aiComplete', async (_, at: string, prompt: string) => {
    const backend = new Backend(at)
    const response = await backend.aiComplete(prompt)
    return response
  })

  ipcMain.handle(
    'versions:getList',
    async (
      _,
      loader: 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt',
      includeSnapshots: boolean = false
    ) => {
      return await VersionsService.getVersions(loader, includeSnapshots)
    }
  )

  ipcMain.handle(
    'versions:getLoaderVersions',
    async (_, loader: 'forge' | 'neoforge' | 'fabric' | 'quilt', mcVersion: string) => {
      return await VersionsService.getLoaderVersions(loader, mcVersion)
    }
  )

  ipcMain.handle('backend:getAuthlib', async () => {
    const backend = new Backend()
    return await backend.getAuthlib()
  })
}
