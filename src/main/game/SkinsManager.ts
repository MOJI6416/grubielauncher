import axios from 'axios'
import path from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import { fileURLToPath, pathToFileURL } from 'url'
import { BaseService } from '../services/Base'
import {
  assertSkinBuffer,
  detectSkinModel,
  getSkin,
  MAX_SKIN_FILE_BYTES,
  renderCape,
  renderCharacter
} from '../utilities/skin'
import { getSha1 } from '../utilities/files'
import { isSafeRemoteFetchUrl, isSafeRemoteImageUrl } from '../utilities/safeUrl'
import { logAxiosError } from '../utilities/axiosLog'
import { mutateJsonAtomic } from '../utilities/atomicJson'
import { Downloader } from '../utilities/downloader'
import { getApiBaseUrl } from '../utilities/apiHost'
import { ICape, IGrubieSkin, IMojangProfile, ISkinEntry, ISkinsConfig, SkinsData } from '@/types/SkinManager'

function toFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href
}

function extractIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const base = path.basename(u.pathname)
    const id = base.replace(/\.png$/i, '')
    return id || null
  } catch {
    const last = url.split('/').pop()
    if (!last) return null
    const base = last.split('?')[0]
    const id = base.replace(/\.png$/i, '')
    return id || null
  }
}

function tryGetFilePathFromUrl(url?: string): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return null
    return fileURLToPath(parsed)
  } catch {
    return null
  }
}

type SkinRegistrationOptions = {
  capeId?: string
  model?: 'slim' | 'classic'
  name?: string
  remoteId?: string
  syncCape?: boolean
}

type CapeRegistrationOptions = {
  alias?: string
  remoteId?: string
}

export type SkinsPlatform = 'microsoft' | 'discord' | 'elyby'

type StoredSkinEntry = Partial<ISkinEntry> & Pick<ISkinEntry, 'id' | 'model' | 'name' | 'url'>
type StoredCapeEntry = Partial<ICape> & Pick<ICape, 'id' | 'alias' | 'url'>

type StoredSkinsConfig = {
  skins: StoredSkinEntry[]
  capes?: StoredCapeEntry[]
}

export class SkinsManager extends BaseService {
  public skinsPath: string = ''
  public skins: ISkinsConfig = { skins: [] }
  public capes: ICape[] = []
  public selectedSkin: string | null = null
  public activeSkin: string | undefined = undefined
  public activeCape: string | undefined = undefined
  public activeModel: string | undefined = undefined
  private skinServiceUrl: string = 'https://api.minecraftservices.com'
  private platform: SkinsPlatform = 'microsoft'
  private userId: string = ''
  private nickname: string = ''
  private downloader: Downloader
  private legacyCapeIdMap = new Map<string, string>()
  private storedIndexSkins: StoredSkinEntry[] = []
  private storedIndexCapes: StoredCapeEntry[] = []
  private unloadableStoredSkins: StoredSkinEntry[] = []
  private unloadableStoredCapes: StoredCapeEntry[] = []
  private knownSkinKeys = new Set<string>()
  private knownCapeKeys = new Set<string>()
  private capeChoiceTouched = new Set<string>()
  private providerSyncedAt = 0

  constructor(
    laucnherPath: string,
    platform: SkinsPlatform,
    userId: string,
    nickname: string,
    accessToken: string,
    selectedSkin?: string,
    capes?: ICape[],
    skins?: ISkinsConfig,
    activeSkin?: string,
    activeCape?: string,
    activeModel?: string
  ) {
    super(accessToken)

    this.skinsPath = path.join(laucnherPath, 'skins')
    this.userId = userId
    this.nickname = nickname

    this.selectedSkin = selectedSkin || null
    this.capes = capes || []
    this.skins = skins || { skins: [] }
    this.activeSkin = activeSkin
    this.activeCape = activeCape
    this.activeModel = activeModel
    this.downloader = new Downloader(6)

    this.platform = platform

    if (platform === 'discord') {
      this.skinServiceUrl = getApiBaseUrl()
    } else if (platform === 'elyby') {
      this.skinServiceUrl = ''
    }

    if (this.skinServiceUrl) {
      this.allowAuthorizedOrigin(this.skinServiceUrl)
    }
  }

  private hasRemoteSkinService(): boolean {
    return this.platform !== 'elyby'
  }

  private assertRemoteSkinService() {
    if (!this.hasRemoteSkinService()) {
      throw new Error('skin_service_not_available_for_account')
    }
  }

  private getSkinFilePath(hash: string): string {
    return path.join(this.skinsPath, `${hash}.png`)
  }

  private getCapeFilePath(hash: string): string {
    return path.join(this.skinsPath, 'capes', `${hash}.png`)
  }

  private createTempFilePath(type: 'skin' | 'cape'): string {
    const directory = type === 'skin' ? this.skinsPath : path.join(this.skinsPath, 'capes')
    return path.join(directory, `.tmp-${randomUUID()}.png`)
  }

  private findSkinById(skinId: string | null | undefined): ISkinEntry | undefined {
    if (!skinId) return undefined
    return this.skins.skins.find((skin) => skin.id === skinId)
  }

  private findSkinByHash(hash: string): ISkinEntry | undefined {
    return this.skins.skins.find((skin) => skin.hash === hash)
  }

  private findCapeById(capeId: string | undefined): ICape | undefined {
    if (!capeId) return undefined
    return this.capes.find((cape) => cape.id === capeId)
  }

  private getSkinName(name: string | undefined, hash: string, currentId?: string): string {
    const baseName = name?.trim() || hash.slice(0, 12)
    const hasConflict = this.skins.skins.some((skin) => skin.name === baseName && skin.id !== currentId)

    if (!hasConflict) return baseName
    return `${baseName}-${hash.slice(0, 6)}`
  }

  private shouldUpdateSkinName(currentName: string, hash: string, remoteId?: string): boolean {
    const normalizedName = currentName.trim().toLowerCase()
    if (!normalizedName) return true
    if (normalizedName === hash.toLowerCase()) return true
    if (normalizedName === hash.slice(0, 12).toLowerCase()) return true
    if (remoteId && normalizedName === remoteId.toLowerCase()) return true
    return false
  }

  private async normalizeAssetFile(
    filePath: string,
    type: 'skin' | 'cape'
  ): Promise<{ hash: string; filePath: string }> {
    const hash = await getSha1(filePath)
    const finalPath = type === 'skin' ? this.getSkinFilePath(hash) : this.getCapeFilePath(hash)

    if (path.resolve(filePath) !== path.resolve(finalPath)) {
      if (await fs.pathExists(finalPath)) {
        await fs.remove(filePath)
      } else {
        await fs.move(filePath, finalPath, { overwrite: true })
      }
    }

    return { hash, filePath: finalPath }
  }

  private async downloadToTemp(url: string, type: 'skin' | 'cape'): Promise<string> {
    const tempPath = this.createTempFilePath(type)

    try {
      await this.downloader.downloadFiles([
        {
          destination: tempPath,
          group: type === 'skin' ? 'skins' : 'capes',
          url,
          options: {
            silent: true,
            maxBytes: MAX_SKIN_FILE_BYTES
          }
        }
      ])
    } catch (error) {
      await fs.remove(tempPath).catch(() => {})
      throw error
    }

    return tempPath
  }

  private async assertAssetFile(filePath: string, label: 'skin' | 'cape') {
    const stats = await fs.stat(filePath)
    if (stats.size > MAX_SKIN_FILE_BYTES) {
      throw new Error(label === 'skin' ? 'skin_file_too_large' : 'cape_file_too_large')
    }

    assertSkinBuffer(await fs.readFile(filePath), label)
  }

  private async registerSkinFromFile(
    filePath: string,
    options: SkinRegistrationOptions = {}
  ): Promise<ISkinEntry | null> {
    if (!(await fs.pathExists(filePath))) return null

    await this.assertAssetFile(filePath, 'skin')

    const { hash, filePath: normalizedPath } = await this.normalizeAssetFile(filePath, 'skin')
    const character = await renderCharacter(normalizedPath)
    const model = options.model || (await detectSkinModel(normalizedPath))
    const existingSkin = this.findSkinByHash(hash)

    if (existingSkin) {
      existingSkin.hash = hash
      existingSkin.url = toFileUrl(normalizedPath)
      existingSkin.character = character || existingSkin.character
      existingSkin.model = model

      if (options.remoteId) {
        existingSkin.remoteId = options.remoteId
      }

      if (options.syncCape) {
        existingSkin.capeId = options.capeId
      }

      if (
        options.name &&
        this.shouldUpdateSkinName(existingSkin.name, hash, options.remoteId || existingSkin.remoteId)
      ) {
        existingSkin.name = this.getSkinName(options.name, hash, existingSkin.id)
      }

      return existingSkin
    }

    const skin: ISkinEntry = {
      id: hash,
      hash,
      remoteId: options.remoteId,
      model,
      name: this.getSkinName(options.name, hash, hash),
      url: toFileUrl(normalizedPath),
      character,
      capeId: options.syncCape ? options.capeId : undefined
    }

    this.skins.skins.push(skin)
    return skin
  }

  private async registerCapeFromFile(filePath: string, options: CapeRegistrationOptions = {}): Promise<ICape | null> {
    if (!(await fs.pathExists(filePath))) return null

    await this.assertAssetFile(filePath, 'cape')

    const { hash, filePath: normalizedPath } = await this.normalizeAssetFile(filePath, 'cape')
    const capePreview = await renderCape(normalizedPath)
    const existingCape = this.findCapeById(hash)
    const alias = options.alias?.trim() || hash.slice(0, 12)

    if (existingCape) {
      existingCape.hash = hash
      existingCape.url = toFileUrl(normalizedPath)
      existingCape.cape = capePreview || existingCape.cape

      if (options.remoteId) {
        existingCape.remoteId = options.remoteId
      }

      if (options.alias?.trim()) {
        existingCape.alias = options.alias.trim()
      }

      return existingCape
    }

    const cape: ICape = {
      id: hash,
      hash,
      remoteId: options.remoteId,
      alias,
      url: toFileUrl(normalizedPath),
      cape: capePreview
    }

    this.capes.push(cape)
    return cape
  }

  private async syncSkinFromUrl(url: string, options: SkinRegistrationOptions = {}): Promise<ISkinEntry | null> {
    const tempPath = await this.downloadToTemp(url, 'skin')

    try {
      return await this.registerSkinFromFile(tempPath, options)
    } finally {
      await fs.remove(tempPath).catch(() => {})
    }
  }

  private async syncCapeFromUrl(url: string, options: CapeRegistrationOptions = {}): Promise<ICape | null> {
    const tempPath = await this.downloadToTemp(url, 'cape')

    try {
      return await this.registerCapeFromFile(tempPath, options)
    } finally {
      await fs.remove(tempPath).catch(() => {})
    }
  }

  private async importSkinFromExternalFile(
    sourceFilePath: string,
    options: SkinRegistrationOptions = {}
  ): Promise<ISkinEntry | null> {
    const tempPath = this.createTempFilePath('skin')
    await fs.copyFile(sourceFilePath, tempPath)

    try {
      return await this.registerSkinFromFile(tempPath, options)
    } finally {
      await fs.remove(tempPath).catch(() => {})
    }
  }

  private async importCapeFromExternalFile(
    sourceFilePath: string,
    options: CapeRegistrationOptions = {}
  ): Promise<ICape | null> {
    const tempPath = this.createTempFilePath('cape')
    await fs.copyFile(sourceFilePath, tempPath)

    try {
      return await this.registerCapeFromFile(tempPath, options)
    } finally {
      await fs.remove(tempPath).catch(() => {})
    }
  }

  private async resolveStoredSkinPath(storedSkin: StoredSkinEntry): Promise<string | null> {
    const candidates = [
      storedSkin.hash ? this.getSkinFilePath(storedSkin.hash) : null,
      storedSkin.id ? path.join(this.skinsPath, `${storedSkin.id}.png`) : null,
      tryGetFilePathFromUrl(storedSkin.url)
    ].filter((candidate): candidate is string => !!candidate)

    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) {
        return candidate
      }
    }

    return null
  }

  private async resolveStoredCapePath(storedCape: StoredCapeEntry): Promise<string | null> {
    const candidates = [
      storedCape.hash ? this.getCapeFilePath(storedCape.hash) : null,
      storedCape.id ? this.getCapeFilePath(storedCape.id) : null,
      tryGetFilePathFromUrl(storedCape.url)
    ].filter((candidate): candidate is string => !!candidate)

    for (const candidate of candidates) {
      if (await fs.pathExists(candidate)) {
        return candidate
      }
    }

    return null
  }

  private async loadCapesFromIndex(storedCapes: StoredCapeEntry[] = []) {
    this.unloadableStoredCapes = []

    for (const storedCape of storedCapes) {
      const capePath = await this.resolveStoredCapePath(storedCape)
      if (!capePath) continue

      const cape = await this.registerCapeFromFile(capePath, {
        alias: storedCape.alias,
        remoteId: storedCape.remoteId
      }).catch((error) => {
        console.error(`Failed to load the stored cape ${capePath}:`, error)
        this.unloadableStoredCapes.push(storedCape)
        return null
      })

      if (cape && storedCape.id && storedCape.id !== cape.id) {
        this.legacyCapeIdMap.set(storedCape.id, cape.id)
      }
    }
  }

  private async loadSkinsFromIndex(options: { loadCapes?: boolean } = {}) {
    const indexPath = path.join(this.skinsPath, 'index.json')
    const loadCapes = options.loadCapes ?? true

    let data: StoredSkinsConfig | null = null

    try {
      data = await fs.readJSON(indexPath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.error(`Failed to read the skins index ${indexPath}:`, error)
        throw error
      }
    }

    this.storedIndexSkins = data?.skins || []
    this.storedIndexCapes = data?.capes || []

    this.knownSkinKeys = new Set(
      this.storedIndexSkins.flatMap((skin) =>
        [skin.id, skin.hash, skin.remoteId].filter((key): key is string => !!key)
      )
    )
    this.knownCapeKeys = new Set(
      this.storedIndexCapes.flatMap((cape) =>
        [cape.id, cape.hash, cape.remoteId].filter((key): key is string => !!key)
      )
    )
    this.skins.skins = []
    this.unloadableStoredSkins = []

    if (loadCapes) {
      await this.loadCapesFromIndex(this.storedIndexCapes)
    }

    for (const storedSkin of this.storedIndexSkins) {
      const skinPath = await this.resolveStoredSkinPath(storedSkin)
      if (!skinPath) {
        this.unloadableStoredSkins.push(storedSkin)
        continue
      }

      const skin = await this.registerSkinFromFile(skinPath, {
        capeId: storedSkin.capeId,
        model: storedSkin.model,
        name: storedSkin.name,
        remoteId: storedSkin.remoteId,
        syncCape: Object.prototype.hasOwnProperty.call(storedSkin, 'capeId')
      }).catch((error) => {
        console.error(`Failed to load the stored skin ${skinPath}:`, error)
        this.unloadableStoredSkins.push(storedSkin)
        return null
      })

      if (skin && storedSkin.capeId && storedSkin.capeId !== skin.capeId) {
        this.legacyCapeIdMap.set(storedSkin.capeId, skin.capeId || storedSkin.capeId)
      }
    }
  }

  public async load() {
    await fs.mkdir(this.skinsPath, { recursive: true })
    await fs.mkdir(path.join(this.skinsPath, 'capes'), { recursive: true })

    let providerAnswered = true

    if (this.platform === 'microsoft') {
      this.capes = []
      this.legacyCapeIdMap.clear()
      await this.loadSkinsFromIndex({ loadCapes: false })
      await this.saveSkins()
      providerAnswered = await this.getMojangSkins()

      if (providerAnswered) await this.pruneMigratedCapeEntries()
      else await this.loadCapesFromIndex(this.storedIndexCapes)
    } else {
      await this.getLocalCapes()
      await this.loadSkinsFromIndex()
      await this.saveSkins()
      if (this.hasRemoteSkinService()) await this.getGrubieSkin()
    }

    await this.checkSkins(providerAnswered)
    if (!this.findSkinById(this.selectedSkin)) {
      this.selectedSkin = this.skins.skins[0]?.id ?? null
    }
    await this.saveSkins()
    this.providerSyncedAt = Date.now()
  }

  public isProviderSyncStale(ttlMs: number): boolean {
    return Date.now() - this.providerSyncedAt >= ttlMs
  }

  public async syncFromProvider() {
    let providerAnswered = true

    if (this.platform === 'microsoft') {
      providerAnswered = await this.getMojangSkins()
      if (providerAnswered) await this.pruneMigratedCapeEntries()
    } else if (this.hasRemoteSkinService()) {
      await this.getGrubieSkin()
    }

    await this.checkSkins(providerAnswered)
    await this.saveSkins()
    if (providerAnswered) this.providerSyncedAt = Date.now()
  }

  private async checkSkins(providerAnswered: boolean = true) {
    const capeMap = new Map<string, string>()

    for (const cape of this.capes) {
      capeMap.set(cape.id, cape.id)
      capeMap.set(cape.hash, cape.id)

      if (cape.remoteId) {
        capeMap.set(cape.remoteId, cape.id)
      }
    }

    for (const [legacyCapeId, hash] of this.legacyCapeIdMap.entries()) {
      capeMap.set(legacyCapeId, hash)
    }

    for (const skin of this.skins.skins) {
      if (skin.capeId) {
        const mappedCapeId = capeMap.get(skin.capeId)
        if (mappedCapeId) {
          skin.capeId = mappedCapeId
        } else if (this.platform === 'microsoft' && providerAnswered) {
          skin.capeId = undefined
        }
      }
    }

    if (this.activeCape) {
      const mappedActiveCapeId = capeMap.get(this.activeCape)
      if (mappedActiveCapeId) {
        this.activeCape = mappedActiveCapeId
      } else if (this.platform === 'microsoft' && providerAnswered) {
        this.activeCape = undefined
      }
    }
  }

  private async getGrubieSkin() {
    try {
      const response = await this.api.get<IGrubieSkin>(`${this.skinServiceUrl}/skins/${this.userId}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })

      const grubieSkin = response.data
      const capeAlias = grubieSkin.capeUrl ? extractIdFromUrl(grubieSkin.capeUrl) || undefined : undefined
      const cape = grubieSkin.capeUrl
        ? await this.syncCapeFromUrl(grubieSkin.capeUrl, {
            alias: capeAlias,
            remoteId: capeAlias
          })
        : null

      const skin = await this.syncSkinFromUrl(grubieSkin.skinUrl, {
        capeId: cape?.id,
        model: grubieSkin.model,
        name: this.nickname,
        remoteId: grubieSkin._id,
        syncCape: true
      })

      if (!skin) return

      skin.model = grubieSkin.model
      skin.remoteId = grubieSkin._id
      skin.capeId = cape?.id

      this.activeSkin = skin.id
      this.selectedSkin = skin.id
      this.activeCape = cape?.id
      this.activeModel = grubieSkin.model

      await this.saveSkins()
    } catch (error) {
      logAxiosError('Error fetching Grubie skins', error, 'skins:load')
    }
  }

  private async getLocalCapes() {
    try {
      const capesDir = path.join(this.skinsPath, 'capes')
      const capeFiles = await fs.readdir(capesDir)

      for (const file of capeFiles) {
        if (!file.endsWith('.png')) continue

        if (file.startsWith('.')) {
          await fs.remove(path.join(capesDir, file)).catch(() => {})
          continue
        }

        const legacyId = file.replace(/\.png$/i, '')
        const capePath = path.join(capesDir, file)
        const cape = await this.registerCapeFromFile(capePath, {
          alias: legacyId
        }).catch(() => null)

        if (cape && legacyId !== cape.id) {
          this.legacyCapeIdMap.set(legacyId, cape.id)
        }
      }
    } catch (error) {
      logAxiosError('Error loading local capes', error, 'skins:load')
    }
  }

  private async getMojangSkins(options: { throwOnError?: boolean } = {}): Promise<boolean> {
    try {
      const response = await this.api.get<IMojangProfile>(`${this.skinServiceUrl}/minecraft/profile`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })

      const { skins, capes, name } = response.data

      let activeCapeId: string | undefined = undefined

      for (const cape of capes) {
        const localCape = await this.syncCapeFromUrl(cape.url, {
          alias: cape.alias || cape.id,
          remoteId: cape.id
        })

        if (!localCape) continue

        if (cape.state === 'ACTIVE') {
          activeCapeId = localCape.id
        }
      }

      for (const mojangSkin of skins) {
        const localSkin = await this.syncSkinFromUrl(mojangSkin.url, {
          model: mojangSkin.variant == 'SLIM' ? 'slim' : 'classic',
          name,
          remoteId: mojangSkin.id
        })

        if (!localSkin) continue

        localSkin.remoteId = mojangSkin.id
        localSkin.model = mojangSkin.variant == 'SLIM' ? 'slim' : 'classic'

        if (mojangSkin.state == 'ACTIVE') {
          this.activeSkin = localSkin.id
          this.selectedSkin = localSkin.id
          this.activeModel = localSkin.model
          this.activeCape = activeCapeId
          localSkin.capeId = activeCapeId
        } else if (!localSkin.capeId && activeCapeId) {
          localSkin.capeId = activeCapeId
        }
      }

      if (!activeCapeId) {
        this.activeCape = undefined

        if (this.activeSkin) {
          const activeSkin = this.findSkinById(this.activeSkin)
          if (activeSkin) {
            activeSkin.capeId = undefined
          }
        }
      }

      await this.saveSkins()
      return true
    } catch (error) {
      logAxiosError('Error fetching Mojang skins', error, options.throwOnError ? undefined : 'skins:load')
      if (options.throwOnError) throw error
      return false
    }
  }

  public async setCapeId(capeId: string | undefined) {
    if (capeId) {
      const cape = this.findCapeById(capeId)
      if (!cape) throw new Error('skin_cape_unavailable')

      if (this.platform === 'microsoft' && !cape.remoteId) {
        throw new Error('skin_cape_not_available_for_microsoft')
      }

      if (!(await fs.pathExists(this.getCapeFilePath(cape.hash)))) {
        throw new Error('skin_cape_file_missing')
      }
    }

    const skin = this.findSkinById(this.selectedSkin)
    if (!skin) throw new Error('skin_not_selected')
    skin.capeId = capeId
    this.capeChoiceTouched.add(skin.id)
  }

  public async changeModel(model: 'classic' | 'slim') {
    const skin = this.findSkinById(this.selectedSkin)
    if (!skin) throw new Error('skin_not_selected')
    skin.model = model
  }

  public async deleteSkin(skinId: string, type: 'skin' | 'cape' = 'skin') {
    if (type === 'skin') {
      const index = this.skins.skins.findIndex((skin) => skin.id === skinId)

      if (index !== -1) {
        const [removed] = this.skins.skins.splice(index, 1)
        for (const key of [removed?.id, removed?.hash, removed?.remoteId]) {
          if (key) this.knownSkinKeys.add(key)
        }
        await fs.unlink(this.getSkinFilePath(skinId)).catch(() => {})
      }
      this.knownSkinKeys.add(skinId)

      if (this.selectedSkin === skinId) {
        this.selectedSkin = this.activeSkin && this.activeSkin !== skinId ? this.activeSkin : null
      }

      if (this.activeSkin === skinId) {
        this.activeSkin = undefined
        this.activeCape = undefined
        this.activeModel = undefined
      }
    } else {
      const index = this.capes.findIndex((cape) => cape.id === skinId)

      if (index !== -1) {
        const [removed] = this.capes.splice(index, 1)
        for (const key of [removed?.id, removed?.hash, removed?.remoteId]) {
          if (key) this.knownCapeKeys.add(key)
        }
        await fs.unlink(this.getCapeFilePath(skinId)).catch(() => {})
      }
      this.knownCapeKeys.add(skinId)

      for (const skin of this.skins.skins) {
        if (skin.capeId === skinId) {
          skin.capeId = undefined
        }
      }

      if (this.activeCape === skinId) {
        this.activeCape = undefined
      }
    }

    await this.saveSkins()
  }

  public async resetSkin() {
    this.assertRemoteSkinService()

    try {
      await this.api.delete(`${this.skinServiceUrl}/minecraft/profile/skins/active`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })
      await this.hideCape()
      await this.getMojangSkins()
    } catch (error) {
      logAxiosError('Error resetting skin', error)
      throw error
    }
  }

  public async regenerateSkin() {
    this.assertRemoteSkinService()

    try {
      await this.api.post(
        `${this.skinServiceUrl}/skins/generate`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        }
      )
      await this.getGrubieSkin()
    } catch (error) {
      logAxiosError('Error regenerating skin', error)
      throw error
    }
  }

  public async importByUrl(url: string, type: 'skin' | 'cape' = 'skin') {
    try {
      if (!isSafeRemoteImageUrl(url)) {
        throw new Error(type === 'skin' ? 'skin_url_rejected' : 'cape_url_rejected')
      }

      const extractedId = extractIdFromUrl(url) || undefined

      if (type == 'skin') {
        await this.syncSkinFromUrl(url, { name: extractedId })
      } else {
        const cape = await this.syncCapeFromUrl(url, { alias: extractedId })
        const skin = this.findSkinById(this.selectedSkin)

        if (skin) {
          skin.capeId = cape?.id
        }
      }

      await this.saveSkins()
    } catch (error) {
      logAxiosError('Error importing skin by URL', error)
      throw error
    }
  }

  public async importByFile(filePath: string, type: 'skin' | 'cape' = 'skin') {
    try {
      const fileName = path.basename(filePath, '.png')

      if (type == 'skin') {
        await this.importSkinFromExternalFile(filePath, { name: fileName })
      } else {
        const cape = await this.importCapeFromExternalFile(filePath, {
          alias: fileName
        })
        const skin = this.findSkinById(this.selectedSkin)

        if (skin) {
          skin.capeId = cape?.id
        }
      }

      await this.saveSkins()
    } catch (error) {
      logAxiosError('Error importing skin by file', error)
      throw error
    }
  }

  public async importByNickname(nickname: string) {
    try {
      const player = await axios.get<{ id: string }>(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nickname)}`,
        { timeout: 30000 }
      )

      const playerId = player.data.id
      const skins = await getSkin('microsoft', playerId, nickname)
      if (!skins) throw new Error('skin_not_found')

      const imported = await this.syncSkinFromUrl(skins.skin, { name: nickname })
      if (!imported) throw new Error('skin_not_found')

      await this.saveSkins()
    } catch (error) {
      logAxiosError('Error importing skin by nickname', error)
      throw error
    }
  }

  public async uploadSkin(skinId: string) {
    this.assertRemoteSkinService()

    try {
      if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
        console.error('FormData/Blob is not available in this environment')
        return
      }

      const skin = this.findSkinById(skinId)
      if (!skin) return

      const skinPath = this.getSkinFilePath(skin.hash)
      const selectedCape = skin.capeId ? this.findCapeById(skin.capeId) : undefined
      const appliedCapeId =
        this.platform === 'microsoft' ? (selectedCape?.remoteId ? selectedCape.id : undefined) : selectedCape?.id

      if (skin.capeId && !selectedCape) {
        throw new Error('skin_cape_unavailable')
      }

      if (this.platform === 'microsoft' && selectedCape && !selectedCape.remoteId) {
        throw new Error('skin_cape_not_available_for_microsoft')
      }

      if (!(await fs.pathExists(skinPath))) {
        throw new Error('skin_file_missing')
      }

      const formData = new FormData()
      formData.append('variant', skin.model)

      const skinBuffer = await fs.readFile(skinPath)
      const skinBlob = new Blob([skinBuffer], { type: 'image/png' })
      formData.append('file', skinBlob, `${skin.hash}.png`)

      if (this.platform == 'microsoft') {
        const profile = await this.api.post<IMojangProfile>(
          `${this.skinServiceUrl}/minecraft/profile/skins`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`
            }
          }
        )

        skin.remoteId = profile.data.skins[0]?.id || skin.remoteId
      } else {
        if (selectedCape) {
          const capePath = this.getCapeFilePath(selectedCape.hash)
          if (!(await fs.pathExists(capePath))) {
            throw new Error('skin_cape_file_missing')
          }

          const capeBuffer = await fs.readFile(capePath)
          const capeBlob = new Blob([capeBuffer], { type: 'image/png' })
          formData.append('cape', capeBlob, `${selectedCape.hash}.png`)
        }

        const response = await this.api.post<IGrubieSkin>(`${this.skinServiceUrl}/skins/upload`, formData, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        })

        skin.remoteId = response.data._id
        if (selectedCape && !response.data.capeUrl) {
          throw new Error('skin_cape_apply_failed')
        }
      }

      this.selectedSkin = skin.id
      this.activeSkin = skin.id
      this.activeCape = appliedCapeId
      this.activeModel = skin.model

      await this.saveSkins()

      if (this.platform == 'microsoft') {
        if (appliedCapeId) {
          await this.showCape(appliedCapeId)
        } else {
          await this.hideCape()
        }

        await this.getMojangSkins({ throwOnError: true })
        if (this.activeSkin !== skin.id) {
          throw new Error('skin_apply_not_confirmed')
        }

        if ((appliedCapeId || undefined) !== (this.activeCape || undefined)) {
          throw new Error('skin_cape_apply_not_confirmed')
        }
      }
    } catch (error) {
      logAxiosError('Error uploading skin', error)
      throw error
    }
  }

  public async publishCommunitySkin(
    skinId: string,
    name: string | undefined,
    backendToken: string,
    type: 'skin' | 'cape' | 'pack' = 'skin',
    tags?: string
  ) {
    if (typeof FormData === 'undefined' || typeof Blob === 'undefined') {
      throw new Error('community_publish_unsupported_env')
    }
    if (!backendToken) throw new Error('community_publish_no_token')

    const skin = this.findSkinById(skinId)
    if (!skin) throw new Error('skin_not_found')

    const formData = new FormData()
    formData.append('type', type)
    formData.append('variant', skin.model)
    formData.append('name', (name || skin.name || '').slice(0, 40))
    if (tags) formData.append('tags', tags)

    if (type === 'skin' || type === 'pack') {
      const skinPath = this.getSkinFilePath(skin.hash)
      if (!(await fs.pathExists(skinPath))) {
        throw new Error('skin_file_missing')
      }
      const skinBuffer = await fs.readFile(skinPath)
      formData.append('file', new Blob([skinBuffer], { type: 'image/png' }), `${skin.hash}.png`)
    }

    if (type === 'cape' || type === 'pack') {
      const cape = skin.capeId ? this.findCapeById(skin.capeId) : undefined
      if (!cape) throw new Error('cape_missing')
      const capePath = this.getCapeFilePath(cape.hash)
      if (!(await fs.pathExists(capePath))) {
        throw new Error('cape_file_missing')
      }
      const capeBuffer = await fs.readFile(capePath)
      formData.append('cape', new Blob([capeBuffer], { type: 'image/png' }), `${cape.hash}.png`)
    }

    const response = await axios.post<{ status?: string }>(
      `${getApiBaseUrl()}/skins/community`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${backendToken}`
        }
      }
    )

    return response.data
  }

  public async importPack(skinUrl: string, capeUrl: string) {
    if (!(await isSafeRemoteFetchUrl(skinUrl))) {
      throw new Error('pack_skin_url_rejected')
    }

    const skin = await this.syncSkinFromUrl(skinUrl, {})
    if (!skin) throw new Error('pack_skin_failed')

    this.selectedSkin = skin.id

    if (capeUrl) {
      if (!(await isSafeRemoteFetchUrl(capeUrl))) {
        throw new Error('pack_cape_url_rejected')
      }

      const cape = await this.syncCapeFromUrl(capeUrl, {})
      if (!cape) throw new Error('pack_cape_failed')

      skin.capeId = cape.id
    }

    await this.saveSkins()
  }

  private async showCape(capeId: string) {
    const cape = this.findCapeById(capeId)
    if (!cape?.remoteId) {
      throw new Error('skin_cape_remote_id_missing')
    }

    await this.api.put(
      `${this.skinServiceUrl}/minecraft/profile/capes/active`,
      { capeId: cape.remoteId },
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      }
    )
  }

  private async hideCape() {
    try {
      await this.api.delete(`${this.skinServiceUrl}/minecraft/profile/capes/active`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return
      }

      throw error
    }
  }

  private async pruneMigratedCapeEntries() {
    if (this.platform !== 'microsoft' || !this.capes.length) return

    const liveHashes = new Set(this.capes.map((cape) => cape.hash))
    const liveKeys = new Set(
      this.capes.flatMap((cape) =>
        [cape.id, cape.hash, cape.remoteId].filter((key): key is string => !!key)
      )
    )
    const kept: StoredCapeEntry[] = []

    for (const storedCape of this.storedIndexCapes) {
      const identity = [storedCape.id, storedCape.hash, storedCape.remoteId].filter(
        (key): key is string => !!key
      )
      if (identity.some((key) => liveKeys.has(key))) {
        kept.push(storedCape)
        continue
      }

      const capePath = await this.resolveStoredCapePath(storedCape)
      if (!capePath) {
        kept.push(storedCape)
        continue
      }

      const hash = await getSha1(capePath).catch(() => null)
      if (!hash || !liveHashes.has(hash)) {
        kept.push(storedCape)
        continue
      }

      if (path.resolve(capePath) !== path.resolve(this.getCapeFilePath(hash))) {
        await fs.remove(capePath).catch(() => {})
      }
    }

    this.storedIndexCapes = kept
  }

  private getCapesForSave() {
    const capesToSave = this.capes.map(({ cape, ...rest }) => ({
      ...rest,
      url: toFileUrl(this.getCapeFilePath(rest.hash))
    }))

    const keyForCape = (cape: Partial<ICape> | StoredCapeEntry) => cape.remoteId || cape.id || cape.hash
    const existingKeys = new Set(capesToSave.map(keyForCape).filter(Boolean))
    const source =
      this.platform === 'microsoft' ? this.storedIndexCapes : this.unloadableStoredCapes
    const preservedCapes = source.filter((cape) => {
      const key = keyForCape(cape)
      if (!key || existingKeys.has(key)) return false
      existingKeys.add(key)
      return true
    })

    return [...capesToSave, ...preservedCapes]
  }

  private getSkinsForSave() {
    const storedSkinByIdentity = new Map<string, StoredSkinEntry>()

    for (const storedSkin of this.storedIndexSkins) {
      for (const key of [storedSkin.id, storedSkin.hash, storedSkin.remoteId].filter(Boolean)) {
        storedSkinByIdentity.set(key as string, storedSkin)
      }
    }

    const skinsToSave = this.skins.skins.map(({ character, ...rest }) => {
      const storedSkin =
        storedSkinByIdentity.get(rest.id) ||
        storedSkinByIdentity.get(rest.hash) ||
        (rest.remoteId ? storedSkinByIdentity.get(rest.remoteId) : undefined)
      const preserveStoredCape =
        this.platform === 'microsoft' &&
        !rest.capeId &&
        storedSkin?.capeId &&
        !this.capeChoiceTouched.has(rest.id)
          ? { capeId: storedSkin.capeId }
          : {}

      return {
        ...rest,
        ...preserveStoredCape,
        url: toFileUrl(this.getSkinFilePath(rest.hash))
      }
    })

    const savedKeys = new Set(
      skinsToSave.flatMap((skin) => [skin.id, skin.hash, skin.remoteId].filter(Boolean) as string[])
    )
    const preservedSkins = this.unloadableStoredSkins.filter((skin) =>
      ![skin.id, skin.hash, skin.remoteId].some((key) => !!key && savedKeys.has(key))
    )

    return [...skinsToSave, ...preservedSkins]
  }

  public async addSkin(skin: ISkinsConfig['skins'][0]) {
    const normalizedSkin = {
      ...skin,
      hash: skin.hash || skin.id
    }

    const existingIndex = this.skins.skins.findIndex((entry) => entry.id === normalizedSkin.id)

    if (existingIndex === -1) {
      this.skins.skins.push(normalizedSkin)
    } else {
      this.skins.skins[existingIndex] = normalizedSkin
    }

    await this.saveSkins()
  }

  public refreshSession(nickname: string, accessToken: string) {
    this.nickname = nickname
    this.setAccessToken(accessToken)
  }

  private mergeWithIndexOnDisk<T extends { id?: string; hash?: string; remoteId?: string }>(
    entries: T[],
    onDisk: T[],
    handledKeys: Set<string>
  ): T[] {
    const keysOf = (entry: T) =>
      [entry.id, entry.hash, entry.remoteId].filter((key): key is string => !!key)

    const known = new Set(entries.flatMap(keysOf))
    const merged = [...entries]

    for (const entry of onDisk) {
      const keys = keysOf(entry)
      if (!keys.length) continue
      if (keys.some((key) => known.has(key) || handledKeys.has(key))) continue

      for (const key of keys) known.add(key)
      merged.push(entry)
    }

    return merged
  }

  public async saveSkins() {
    const skinsToSave = this.getSkinsForSave()

    const capesToSave = this.getCapesForSave()

    await mutateJsonAtomic<StoredSkinsConfig>(path.join(this.skinsPath, 'index.json'), (current) => ({
      skins: this.mergeWithIndexOnDisk(skinsToSave, current?.skins ?? [], this.knownSkinKeys),
      capes: this.mergeWithIndexOnDisk(capesToSave, current?.capes ?? [], this.knownCapeKeys)
    }))
  }

  public async renameSkin(skinId: string, newName: string) {
    const skin = this.findSkinById(skinId)

    if (skin) {
      skin.name = this.getSkinName(newName, skin.hash, skin.id)
      await this.saveSkins()
    }
  }

  public getData(): SkinsData {
    this.selectedSkin =
      this.findSkinById(this.selectedSkin)?.id ?? this.skins.skins[0]?.id ?? null

    return {
      skins: this.skins,
      capes: this.capes,
      selectedSkin: this.selectedSkin,
      activeSkin: this.activeSkin,
      activeCape: this.activeCape,
      activeModel: this.activeModel
    }
  }
}
