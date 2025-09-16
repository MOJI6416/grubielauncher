export interface IPlayerSkin {
  id: string
  name: string
  legasy: boolean
  properties: {
    name: string
    signature: string
    value: string
  }[]
}

export interface ITexture {
  timestamp: number
  profileId: string
  profileName: string
  signatureRequired: boolean
  textures: {
    SKIN: {
      url: string
      metadata: {
        model: string
      }
    }
    CAPE?: {
      url: string
    }
  }
}

export interface ISkinData {
  skin: string
  cape?: string
}
