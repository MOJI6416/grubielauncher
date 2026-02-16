import { IPlayerSkin, ISkinData, ITexture } from '@/types/Skin'
import axios from 'axios'
import { Backend } from '../services/Backend'
import { createCanvas, loadImage } from 'canvas'
import fs from 'fs'

export async function getSkin(
  type: string,
  uuid: string,
  nickname: string,
  accessToken?: string
): Promise<ISkinData | null> {
  if (type == 'microsoft') {
    try {
      const response = await axios.get<IPlayerSkin>(
        `https://sessionserver.mojang.com/session/minecraft/profile/${uuid}?timestamp=${new Date().getTime()}`
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
      skin: `http://skinsystem.ely.by/skins/${nickname}.png?timestamp=${new Date().getTime()}`
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
    const skin = await loadImage(skinPath)

    const is64x64 = skin.height === 64

    const width = 16 * scale
    const height = 32 * scale

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')

    ctx.imageSmoothingEnabled = false

    ctx.drawImage(skin, 8, 8, 8, 8, 4 * scale, 0 * scale, 8 * scale, 8 * scale) // face
    if (is64x64) {
      ctx.drawImage(skin, 40, 8, 8, 8, 4 * scale, 0 * scale, 8 * scale, 8 * scale) // head overlay
    }

    ctx.drawImage(skin, 20, 20, 8, 12, 4 * scale, 8 * scale, 8 * scale, 12 * scale) // body
    if (is64x64) {
      ctx.drawImage(skin, 20, 36, 8, 12, 4 * scale, 8 * scale, 8 * scale, 12 * scale) // body overlay
    }

    ctx.drawImage(skin, 4, 20, 4, 12, 4 * scale, 20 * scale, 4 * scale, 12 * scale)
    if (is64x64) {
      ctx.drawImage(skin, 4, 36, 4, 12, 4 * scale, 20 * scale, 4 * scale, 12 * scale) // overlay
    }

    if (is64x64) {
      ctx.drawImage(skin, 4, 20, 4, 12, 8 * scale, 20 * scale, 4 * scale, 12 * scale) // right leg
      ctx.drawImage(skin, 4, 36, 4, 12, 8 * scale, 20 * scale, 4 * scale, 12 * scale) // overlay
    } else {
      ctx.drawImage(skin, 4, 20, 4, 12, 8 * scale, 20 * scale, 4 * scale, 12 * scale) // mirrored left leg
    }

    ctx.drawImage(skin, 44, 20, 4, 12, 0 * scale, 8 * scale, 4 * scale, 12 * scale)
    if (is64x64) {
      ctx.drawImage(skin, 44, 36, 4, 12, 0 * scale, 8 * scale, 4 * scale, 12 * scale) // overlay
    }

    if (is64x64) {
      ctx.drawImage(skin, 36, 52, 4, 12, 12 * scale, 8 * scale, 4 * scale, 12 * scale) // right arm
      ctx.drawImage(skin, 52, 52, 4, 12, 12 * scale, 8 * scale, 4 * scale, 12 * scale) // overlay
    } else {
      ctx.drawImage(skin, 44, 20, 4, 12, 12 * scale, 8 * scale, 4 * scale, 12 * scale) // mirrored left arm
    }

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

export async function renderCape(capePath: string, scale = 4): Promise<string> {
  if (!fs.existsSync(capePath)) {
    return ''
  }

  try {
    const cape = await loadImage(capePath)

    const width = 10 * scale
    const height = 16 * scale

    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    ctx.drawImage(cape, 1, 1, 10, 16, 0, 0, 10 * scale, 16 * scale)

    return canvas.toDataURL('image/png')
  } catch {
    return ''
  }
}

export async function detectSkinModel(skinPath: string): Promise<'slim' | 'classic'> {
  if (!fs.existsSync(skinPath)) {
    return 'classic'
  }

  try {
    const img = await loadImage(skinPath)

    if (img.width <= 54 || img.height <= 31) {
      return 'classic'
    }

    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)

    const imageData = ctx.getImageData(54, 20, 1, 12).data

    for (let i = 3; i < imageData.length; i += 4) {
      if (imageData[i] === 0) {
        return 'slim'
      }
    }

    return 'classic'
  } catch {
    return 'classic'
  }
}
