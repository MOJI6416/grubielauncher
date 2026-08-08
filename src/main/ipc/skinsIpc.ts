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
import { check, handleSafe } from '../utilities/ipc'
import { assertReadablePath, assertWritablePath } from '../utilities/safePath'

const SKIN_PLATFORMS = ['microsoft', 'discord', 'elyby'] as const
type SkinPlatform = (typeof SKIN_PLATFORMS)[number]

const SKINS_PROVIDER_TTL_MS = 5 * 60 * 1000

function toSkinPlatform(value: unknown): SkinPlatform | null {
  return SKIN_PLATFORMS.includes(value as SkinPlatform) ? (value as SkinPlatform) : null
}

const isPlatform = check.oneOf(...SKIN_PLATFORMS)
const isId = check.string(256)
const isAssetType = check.oneOf('skin', 'cape')
const isProfileId = check.pattern(/^[A-Za-z0-9_-]{0,64}$/, 64)
const isProfileNickname = check.pattern(/^[^\s/\\?#%&]{0,32}$/, 32)

const skinsManagers = new Map<string, SkinsManager>()
const getManagerKey = (platform: SkinPlatform, userId: string) => `${platform}_${userId}`

function getManager(platform: unknown, userId: string): SkinsManager | null {
  const validPlatform = toSkinPlatform(platform)
  if (!validPlatform) return null

  return skinsManagers.get(getManagerKey(validPlatform, userId)) ?? null
}

const backendApi = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000
})

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
  handleSafe<SkinsData, [string, SkinPlatform, string, string, string]>(
    'skins:load',
    emptySkinsData,
    [check.string(4096), isPlatform, isId, isId, check.string(32768)],
    async (_, launcherPath, platform, userId, nickname, accessToken) => {
      const validPlatform = toSkinPlatform(platform)
      if (!validPlatform) return emptySkinsData

      assertWritablePath(launcherPath, 'skins:load')
      const key = getManagerKey(validPlatform, userId)
      let manager = skinsManagers.get(key)

      if (!manager) {
        manager = new SkinsManager(
          launcherPath,
          validPlatform,
          userId,
          nickname,
          accessToken
        )
        await manager.load()
        skinsManagers.set(key, manager)
      } else {
        manager.refreshSession(nickname, accessToken)
        if (manager.isProviderSyncStale(SKINS_PROVIDER_TTL_MS)) {
          await manager.syncFromProvider()
        }
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
    [isId, isPlatform, check.optional(isId)],
    async (_, userId, platform, skinId) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, check.optional(isId)],
    async (_, userId, platform, capeId) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, check.oneOf('classic', 'slim')],
    async (_, userId, platform, model) => {
      const manager = getManager(platform, userId)
      if (!manager) return null

      await manager.changeModel(model)
      await manager.saveSkins()
      return manager.getData()
    }
  )

  handleSafe<boolean, [string, string]>(
    'skins:clearManager',
    false,
    [isId, isPlatform],
    async (_, userId, platform) => {
      const validPlatform = toSkinPlatform(platform)
      if (!validPlatform) return false

      const key = getManagerKey(validPlatform, userId)
      if (!skinsManagers.has(key)) return false

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
    [isId, isPlatform, isId],
    async (_, userId, platform, skinId) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, isId, isAssetType],
    async (_, userId, platform, skinId, type) => {
      const manager = getManager(platform, userId)
      if (!manager) return null

      await manager.deleteSkin(skinId, type)
      return manager.getData()
    }
  )

  handleSafe<SkinsData | null, [string, string]>(
    'skins:resetSkin',
    null,
    [isId, isPlatform],
    async (_, userId, platform) => {
      const manager = getManager(platform, userId)
      if (!manager) return null

      await manager.resetSkin()
      return manager.getData()
    }
  )

  handleSafe<SkinsData | null, [string, string]>(
    'skins:regenerateSkin',
    null,
    [isId, isPlatform],
    async (_, userId, platform) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, check.nonEmptyString(2048), isAssetType],
    async (_, userId, platform, url, type) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, check.nonEmptyString(4096), isAssetType],
    async (_, userId, platform, filePath, type) => {
      const manager = getManager(platform, userId)
      if (!manager) return null

      assertReadablePath(filePath, 'skins:importByFile')
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
    [isId, isPlatform, check.nonEmptyString(64)],
    async (_, userId, platform, nickname) => {
      const manager = getManager(platform, userId)
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
    [isId, isPlatform, isId, check.string(256)],
    async (_, userId, platform, skinId, newName) => {
      const manager = getManager(platform, userId)
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
    [isPlatform, isProfileId, isProfileNickname, check.optional(check.string(32768))],
    async (_, type, uuid, nickname, accessToken) => {
      return await getSkin(type, uuid, nickname, accessToken)
    }
  )

  handleSafe<CatalogListResult, [CatalogListParams?]>(
    'skins:catalogList',
    emptyCatalog,
    async (_, params) => {
      const response = await backendApi.get<CatalogListResult>(`/skins/catalog`, {
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
      const response = await backendApi.get<string[]>(`/skins/tags`, {
        params: { q: q || undefined, limit: limit || undefined }
      })
      return response.data
    }
  )

  handleSafe<{ downloads: number } | null, [string]>(
    'skins:catalogDownload',
    null,
    async (_, id) => {
      const response = await backendApi.post<{ downloads: number }>(`/skins/${id}/download`)
      return response.data
    }
  )

  handleSafe<ICatalogSkin | null, [string]>(
    'skins:catalogItem',
    null,
    async (_, id) => {
      try {
        const response = await backendApi.get<ICatalogSkin>(`/skins/catalog/${id}`)
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
    [
      isId,
      isPlatform,
      isId,
      check.nonEmptyString(32768),
      check.optional(check.string(256)),
      check.optional(check.oneOf('skin', 'cape', 'pack')),
      check.optional(check.string(512))
    ],
    async (_, userId, platform, skinId, backendToken, name, type, tags) => {
      const manager = getManager(platform, userId)
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

        const code = error instanceof Error ? error.message : ''
        if (
          code === 'community_publish_no_token' ||
          code === 'community_publish_unsupported_env'
        ) {
          return { ok: false, error: code }
        }

        return { ok: false, error: 'failed' }
      }
    }
  )

  handleSafe<MyCommunityResult, [string]>(
    'skins:communityMine',
    { items: [] },
    async (_, backendToken) => {
      const response = await backendApi.get<MyCommunityResult>(`/skins/community/mine`,
        { headers: { Authorization: `Bearer ${backendToken}` } }
      )
      return response.data
    }
  )

  handleSafe<{ ok: boolean }, [string, string]>(
    'skins:communityDelete',
    { ok: false },
    async (_, backendToken, id) => {
      await backendApi.delete(`/skins/community/${id}`, {
        headers: { Authorization: `Bearer ${backendToken}` }
      })
      return { ok: true }
    }
  )

  handleSafe<{ ok: boolean }, [string, string, string, string]>(
    'skins:importPack',
    { ok: false },
    [isId, isPlatform, check.nonEmptyString(2048), check.string(2048)],
    async (_, userId, platform, skinUrl, capeUrl) => {
      const manager = getManager(platform, userId)
      if (!manager) return { ok: false }

      await manager.importPack(skinUrl, capeUrl)
      return { ok: true }
    }
  )
}
