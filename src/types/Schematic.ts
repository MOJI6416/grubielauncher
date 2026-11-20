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
