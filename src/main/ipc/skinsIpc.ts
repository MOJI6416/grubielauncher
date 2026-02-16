import { getSkin } from '../utilities/skin'
import { SkinsManager } from '../game/SkinsManager'
import type { SkinsData } from '@/types/SkinManager'
import type { ISkinData } from '@/types/Skin'
import { handleSafe } from '../utilities/ipc'

const skinsManagers = new Map<string, SkinsManager>()
const getManagerKey = (platform: string, userId: string) => `${platform}_${userId}`

const emptySkinsData: SkinsData = {
  skins: { skins: [] },
  capes: [],
  selectedSkin: null,
  activeSkin: undefined,
  activeCape: undefined,
  activeModel: undefined
}

export function registerSkinsIpc() {
  handleSafe<
    SkinsData,
    [string, 'microsoft' | 'discord', string, string, string]
  >(
    'skins:load',
    emptySkinsData,
    async (_, launcherPath, platform, userId, nickname, accessToken) => {
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

  handleSafe<
    SkinsData | null,
    [string, string, string | null]
  >(
    'skins:selectSkin',
    null,
    async (_, userId, platform, skinId) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      manager.selectedSkin = skinId
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string | undefined]
  >(
    'skins:setCape',
    null,
    async (_, userId, platform, capeId) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.setCapeId(capeId)
      await manager.saveSkins()
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, 'classic' | 'slim']
  >(
    'skins:changeModel',
    null,
    async (_, userId, platform, model) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.changeModel(model)
      await manager.saveSkins()
      return manager.getData()
    }
  )

  handleSafe<boolean, [string, string]>(
    'skins:clearManager',
    false,
    async (_, userId, platform) => {
      const key = getManagerKey(platform, userId)
      const manager = skinsManagers.get(key)
      if (!manager) return false

      skinsManagers.delete(key)
      return true
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string]
  >(
    'skins:uploadSkin',
    null,
    async (_, userId, platform, skinId) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.uploadSkin(skinId)
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string, 'skin' | 'cape']
  >(
    'skins:deleteSkin',
    null,
    async (_, userId, platform, skinId, type) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.deleteSkin(skinId, type)
      return manager.getData()
    }
  )

  handleSafe<SkinsData | null, [string, string]>(
    'skins:resetSkin',
    null,
    async (_, userId, platform) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.resetSkin()
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string, 'skin' | 'cape']
  >(
    'skins:importByUrl',
    null,
    async (_, userId, platform, url, type) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.importByUrl(url, type)
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string, 'skin' | 'cape']
  >(
    'skins:importByFile',
    null,
    async (_, userId, platform, filePath, type) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.importByFile(filePath, type)
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string]
  >(
    'skins:importByNickname',
    null,
    async (_, userId, platform, nickname) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.importByNickname(nickname)
      return manager.getData()
    }
  )

  handleSafe<
    SkinsData | null,
    [string, string, string, string]
  >(
    'skins:renameSkin',
    null,
    async (_, userId, platform, skinId, newName) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.renameSkin(skinId, newName)
      return manager.getData()
    }
  )

  handleSafe<
    ISkinData | null,
    [string, string, string, string?]
  >(
    'skin:get',
    null,
    async (_, type, uuid, nickname, accessToken) => {
      return await getSkin(type, uuid, nickname, accessToken)
    }
  )
}
