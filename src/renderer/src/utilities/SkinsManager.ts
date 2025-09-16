import { getSkin } from './Skin'
import { ICape, IGrubieSkin, IMojangProfile, ISkinsConfig } from '@/types/SkinManager'
import { BaseService, baseUrl } from '@renderer/services/Base'

const api = window.api
const fs = api.fs
const path = api.path
const renderCharacter = api.renderCharacter
const renderCape = api.renderCape
const detectSkinModel = api.detectSkinModel

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

    if (platform == 'discord') {
      this.platform = 'discord'
      this.skinServiceUrl = baseUrl
    }
  }

  public isActive() {
    const selectedSkin = this.skins.skins.find((s) => s.id == this.selectedSkin)
    return (
      this.selectedSkin == this.activeSkin &&
      selectedSkin?.capeId == this.activeCape &&
      selectedSkin?.model == this.activeModel
    )
  }

  public getSelectedSkin() {
    if (!this.selectedSkin) return null
    const skin = this.skins.skins.find((s) => s.id == this.selectedSkin)
    if (!skin) return null

    return {
      ...skin,
      capeUrl: skin.capeId
        ? `file://${path.join(this.skinsPath, 'capes', `${skin.capeId}.png`)}`
        : undefined,
      skinUrl: `file://${path.join(this.skinsPath, `${skin.id}.png`)}`
    }
  }

  public async load() {
    try {
      await fs.mkdir(this.skinsPath, { recursive: true })
      await fs.mkdir(path.join(this.skinsPath, 'capes'), { recursive: true })

      await this.loadSkins()
      if (this.platform == 'microsoft') await this.getMojangSkins()
      else {
        await this.getLocalCapes()
        await this.getGrubieSkin()
      }
      await this.checkSkins()
    } catch (error) {
      console.error('Error initializing skins directory:', error)
    }
  }

  private async loadSkins() {
    try {
      const data: ISkinsConfig = await fs.readJSON(path.join(this.skinsPath, 'index.json'), 'utf-8')
      let isSaved = false

      for (const skin of data.skins) {
        const skinPath = path.join(this.skinsPath, `${skin.id}.png`)

        if (await fs.pathExists(skinPath)) {
          this.skins.skins.push({
            ...skin,
            url: `file://${skinPath}`,
            character: await renderCharacter(skinPath)
          })
        } else {
          data.skins = data.skins.filter((s) => s.id != skin.id)
          isSaved = true
        }
      }

      if (isSaved) {
        await fs.writeJSON(
          path.join(this.skinsPath, 'index.json'),
          { ...data, skins: data.skins },
          {
            encoding: 'utf-8',
            spaces: 2
          }
        )
      }
    } catch (error) {
      console.error('Error loading skins:', error)
    }
  }

  private async checkSkins() {
    for (const skin of this.skins.skins) {
      let capeId: string | undefined = undefined
      if (skin.capeId) {
        capeId = this.capes.find((c) => c.id == skin.capeId)?.id
      }

      skin.capeId = capeId
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

      const skin = response.data

      const skinPath = path.join(this.skinsPath, `${skin._id}.png`)

      let capeId: string | undefined = undefined
      if (skin.capeUrl) {
        capeId = skin.capeUrl.split('/').pop()?.split('?')[0].replace('.png', '')
        const capePath = path.join(this.skinsPath, 'capes', `${capeId}.png`)

        if (capeId) {
          if (!this.capes.find((c) => c.id == capeId)) {
            await api.startDownload([
              {
                group: 'capes',
                url: skin.capeUrl,
                destination: path.join(this.skinsPath, 'capes', `${capeId}.png`)
              }
            ])

            this.capes.push({
              id: capeId,
              url: skin.capeUrl,
              cape: await renderCape(capePath),
              alias: ''
            })
          }
        }
      }

      const skinExists = this.skins.skins.find((s) => s.id == skin._id)
      if (!skinExists) {
        await api.startDownload([
          {
            group: 'skins',
            url: skin.skinUrl,
            destination: skinPath
          }
        ])

        this.skins.skins.push({
          model: skin.model,
          name: this.skins.skins.find((s) => s.name == this.nickname) ? skin._id : this.nickname,
          id: skin._id,
          url: skin.skinUrl,
          capeId,
          character: await renderCharacter(skinPath)
        })
      } else {
        skinExists.capeId = capeId
      }

      this.activeSkin = skin._id
      this.selectedSkin = skin._id
      this.activeCape = capeId
      this.activeModel = skin.model

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
        if (file.endsWith('.png')) {
          const capeId = file.replace('.png', '')
          const capePath = path.join(capesDir, file)

          if (this.capes.find((c) => c.id == capeId)) continue

          this.capes.push({
            id: capeId,
            url: `file://${capePath}`,
            cape: await renderCape(capePath),
            alias: capeId
          })
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

      for (const cape of capes) {
        if (this.capes.find((c) => c.id == cape.id)) continue
        const destination = path.join(this.skinsPath, 'capes', `${cape.id}.png`)

        await api.startDownload([
          {
            group: 'capes',
            url: cape.url,
            destination
          }
        ])

        this.capes.push({
          ...cape,
          url: `file://${destination}`,
          cape: await renderCape(destination)
        })
      }

      for (const skin of skins) {
        let isExists = false
        if (!this.skins.skins.find((s) => s.id == skin.id)) {
          this.skins.skins.push({
            model: skin.variant == 'SLIM' ? 'slim' : 'classic',
            name: this.skins.skins.find((s) => s.name == name) ? skin.id : name,
            id: skin.id,
            url: skin.url,
            capeId: capes[0].state == 'ACTIVE' ? capes[0].id : undefined
          })
        } else isExists = true

        const _skin = this.skins.skins.find((s) => s.id == skin.id)

        if (!_skin) continue

        if (skin.state == 'ACTIVE') {
          this.activeSkin = skin.id
          this.selectedSkin = skin.id
          this.activeModel = _skin.model

          const cape = capes.find((c) => c.id == _skin.capeId)

          if (cape) {
            if (cape.state == 'INACTIVE') {
              this.activeCape = undefined
              if (_skin.capeId) {
                _skin.capeId = undefined
              }
            } else {
              this.activeCape = cape.id
              if (_skin.capeId != cape.id) {
                _skin.capeId = cape.id
              }
            }
          }
        }

        const skinPath = path.join(this.skinsPath, `${skin.id}.png`)

        await api.startDownload([
          {
            group: 'skins',
            url: skin.url,
            destination: skinPath
          }
        ])
        if (!isExists) _skin.character = await renderCharacter(skinPath)
      }

      await this.saveSkins()
    } catch (error) {
      console.error('Error fetching Mojang skins:', error)
    }
  }

  public async setCapeId(capeId: string | undefined) {
    const skin = this.skins.skins.find((s) => s.id == this.selectedSkin)
    if (skin) {
      skin.capeId = capeId
    }
  }

  public async changeModel(model: 'classic' | 'slim') {
    const skin = this.skins.skins.find((s) => s.id == this.selectedSkin)
    if (skin) {
      skin.model = model
    }
  }

  public async deleteSkin(skinId: string, type: 'skin' | 'cape' = 'skin') {
    if (this.activeSkin == skinId) return

    if (type == 'skin') {
      const skinIndex = this.skins.skins.findIndex((s) => s.id == skinId)
      if (skinIndex == -1) return

      this.skins.skins.splice(skinIndex, 1)

      if (this.selectedSkin == skinId) {
        const skin = this.skins.skins[0]
        this.selectedSkin = skin ? skin.id : null
      }

      await fs.unlink(path.join(this.skinsPath, `${skinId}.png`))
    } else {
      const capeIndex = this.capes.findIndex((c) => c.id == skinId)
      if (capeIndex == -1) return

      this.capes.splice(capeIndex, 1)

      const skins = this.skins.skins.filter((s) => s.capeId == skinId)
      for (const skin of skins) {
        skin.capeId = undefined
      }

      await fs.unlink(path.join(this.skinsPath, 'capes', `${skinId}.png`))
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
      const id = url.split('/').pop()?.split('?')[0]
      if (!id) return

      if (type == 'skin') {
        const skinExists = this.skins.skins.find((s) => s.id == id)
        if (skinExists) return

        const skinPath = path.join(this.skinsPath, `${id}.png`)

        await api.startDownload([
          {
            destination: skinPath,
            group: 'skins',
            url
          }
        ])

        this.skins.skins.push({
          model: await detectSkinModel(skinPath),
          name: id,
          id: id,
          url: `file://${skinPath}`,
          character: await renderCharacter(skinPath)
        })
      } else {
        const capeExists = this.capes.find((c) => c.id == id)
        if (capeExists) return

        const capePath = path.join(this.skinsPath, 'capes', `${id}.png`)

        await api.startDownload([
          {
            destination: capePath,
            group: 'capes',
            url
          }
        ])

        this.capes.push({
          id: id,
          url: `file://${capePath}`,
          cape: await renderCape(capePath),
          alias: id
        })

        const skin = this.skins.skins.find((s) => s.id == this.selectedSkin)
        if (skin) {
          skin.capeId = id
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
        const skinExists = this.skins.skins.find((s) => s.id == fileName)
        if (skinExists) return

        const skinPath = path.join(this.skinsPath, `${fileName}.png`)
        await fs.copyFile(filePath, skinPath)

        let character: string | undefined = undefined
        try {
          character = await renderCharacter(skinPath)
        } catch (error) {
          console.log('Error rendering character:', error)
        }

        this.skins.skins.push({
          model: await detectSkinModel(skinPath),
          name: fileName,
          id: fileName,
          url: `file://${skinPath}`,
          character
        })
      } else {
        const capeExists = this.capes.find((c) => c.id == fileName)
        if (capeExists) return

        const capePath = path.join(this.skinsPath, 'capes', `${fileName}.png`)
        await fs.copyFile(filePath, capePath)

        this.capes.push({
          id: fileName,
          url: `file://${capePath}`,
          cape: await renderCape(capePath),
          alias: fileName
        })

        const skin = this.skins.skins.find((s) => s.id == this.selectedSkin)
        if (skin) {
          skin.capeId = fileName
        }
      }

      await this.saveSkins()
    } catch (error) {
      console.error('Error importing skin by file:', error)
    }
  }

  public async importByNickname(nickname: string) {
    try {
      const player = await this.api.get<{
        id: string
      }>(`https://api.mojang.com/users/profiles/minecraft/${nickname}`)

      const playerId = player.data.id
      const skins = await getSkin('microsoft', playerId, nickname)
      if (!skins) return

      const { skin } = skins

      const skinId = skin.split('/').pop()?.split('?')[0]
      if (!skinId) return

      const skinExists = this.skins.skins.find((s) => s.id == skinId)
      if (skinExists) return

      const skinPath = path.join(this.skinsPath, `${skinId}.png`)
      await api.startDownload([
        {
          destination: skinPath,
          group: 'skins',
          url: skin
        }
      ])

      this.skins.skins.push({
        model: await detectSkinModel(skinPath),
        name: this.skins.skins.find((s) => s.name == nickname) ? skinId : nickname,
        id: skinId,
        url: skin,
        character: await renderCharacter(skinPath)
      })
      await this.saveSkins()
    } catch (error) {
      console.error('Error importing skin by nickname:', error)
      throw error
    }
  }

  public async uploadSkin(skinId: string) {
    try {
      const skin = this.skins.skins.find((s) => s.id == skinId)
      if (!skin) return

      const skinPath = path.join(this.skinsPath, `${skinId}.png`)
      if (!(await fs.pathExists(skinPath))) {
        console.error('Skin file does not exist:', skinPath)
        return
      }

      const formData = new FormData()
      formData.append('variant', skin.model)
      const buffer = await fs.readFile(skinPath)
      const blob = new Blob([buffer], { type: 'image/png' })
      formData.append('file', blob, `${skinId}.png`)

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

        skin.id = profile.data.skins[0].id
        skin.url = profile.data.skins[0].url
      } else {
        if (skin.capeId) {
          const capePath = path.join(this.skinsPath, 'capes', `${skin.capeId}.png`)
          const buffer = await fs.readFile(capePath)
          const blob = new Blob([buffer], { type: 'image/png' })
          formData.append('cape', blob, `${skin.capeId}.png`)
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
        const newSkin = response.data
        skin.id = newSkin._id
        skin.url = newSkin.skinUrl
      }

      await fs.rename(skinPath, path.join(this.skinsPath, `${skin.id}.png`))

      this.selectedSkin = skin.id
      this.activeSkin = skin.id
      this.activeCape = skin.capeId
      this.activeModel = skin.model

      await this.saveSkins()

      if (this.platform == 'microsoft') {
        if (skin.capeId) {
          await this.showCape(skin.capeId)
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
      const formData = new FormData()
      formData.append('capeId', capeId)

      await this.api.put(
        `${this.skinServiceUrl}/minecraft/profile/capes/active`,
        { capeId },
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
    this.skins.skins.push(skin)
    this.saveSkins()
  }

  public async saveSkins() {
    try {
      const skinsToSave = this.skins.skins.map(({ character, ...rest }) => rest)

      await fs.writeJSON(
        path.join(this.skinsPath, 'index.json'),
        { ...this.skins, skins: skinsToSave },
        {
          encoding: 'utf-8',
          spaces: 2
        }
      )
    } catch (error) {
      console.error('Error saving skins:', error)
    }
  }

  public async renameSkin(skinId: string, name: string) {
    const skin = this.skins.skins.find((s) => s.id == skinId)
    if (!skin) return

    skin.name = name

    await this.saveSkins()
  }
}
