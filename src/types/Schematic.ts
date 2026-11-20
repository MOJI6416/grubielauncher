export type SchematicFormat = 'litematic' | 'sponge' | 'mcedit' | 'structure'

export type SchematicFolder = 'schematics' | 'worldedit'

export interface ISchematicFile {
  path: string
  relativePath: string
  fileName: string
  name: string
  folder: SchematicFolder
  format: SchematicFormat
  size: number
  modifiedAt: number
}

export interface ISchematicBlock {
  id: string
  count: number
}

export interface ISchematicDetails {
  format: SchematicFormat
  formatVersion: number | null
  dataVersion: number | null
  name: string | null
  author: string | null
  description: string | null
  size: { x: number; y: number; z: number }
  volume: number
  blockCount: number | null
  blockTypes: number
  blocks: ISchematicBlock[]
  regions: number | null
  blockEntities: number | null
  entities: number | null
  createdAt: number | null
  modifiedAt: number | null
}

export type SchematicInspectResult =
  | { ok: true; details: ISchematicDetails }
  | { ok: false; error: 'missing' | 'tooLarge' | 'unreadable' }

export type SchematicTransferResult =
  | { ok: true; path: string; relativePath: string }
  | { ok: false; error: 'missing' | 'sameInstance' | 'invalidPath' | 'failed' }

export interface SchematicVolume {
  size: { x: number; y: number; z: number }
  palette: string[]
  data: Uint16Array | Uint32Array
  yFrom: number
  yTo: number
  blocks: number
}

export type SchematicVolumeResult =
  | { ok: true; volume: SchematicVolume }
  | { ok: false; error: 'missing' | 'tooLarge' | 'unreadable' }

export interface BlockInfo {
  name: string
  icon: string | null
}

export interface BakedQuad {
  positions: number[]
  uvs: number[]
  texture: number
  cull: number
  shade: number
  tint: number
}

export interface BakedBlock {
  quads: BakedQuad[]
  cube: boolean
  liquid: boolean
  missing: boolean
}

export interface BlockTexture {
  name: string
  png: Uint8Array | null
  color: [number, number, number] | null
}

export interface BlockModelSet {
  textures: BlockTexture[]
  blocks: BakedBlock[]
  vanillaSource: 'instance' | 'other' | 'none'
}
