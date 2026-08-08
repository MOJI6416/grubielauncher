export type AllowedPathKind = 'file' | 'folder'
export type AllowedPathAccess = 'read' | 'readwrite'

export interface BlessedPathInfo {
  path: string
  kind: AllowedPathKind
  access: AllowedPathAccess
  addedAt: number
  expiresAt: number
}
