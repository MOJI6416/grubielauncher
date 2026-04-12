import path from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import { fileURLToPath, pathToFileURL } from 'url'
import { BaseService } from '../services/Base'
import { detectSkinModel, getSkin, renderCape, renderCharacter } from '../utilities/skin'
import { getSha1 } from '../utilities/files'
import { Downloader } from '../utilities/downloader'
import { BACKEND_URL } from '@/shared/config'
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

type StoredSkinsConfig = {
  skins: Array<Partial<ISkinEntry> & Pick<ISkinEntry, 'id' | 'model' | 'name' | 'url'>>
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
  private platform: 'microsoft' | 'discord' = 'microsoft'
  private userId: string = ''
  private nickname: string = ''
  private downloader: Downloader
  private legacyCapeIdMap = new Map<string, string>()

  constructor(
    laucnherPath: string,
    platform: 'microsoft' | 'discord',
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

    if (platform == 'discord') {
      this.platform = 'discord'
      this.skinServiceUrl = BACKEND_URL
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
    const hasConflict = this.skins.skins.some(
      (skin) => skin.name === baseName && skin.id !== currentId
    )

    if (!hasConflict) return baseName
    return `${baseName}-${hash.slice(0, 6)}`
  }

  private shouldUpdateSkinName(
    currentName: string,
    hash: string,
    remoteId?: string
  ): boolean {
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

    await this.downloader.downloadFiles([
      {
        destination: tempPath,
        group: type === 'skin' ? 'skins' : 'capes',
        url
      }
    ])

    return tempPath
  }

  private async registerSkinFromFile(
    filePath: string,
    options: SkinRegistrationOptions = {}
  ): Promise<ISkinEntry | null> {
    if (!(await fs.pathExists(filePath))) return null

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
        this.shouldUpdateSkinName(
          existingSkin.name,
          hash,
          options.remoteId || existingSkin.remoteId
        )
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

  private async registerCapeFromFile(
    filePath: string,
    options: CapeRegistrationOptions = {}
  ): Promise<ICape | null> {
    if (!(await fs.pathExists(filePath))) return null

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

  private async syncSkinFromUrl(
    url: string,
    options: SkinRegistrationOptions = {}
  ): Promise<ISkinEntry | null> {
    const tempPath = await this.downloadToTemp(url, 'skin')

    try {
      return await this.registerSkinFromFile(tempPath, options)
    } finally {
      await fs.remove(tempPath).catch(() => {})
    }
  }

  private async syncCapeFromUrl(
    url: string,
    options: CapeRegistrationOptions = {}
  ): Promise<ICape | null> {
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

  private async resolveStoredSkinPath(storedSkin: StoredSkinsConfig['skins'][0]): Promise<string | null> {
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

  private async loadSkinsFromIndex() {
    const indexPath = path.join(this.skinsPath, 'index.json')

    try {
      const data: StoredSkinsConfig = await fs.readJSON(indexPath, 'utf-8')
      this.skins.skins = []

      for (const storedSkin of data.skins || []) {
        const skinPath = await this.resolveStoredSkinPath(storedSkin)
        if (!skinPath) continue

        const skin = await this.registerSkinFromFile(skinPath, {
          capeId: storedSkin.capeId,
          model: storedSkin.model,
          name: storedSkin.name,
          remoteId: storedSkin.remoteId,
          syncCape: Object.prototype.hasOwnProperty.call(storedSkin, 'capeId')
        })

        if (skin && storedSkin.capeId && storedSkin.capeId !== skin.capeId) {
          this.legacyCapeIdMap.set(storedSkin.capeId, skin.capeId || storedSkin.capeId)
        }
      }
    } catch {
      this.skins.skins = []
    }
  }

  public async load() {
    await fs.mkdir(this.skinsPath, { recursive: true })
    await fs.mkdir(path.join(this.skinsPath, 'capes'), { recursive: true })

    if (this.platform === 'microsoft') {
      this.capes = []
      this.legacyCapeIdMap.clear()
      await this.loadSkinsFromIndex()
      await this.getMojangSkins()
    } else {
      await this.getLocalCapes()
      await this.loadSkinsFromIndex()
      await this.getGrubieSkin()
    }

    await this.checkSkins()
    await this.saveSkins()
  }

  private async checkSkins() {
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
        }
      }
    }

    if (this.activeCape) {
      const mappedActiveCapeId = capeMap.get(this.activeCape)
      if (mappedActiveCapeId) {
        this.activeCape = mappedActiveCapeId
      }
    }
  }

  private async getGrubieSkin() {
    try {
      const response = await this.api.get<IGrubieSkin>(
        `${this.skinServiceUrl}/skins/${this.userId}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        }
      )

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
      console.error('Error fetching Grubie skins:', error)
    }
  }

  private async getLocalCapes() {
    try {
      const capesDir = path.join(this.skinsPath, 'capes')
      const capeFiles = await fs.readdir(capesDir)

      for (const file of capeFiles) {
        if (!file.endsWith('.png')) continue

        const legacyId = file.replace(/\.png$/i, '')
        const capePath = path.join(capesDir, file)
        const cape = await this.registerCapeFromFile(capePath, { alias: legacyId })

        if (cape && legacyId !== cape.id) {
          this.legacyCapeIdMap.set(legacyId, cape.id)
        }
      }
    } catch (error) {
      console.error('Error loading local capes:', error)
    }
  }

  private async getMojangSkins() {
    try {
      const response = await this.api.get<IMojangProfile>(
        `${this.skinServiceUrl}/minecraft/profile`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        }
      )

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
    } catch (error) {
      console.error('Error fetching Mojang skins:', error)
    }
  }

  public async setCapeId(capeId: string | undefined) {
    const skin = this.findSkinById(this.selectedSkin)
    if (skin) skin.capeId = capeId
  }

  public async changeModel(model: 'classic' | 'slim') {
    const skin = this.findSkinById(this.selectedSkin)
    if (skin) skin.model = model
  }

  public async deleteSkin(skinId: string, type: 'skin' | 'cape' = 'skin') {
    if (type === 'skin') {
      const index = this.skins.skins.findIndex((skin) => skin.id === skinId)

      if (index !== -1) {
        this.skins.skins.splice(index, 1)
        await fs.unlink(this.getSkinFilePath(skinId)).catch(() => {})
      }

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
        this.capes.splice(index, 1)
        await fs.unlink(this.getCapeFilePath(skinId)).catch(() => {})
      }

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
    try {
      await this.api.delete(`${this.skinServiceUrl}/minecraft/profile/skins/active`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })
      await this.hideCape()
      await this.getMojangSkins()
    } catch (error) {
      console.error('Error resetting skin:', error)
    }
  }

  public async importByUrl(url: string, type: 'skin' | 'cape' = 'skin') {
    try {
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
      console.error('Error importing skin by URL:', error)
      throw error
    }
  }

  public async importByFile(filePath: string, type: 'skin' | 'cape' = 'skin') {
    try {
      const fileName = path.basename(filePath, '.png')

      if (type == 'skin') {
        await this.importSkinFromExternalFile(filePath, { name: fileName })
      } else {
        const cape = await this.importCapeFromExternalFile(filePath, { alias: fileName })
        const skin = this.findSkinById(this.selectedSkin)

        if (skin) {
          skin.capeId = cape?.id
        }
      }

      await this.saveSkins()
    } catch (error) {
      console.error('Error importing skin by file:', error)
    }
  }

  public async importByNickname(nickname: string) {
    try {
      const player = await this.api.get<{ id: string }>(
        `https://api.mojang.com/users/profiles/minecraft/${nickname}`
      )

      const playerId = player.data.id
      const skins = await getSkin('microsoft', playerId, nickname)
      if (!skins) return

      await this.syncSkinFromUrl(skins.skin, { name: nickname })
      await this.saveSkins()
    } catch (error) {
      console.error('Error importing skin by nickname:', error)
      throw error
    }
  }

  public async uploadSkin(skinId: string) {
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
        this.platform === 'microsoft'
          ? selectedCape?.remoteId
            ? selectedCape.id
            : undefined
          : selectedCape?.id

      if (!(await fs.pathExists(skinPath))) {
        console.error('Skin file does not exist:', skinPath)
        return
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
          if (await fs.pathExists(capePath)) {
            const capeBuffer = await fs.readFile(capePath)
            const capeBlob = new Blob([capeBuffer], { type: 'image/png' })
            formData.append('cape', capeBlob, `${selectedCape.hash}.png`)
          }
        }

        const response = await this.api.post<IGrubieSkin>(
          `${this.skinServiceUrl}/skins/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`
            }
          }
        )

        skin.remoteId = response.data._id
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
      }
    } catch (error) {
      console.error('Error uploading skin:', error)
    }
  }

  private async showCape(capeId: string) {
    try {
      const cape = this.findCapeById(capeId)
      if (!cape?.remoteId) {
        console.error('Cape remote id is missing:', capeId)
        return
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
    } catch (error) {
      console.error('Error showing cape:', error)
    }
  }

  private async hideCape() {
    try {
      await this.api.delete(`${this.skinServiceUrl}/minecraft/profile/capes/active`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        }
      })
    } catch (error) {
      console.error('Error hiding cape:', error)
    }
  }

  public addSkin(skin: ISkinsConfig['skins'][0]) {
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

    this.saveSkins()
  }

  public refreshSession(nickname: string, accessToken: string) {
    this.nickname = nickname
    this.setAccessToken(accessToken)
  }

  public async saveSkins() {
    const skinsToSave = this.skins.skins.map(({ character, ...rest }) => ({
      ...rest,
      url: toFileUrl(this.getSkinFilePath(rest.hash))
    }))

    await fs.writeJSON(
      path.join(this.skinsPath, 'index.json'),
      { skins: skinsToSave },
      { spaces: 2 }
    )
  }

  public async renameSkin(skinId: string, newName: string) {
    const skin = this.findSkinById(skinId)

    if (skin) {
      skin.name = this.getSkinName(newName, skin.hash, skin.id)
      await this.saveSkins()
    }
  }

  public getData(): SkinsData {
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
