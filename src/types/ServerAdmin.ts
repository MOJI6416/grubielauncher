export type ServerAdminMode = 'msmp' | 'stdin' | 'none'

export type ServerAdminFallback = 'old_version' | 'connect_failed' | null

export interface ServerAdminPlayer {
  name: string
  id?: string
}

export interface ServerAdminOperator extends ServerAdminPlayer {
  permissionLevel?: number
  bypassesPlayerLimit?: boolean
}

export interface ServerAdminBan extends ServerAdminPlayer {
  reason?: string
  source?: string
  expires?: string
}

export interface ServerAdminGameRule {
  key: string
  type: 'boolean' | 'integer'
  value: boolean | number | null
}

export interface ServerAdminSnapshot {
  serverPath: string
  mode: ServerAdminMode
  connecting: boolean
  secure: boolean
  fallback: ServerAdminFallback
  players: ServerAdminPlayer[]
  operators: ServerAdminOperator[]
  allowlist: ServerAdminPlayer[]
  allowlistEnabled: boolean | null
  bans: ServerAdminBan[]
  gamerules: ServerAdminGameRule[]
  gamerulesLoaded: boolean
}

export type ServerAdminAction =
  | { type: 'kick'; name: string; message?: string }
  | { type: 'ban'; name: string; reason?: string }
  | { type: 'pardon'; name: string }
  | { type: 'op'; name: string }
  | { type: 'deop'; name: string }
  | { type: 'allowlistAdd'; name: string }
  | { type: 'allowlistRemove'; name: string }
  | { type: 'allowlistEnabled'; enabled: boolean }
  | { type: 'gamerule'; key: string; value: boolean | number }

export interface ServerAdminResult {
  ok: boolean
  error?: string
  snapshot?: ServerAdminSnapshot
}

export interface ServerAdminEvent {
  serverPath: string
  kind: 'joined' | 'left' | 'changed'
  player?: ServerAdminPlayer
  snapshot: ServerAdminSnapshot
}

export function emptyServerAdminSnapshot(serverPath: string): ServerAdminSnapshot {
  return {
    serverPath,
    mode: 'none',
    connecting: false,
    secure: false,
    fallback: null,
    players: [],
    operators: [],
    allowlist: [],
    allowlistEnabled: null,
    bans: [],
    gamerules: [],
    gamerulesLoaded: false,
  }
}
