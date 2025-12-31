import { ipcMain } from 'electron'
import { getSkin } from '../utilities/skin'
import { SkinsManager } from '../game/SkinsManager'

const skinsManagers = new Map<string, SkinsManager>()
const getManagerKey = (platform: string, userId: string) => `${platform}_${userId}`

export function registerSkinsIpc() {
  ipcMain.handle(
    'skins:load',
    async (
      _,
      launcherPath: string,
      platform: 'microsoft' | 'discord',
      userId: string,
      nickname: string,
      accessToken: string
    ) => {
      const key = getManagerKey(platform, userId)
      let manager = skinsManagers.get(key)

      if (!manager) {
        manager = new SkinsManager(launcherPath, platform, userId, nickname, accessToken)
        await manager.load()
        skinsManagers.set(key, manager)
      }

      return manager.getData()
    }
  )

  ipcMain.handle(
    'skins:selectSkin',
    async (_, userId: string, platform: string, skinId: string | null) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        manager.selectedSkin = skinId
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:setCape',
    async (_, userId: string, platform: string, capeId: string | undefined) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.setCapeId(capeId)
        await manager.saveSkins()
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:changeModel',
    async (_, userId: string, platform: string, model: 'classic' | 'slim') => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.changeModel(model)
        await manager.saveSkins()
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle('skins:clearManager', async (_, userId: string, platform: string) => {
    const key = getManagerKey(platform, userId)
    const manager = skinsManagers.get(key)
    if (manager) {
      skinsManagers.delete(key)
      return true
    }
    return false
  })

  ipcMain.handle(
    'skins:uploadSkin',
    async (_, userId: string, platform: string, skinId: string) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.uploadSkin(skinId)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:deleteSkin',
    async (_, userId: string, platform: string, skinId: string, type: 'skin' | 'cape') => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.deleteSkin(skinId, type)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle('skins:resetSkin', async (_, userId: string, platform: string) => {
    const manager = skinsManagers.get(getManagerKey(platform, userId))
    if (manager) {
      await manager.resetSkin()
      return manager.getData()
    }
    return null
  })

  ipcMain.handle(
    'skins:importByUrl',
    async (_, userId: string, platform: string, url: string, type: 'skin' | 'cape') => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.importByUrl(url, type)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:importByFile',
    async (_, userId: string, platform: string, filePath: string, type: 'skin' | 'cape') => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.importByFile(filePath, type)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:importByNickname',
    async (_, userId: string, platform: string, nickname: string) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.importByNickname(nickname)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skins:renameSkin',
    async (_, userId: string, platform: string, skinId: string, newName: string) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (manager) {
        await manager.renameSkin(skinId, newName)
        return manager.getData()
      }
      return null
    }
  )

  ipcMain.handle(
    'skin:get',
    async (_, type: string, uuid: string, nickname: string, accessToken?: string) => {
      return await getSkin(type, uuid, nickname, accessToken)
    }
  )
}
