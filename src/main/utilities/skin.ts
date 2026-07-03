import { IPlayerSkin, ISkinData, ITexture } from '@/types/Skin'
import axios from 'axios'
import { Backend } from '../services/Backend'
import fs from 'fs'
import { PNG } from 'pngjs'
import { blit } from './skinRender'

async function readPngFile(filePath: string): Promise<PNG> {
  const buffer = await fs.promises.readFile(filePath)
  return PNG.sync.read(buffer)
}

function pngToDataUrl(png: PNG): string {
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

interface IMicrosoftProfileTexture {
  id: string
  state?: string
  url?: string
}

interface IMicrosoftProfile {
  id: string
  name: string
  skins?: IMicrosoftProfileTexture[]
  capes?: IMicrosoftProfileTexture[]
}

function pickActiveTexture(items?: IMicrosoftProfileTexture[]) {
  if (!items?.length) return undefined

  return (
    items.find(item => item.url && item.state?.toUpperCase() === 'ACTIVE') ??
    items.find(item => item.url && item.state?.toUpperCase() === 'EQUIPPED') ??
    items.find(item => item.url)
  )
}

export async function getSkin(
  type: string,
  uuid: string,
  nickname: string,
  accessToken?: string
): Promise<ISkinData | null> {
  if (type == 'microsoft') {
    const cleanUuid = uuid?.replace(/-/g, '')

    if (accessToken) {
      try {
        const profileResponse = await axios.get<IMicrosoftProfile>(
          'https://api.minecraftservices.com/minecraft/profile',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          }
        )

        const activeSkin = pickActiveTexture(profileResponse.data.skins)
        if (activeSkin?.url) {
          return {
            skin: activeSkin.url,
            cape: pickActiveTexture(profileResponse.data.capes)?.url
          }
        }
      } catch {
      }
    }

    try {
      if (!cleanUuid) return null

      const response = await axios.get<IPlayerSkin>(
        `https://sessionserver.mojang.com/session/minecraft/profile/${cleanUuid}?timestamp=${new Date().getTime()}`
      )

      const texturesProperty = response.data.properties.find(
        (property) => property.name === 'textures'
      )

      if (!texturesProperty) return null

      const decode = Buffer.from(texturesProperty.value, 'base64').toString('utf-8')

      const json: ITexture = JSON.parse(decode)

      const skin: string | undefined = json?.textures?.SKIN?.url
      const cape: string | undefined = json?.textures?.CAPE?.url

      if (!skin) return null

      return {
        skin,
        cape
      }
    } catch (err) {
      return null
    }
  } else if (type == 'elyby') {
    return {
      skin: `https://skinsystem.ely.by/skins/${nickname}.png?timestamp=${new Date().getTime()}`
    }
  } else if (type == 'discord') {
    if (!accessToken) return null

    const backend = new Backend(accessToken)
    const skin = await backend.getSkin(uuid)
    if (!skin) return null

    return {
      skin: skin.skinUrl,
      cape: skin.capeUrl
    }
  }

  return null
}

export async function renderCharacter(skinPath: string, scale = 4): Promise<string> {
  if (!fs.existsSync(skinPath)) {
    return ''
  }

  try {
    const skin = await readPngFile(skinPath)

    const is64x64 = skin.height === 64

    const width = 16 * scale
    const height = 32 * scale

    const out = new PNG({ width, height })

    blit(skin, 8, 8, 8, 8, out, 4 * scale, 0 * scale, 8 * scale, 8 * scale)
    if (is64x64) {
      blit(skin, 40, 8, 8, 8, out, 4 * scale, 0 * scale, 8 * scale, 8 * scale)
    }

    blit(skin, 20, 20, 8, 12, out, 4 * scale, 8 * scale, 8 * scale, 12 * scale)
    if (is64x64) {
      blit(skin, 20, 36, 8, 12, out, 4 * scale, 8 * scale, 8 * scale, 12 * scale)
    }

    blit(skin, 4, 20, 4, 12, out, 4 * scale, 20 * scale, 4 * scale, 12 * scale)
    if (is64x64) {
      blit(skin, 4, 36, 4, 12, out, 4 * scale, 20 * scale, 4 * scale, 12 * scale)
    }

    if (is64x64) {
      blit(skin, 20, 52, 4, 12, out, 8 * scale, 20 * scale, 4 * scale, 12 * scale)
      blit(skin, 4, 52, 4, 12, out, 8 * scale, 20 * scale, 4 * scale, 12 * scale)
    } else {
      blit(skin, 4, 20, 4, 12, out, 8 * scale, 20 * scale, 4 * scale, 12 * scale)
    }

    blit(skin, 44, 20, 4, 12, out, 0 * scale, 8 * scale, 4 * scale, 12 * scale)
    if (is64x64) {
      blit(skin, 44, 36, 4, 12, out, 0 * scale, 8 * scale, 4 * scale, 12 * scale)
    }

    if (is64x64) {
      blit(skin, 36, 52, 4, 12, out, 12 * scale, 8 * scale, 4 * scale, 12 * scale)
      blit(skin, 52, 52, 4, 12, out, 12 * scale, 8 * scale, 4 * scale, 12 * scale)
    } else {
      blit(skin, 44, 20, 4, 12, out, 12 * scale, 8 * scale, 4 * scale, 12 * scale)
    }

    return pngToDataUrl(out)
  } catch {
    return ''
  }
}

export async function renderCape(capePath: string, scale = 4): Promise<string> {
  if (!fs.existsSync(capePath)) {
    return ''
  }

  try {
    const cape = await readPngFile(capePath)

    const width = 10 * scale
    const height = 16 * scale

    const out = new PNG({ width, height })
    blit(cape, 1, 1, 10, 16, out, 0, 0, 10 * scale, 16 * scale)

    return pngToDataUrl(out)
  } catch {
    return ''
  }
}

export async function detectSkinModel(skinPath: string): Promise<'slim' | 'classic'> {
  if (!fs.existsSync(skinPath)) {
    return 'classic'
  }

  try {
    const img = await readPngFile(skinPath)

    if (img.width <= 54 || img.height <= 31) {
      return 'classic'
    }

    for (let y = 20; y < 32; y++) {
      if (img.data[(y * img.width + 54) * 4 + 3] === 0) {
        return 'slim'
      }
    }

    return 'classic'
  } catch {
    return 'classic'
  }
}
