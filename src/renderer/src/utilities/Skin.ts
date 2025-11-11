import { IPlayerSkin, ISkinData, ITexture } from '@/types/Skin'
import { Backend } from '@renderer/services/Backend'
import axios from 'axios'

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

      const decode = atob(texturesProperty.value)
      const json: ITexture = JSON.parse(decode)

      const skin: string = json.textures.SKIN.url
      const cape: string | undefined = json.textures.CAPE?.url

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
