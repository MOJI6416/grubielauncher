export interface ISkinsConfig {
  skins: {
    capeId?: string
    model: 'slim' | 'classic'
    name: string
    id: string
    url: string
    character?: string
  }[]
}

export interface IGrubieSkin {
  _id: string
  skinUrl: string
  model: 'slim' | 'classic'
  capeUrl?: string
}

export interface IMojangProfile {
  id: string
  name: string
  skins: {
    id: string
    state: string
    url: string
    variant: 'SLIM' | 'CLASSIC'
  }[]
  capes: {
    id: string
    state: string
    url: string
    alias: string
  }[]
}

export interface ICape {
  id: string
  alias: string
  url: string
  cape: string
}
