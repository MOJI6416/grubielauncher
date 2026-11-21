export const COMPANION_FILE_PREFIX = 'grubie-companion-'
export const COMPANION_PROTOCOL = 2
export const COMPANION_STATS_DIR = 'server-stats'
export const COMPANION_ENV_ADDRESS = 'GRUBIE_COMPANION_ADDRESS'
export const COMPANION_ENV_TOKEN = 'GRUBIE_COMPANION_TOKEN'
export const COMPANION_ENV_STATS_DIR = 'GRUBIE_COMPANION_STATS_DIR'

const SHARE_JOIN_SUFFIX = '.join.grubielauncher.com'

export interface CompanionSupport {
  supported: boolean
  version: string | null
}

export interface CompanionSession {
  versionName: string
  instance: number
  mod: string
}

export type CompanionToastKind =
  | 'message'
  | 'invite'
  | 'call'
  | 'achievement'
  | 'screenshot'
  | 'system'

export interface CompanionToast {
  id: string
  kind: CompanionToastKind
  title: string
  body: string
  count: number
  actionable: boolean
  meta?: string
  avatar?: string
}

export type CompanionFriendStatus = 'online' | 'away' | 'busy' | 'playing'

export interface CompanionFriend {
  id: string
  name: string
  status: CompanionFriendStatus
  activity?: string
  avatarUrl?: string
  joinable: boolean
}

export interface CompanionFriends {
  online: CompanionFriend[]
  offline: number
}

export interface CompanionVoiceMember {
  id: string
  name: string
  speaking: boolean
  muted: boolean
  avatarUrl?: string
}

export interface CompanionVoice {
  active: boolean
  channel?: string
  muted: boolean
  deafened: boolean
  ptt: boolean
  pttKey?: string
  pttCode?: number
  members: CompanionVoiceMember[]
}

export interface CompanionSelf {
  id: string
  name: string
}

export type CompanionGameAction =
  | { kind: 'decline'; id: string }
  | { kind: 'invite'; req: string; friend: string; server?: { address: string; name: string } }
  | { kind: 'join'; req: string; friend: string }
  | { kind: 'voice'; action: 'mute' | 'unmute' | 'deafen' | 'undeafen' }
  | { kind: 'ptt'; down: boolean }
  | { kind: 'sendScreenshot'; req: string; path: string; friend: string }

export interface CompanionGameEvent {
  session: CompanionSession
  action: CompanionGameAction
}

export interface CompanionResult {
  versionName: string
  instance: number
  req: string
  ok: boolean
  error?: string
}

export interface CompanionStage {
  versionName: string
  instance: number
  stage: string
  detail?: string
}

export interface CompanionHang {
  versionName: string
  instance: number
  seconds: number
  stage: string
  mods: string[]
  frames: string[]
}

export function isCompanionModFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.startsWith(COMPANION_FILE_PREFIX) &&
    (lower.endsWith('.jar') || lower.endsWith('.jar.disabled'))
  )
}

export function normalizeServerAddress(address: string): string {
  let value = address.trim().toLowerCase()
  if (value.endsWith(':25565')) value = value.slice(0, -6)
  while (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

function hostOf(address: string): string {
  if (address.startsWith('[')) {
    const end = address.indexOf(']')
    return end > 0 ? address.slice(1, end) : address
  }
  const colons = address.split(':').length - 1
  if (colons > 1) return address
  return address.split(':')[0]
}

export function isTrackedServerAddress(address: string): boolean {
  const host = hostOf(normalizeServerAddress(address))
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return false
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return false
  if (host === 'join.grubielauncher.com' || host.endsWith(SHARE_JOIN_SUFFIX)) return false
  return true
}
