import axios from 'axios'
import { getSkin } from '../utilities/skin'
import { SkinsManager } from '../game/SkinsManager'
import { BACKEND_URL } from '@/shared/config'
import type {
  CatalogListParams,
  CatalogListResult,
  ICatalogSkin,
  MyCommunityResult,
  PublishCommunityResult,
  SkinsData
} from '@/types/SkinManager'
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

const emptyCatalog: CatalogListResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 0
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
      } else {
        manager.refreshSession(nickname, accessToken)
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

  handleSafe<SkinsData | null, [string, string]>(
    'skins:regenerateSkin',
    null,
    async (_, userId, platform) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return null

      await manager.regenerateSkin()
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

  handleSafe<CatalogListResult, [CatalogListParams?]>(
    'skins:catalogList',
    emptyCatalog,
    async (_, params) => {
      const response = await axios.get<CatalogListResult>(`${BACKEND_URL}/skins/catalog`, {
        params: {
          search: params?.search || undefined,
          tag: params?.tag || undefined,
          source: params?.source || undefined,
          type: params?.type || undefined,
          sort: params?.sort || undefined,
          page: params?.page || undefined,
          limit: params?.limit || undefined
        }
      })
      return response.data
    }
  )

  handleSafe<string[], [string?, number?]>(
    'skins:tagsSuggest',
    [],
    async (_, q, limit) => {
      const response = await axios.get<string[]>(`${BACKEND_URL}/skins/tags`, {
        params: { q: q || undefined, limit: limit || undefined }
      })
      return response.data
    }
  )

  handleSafe<{ downloads: number } | null, [string]>(
    'skins:catalogDownload',
    null,
    async (_, id) => {
      const response = await axios.post<{ downloads: number }>(
        `${BACKEND_URL}/skins/${id}/download`
      )
      return response.data
    }
  )

  handleSafe<ICatalogSkin | null, [string]>(
    'skins:catalogItem',
    null,
    async (_, id) => {
      try {
        const response = await axios.get<ICatalogSkin>(
          `${BACKEND_URL}/skins/catalog/${id}`
        )
        return response.data
      } catch {
        return null
      }
    }
  )

  handleSafe<
    PublishCommunityResult,
    [
      string,
      string,
      string,
      string,
      string?,
      ('skin' | 'cape' | 'pack')?,
      string?
    ]
  >(
    'skins:publishCommunity',
    { ok: false, error: 'failed' },
    async (_, userId, platform, skinId, backendToken, name, type, tags) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return { ok: false, error: 'no_manager' }

      try {
        const data = await manager.publishCommunitySkin(
          skinId,
          name,
          backendToken,
          type,
          tags
        )
        return {
          ok: true,
          status: data?.status === 'approved' ? 'approved' : 'pending'
        }
      } catch (error) {
        const err = error as {
          response?: {
            status?: number
            data?: { reason?: string | null; dupStatus?: string }
          }
        }
        const httpStatus = err?.response?.status
        if (httpStatus === 409) {
          return {
            ok: false,
            error: 'duplicate',
            reason: err.response?.data?.reason ?? null,
            dupStatus: err.response?.data
              ?.dupStatus as PublishCommunityResult['dupStatus']
          }
        }
        if (httpStatus === 400) return { ok: false, error: 'limit' }
        return { ok: false, error: 'failed' }
      }
    }
  )

  handleSafe<MyCommunityResult, [string]>(
    'skins:communityMine',
    { items: [] },
    async (_, backendToken) => {
      const response = await axios.get<MyCommunityResult>(
        `${BACKEND_URL}/skins/community/mine`,
        { headers: { Authorization: `Bearer ${backendToken}` } }
      )
      return response.data
    }
  )

  handleSafe<{ ok: boolean }, [string, string]>(
    'skins:communityDelete',
    { ok: false },
    async (_, backendToken, id) => {
      await axios.delete(`${BACKEND_URL}/skins/community/${id}`, {
        headers: { Authorization: `Bearer ${backendToken}` }
      })
      return { ok: true }
    }
  )

  handleSafe<{ ok: boolean }, [string, string, string, string]>(
    'skins:importPack',
    { ok: false },
    async (_, userId, platform, skinUrl, capeUrl) => {
      const manager = skinsManagers.get(getManagerKey(platform, userId))
      if (!manager) return { ok: false }

      await manager.importPack(skinUrl, capeUrl)
      return { ok: true }
    }
  )
}
