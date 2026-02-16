import { Backend } from '../services/Backend'
import { IUpdateUser } from '@/types/IUser'
import { IModpack, IModpackUpdate } from '@/types/Backend'
import { VersionsService } from '../services/Versions'
import { handleSafe } from '../utilities/ipc'

export function registerBackendIpc() {
  handleSafe(
    'backend:getModpack',
    { status: 'error', data: null as any },
    async (_, at: string, code: string) => {
      const backend = new Backend(at)
      return await backend.getModpack(code)
    }
  )

  handleSafe('backend:getOwnModpacks', [], async (_, at: string) => {
    const backend = new Backend(at)
    return await backend.getOwnModpacks()
  })

  handleSafe('backend:shareModpack', null, async (_, at: string, modpack: { conf: IModpack['conf'] }) => {
    const backend = new Backend(at)
    return await backend.shareModpack(modpack)
  })

  handleSafe('backend:updateModpack', false, async (_, at: string, shareCode: string, update: IModpackUpdate) => {
    const backend = new Backend(at)
    await backend.updateModpack(shareCode, update)
    return true
  })

  handleSafe('backend:deleteModpack', false, async (_, at: string, shareCode: string) => {
    const backend = new Backend(at)
    return await backend.deleteModpack(shareCode)
  })

  handleSafe('backend:updateUser', null, async (_, at: string, id: string, user: IUpdateUser) => {
    const backend = new Backend(at)
    return await backend.updateUser(id, user)
  })

  handleSafe('backend:getUser', null, async (_, at: string, id: string) => {
    const backend = new Backend(at)
    return await backend.getUser(id)
  })

  handleSafe(
    'backend:uploadFileFromPath',
    null,
    async (_, at: string, filePath: string, fileName?: string, folder?: string) => {
      const backend = new Backend(at)
      return await backend.uploadFileFromPath(filePath, fileName, folder)
    }
  )

  handleSafe('backend:deleteFile', false, async (_, at: string, key: string, isDirectory = false) => {
    const backend = new Backend(at)
    await backend.deleteFile(key, isDirectory)
    return true
  })

  handleSafe('backend:modpackDownloaded', false, async (_, at: string, shareCode: string) => {
    const backend = new Backend(at)
    await backend.modpackDownloaded(shareCode)
    return true
  })

  handleSafe('backend:getNews', [], async () => {
    const backend = new Backend()
    return await backend.getNews()
  })

  handleSafe(
    'backend:login',
    null,
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
      return await backend.login(id, auth)
    }
  )

  handleSafe('backend:getSkin', null, async (_, at: string, uuid: string) => {
    const backend = new Backend(at)
    return await backend.getSkin(uuid)
  })

  handleSafe('backend:discordAuthenticated', false, async (_, at: string, userId: string) => {
    const backend = new Backend(at)
    return await backend.discordAuthenticated(userId)
  })

  handleSafe('backend:aiComplete', null, async (_, at: string, prompt: string) => {
    const backend = new Backend(at)
    return await backend.aiComplete(prompt)
  })

  handleSafe('versions:getList', [], async (_, loader: 'vanilla' | 'forge' | 'neoforge' | 'fabric' | 'quilt', includeSnapshots = false) => {
    return await VersionsService.getVersions(loader, includeSnapshots)
  })

  handleSafe('versions:getLoaderVersions', [], async (_, loader: 'forge' | 'neoforge' | 'fabric' | 'quilt', mcVersion: string) => {
    return await VersionsService.getLoaderVersions(loader, mcVersion)
  })

  handleSafe('backend:getAuthlib', null, async () => {
    const backend = new Backend()
    return await backend.getAuthlib()
  })
}
