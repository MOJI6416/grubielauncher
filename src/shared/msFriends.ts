export type MsPresenceStatus =
  | 'ONLINE'
  | 'PLAYING_OFFLINE'
  | 'PLAYING_REALMS'
  | 'PLAYING_SERVER'
  | 'PLAYING_HOSTED_SERVER'
  | 'OFFLINE'

export const MS_PRESENCE_STATUSES: readonly MsPresenceStatus[] = [
  'ONLINE',
  'PLAYING_OFFLINE',
  'PLAYING_REALMS',
  'PLAYING_SERVER',
  'PLAYING_HOSTED_SERVER',
  'OFFLINE',
]

export interface MsFriend {
  profileId: string
  name: string
  status?: MsPresenceStatus
  lastUpdated?: string
}

export interface MsFriendsSnapshot {
  friends: MsFriend[]
  incoming: MsFriend[]
  outgoing: MsFriend[]
  fetchedAt: string
}

export type MsFriendsError =
  | 'not_microsoft'
  | 'expired'
  | 'forbidden'
  | 'rate_limited'
  | 'unavailable'
  | 'unknown_profile'
  | 'cannot_add_self'
  | 'invalid'

export type MsFriendsResult =
  | { ok: true; data: MsFriendsSnapshot }
  | { ok: false; error: MsFriendsError }

export type MsFriendAction = 'add' | 'accept' | 'remove'

const PROFILE_ID = /^[0-9a-f]{32}$/
const PROFILE_NAME = /^[A-Za-z0-9_]{1,16}$/

export function normalizeProfileId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.replace(/-/g, '').toLowerCase()
  return PROFILE_ID.test(id) ? id : null
}

export function isProfileName(value: unknown): value is string {
  return typeof value === 'string' && PROFILE_NAME.test(value)
}

export function isPlaying(status: MsPresenceStatus | undefined): boolean {
  return !!status && status.startsWith('PLAYING_')
}

export function isOnline(status: MsPresenceStatus | undefined): boolean {
  return !!status && status !== 'OFFLINE'
}
