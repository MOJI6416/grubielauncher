import axios, { AxiosError } from 'axios'
import { jwtDecode } from 'jwt-decode'
import type { IAuth } from '@/types/Account'
import {
  MS_PRESENCE_STATUSES,
  type MsFriend,
  type MsFriendAction,
  type MsFriendsError,
  type MsFriendsResult,
  type MsPresenceStatus,
  isProfileName,
  normalizeProfileId,
} from '@/shared/msFriends'

const FRIENDS_URL = 'https://api.minecraftservices.com/friends'
const PRESENCE_URL = 'https://api.minecraftservices.com/presence'
const REQUEST_TIMEOUT_MS = 10_000
const MAX_ENTRIES = 1000

export function minecraftTokenOf(accountJwt: string, nowMs = Date.now()): string | null {
  try {
    const auth = jwtDecode<IAuth>(accountJwt).auth
    if (!auth?.accessToken || auth.accessToken === '0') return null
    if (auth.expiresAt && auth.expiresAt <= nowMs) return null
    return auth.accessToken
  } catch {
    return null
  }
}

function readProfiles(value: unknown): MsFriend[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: MsFriend[] = []
  for (const entry of value.slice(0, MAX_ENTRIES)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const profileId = normalizeProfileId(record.profileId)
    if (!profileId || seen.has(profileId) || !isProfileName(record.name)) continue
    seen.add(profileId)
    result.push({ profileId, name: record.name })
  }
  return result
}

export function parseFriendsResponse(data: unknown) {
  const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
  return {
    friends: readProfiles(record.friends),
    incoming: readProfiles(record.incomingRequests),
    outgoing: readProfiles(record.outgoingRequests),
  }
}

export function parsePresence(data: unknown): Map<string, { status: MsPresenceStatus; lastUpdated?: string }> {
  const presence = new Map<string, { status: MsPresenceStatus; lastUpdated?: string }>()
  const list = data && typeof data === 'object' ? (data as Record<string, unknown>).presence : null
  if (!Array.isArray(list)) return presence
  for (const entry of list.slice(0, MAX_ENTRIES)) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const profileId = normalizeProfileId(record.profileId)
    const status = record.status
    if (!profileId || !MS_PRESENCE_STATUSES.includes(status as MsPresenceStatus)) continue
    presence.set(profileId, {
      status: status as MsPresenceStatus,
      lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : undefined,
    })
  }
  return presence
}

export function classifyFailure(error: unknown): MsFriendsError {
  if (!axios.isAxiosError(error)) return 'unavailable'
  const response = (error as AxiosError<{ details?: { status?: string } }>).response
  if (!response) return 'unavailable'
  switch (response.status) {
    case 400: {
      const status = response.data?.details?.status
      if (status === 'UNKNOWN_PROFILE') return 'unknown_profile'
      if (status === 'CANNOT_ADD_SELF') return 'cannot_add_self'
      return 'invalid'
    }
    case 401:
      return 'expired'
    case 403:
      return 'forbidden'
    case 429:
      return 'rate_limited'
    default:
      return 'unavailable'
  }
}

export function actionBody(action: MsFriendAction, target: { profileId?: string; name?: string }) {
  if (action === 'add' && target.name && isProfileName(target.name)) {
    return { name: target.name, updateType: 'ADD' }
  }
  const profileId = normalizeProfileId(target.profileId)
  if (!profileId) return null
  return { profileId, updateType: action === 'remove' ? 'REMOVE' : 'ADD' }
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function attachPresence(
  token: string,
  lists: ReturnType<typeof parseFriendsResponse>,
  announce: boolean,
): Promise<MsFriendsResult> {
  let presence = new Map<string, { status: MsPresenceStatus; lastUpdated?: string }>()
  if (announce && lists.friends.length > 0) {
    try {
      const response = await axios.post(
        PRESENCE_URL,
        { status: 'ONLINE' },
        { headers: headers(token), timeout: REQUEST_TIMEOUT_MS },
      )
      presence = parsePresence(response.data)
    } catch (error) {
      const failure = classifyFailure(error)
      if (failure === 'expired') return { ok: false, error: failure }
    }
  }
  return {
    ok: true,
    data: {
      friends: lists.friends.map((friend) => ({
        ...friend,
        status: presence.get(friend.profileId)?.status ?? (announce ? 'OFFLINE' : undefined),
        lastUpdated: presence.get(friend.profileId)?.lastUpdated,
      })),
      incoming: lists.incoming,
      outgoing: lists.outgoing,
      fetchedAt: new Date().toISOString(),
    },
  }
}

export async function fetchMsFriends(accountJwt: string, announce: boolean): Promise<MsFriendsResult> {
  const token = minecraftTokenOf(accountJwt)
  if (!token) return { ok: false, error: 'expired' }
  try {
    const response = await axios.get(FRIENDS_URL, {
      headers: headers(token),
      timeout: REQUEST_TIMEOUT_MS,
    })
    return await attachPresence(token, parseFriendsResponse(response.data), announce)
  } catch (error) {
    return { ok: false, error: classifyFailure(error) }
  }
}

export async function updateMsFriend(
  accountJwt: string,
  action: MsFriendAction,
  target: { profileId?: string; name?: string },
  announce: boolean,
): Promise<MsFriendsResult> {
  const token = minecraftTokenOf(accountJwt)
  if (!token) return { ok: false, error: 'expired' }
  const body = actionBody(action, target)
  if (!body) return { ok: false, error: 'invalid' }
  try {
    const response = await axios.put(FRIENDS_URL, body, {
      headers: headers(token),
      timeout: REQUEST_TIMEOUT_MS,
    })
    return await attachPresence(token, parseFriendsResponse(response.data), announce)
  } catch (error) {
    return { ok: false, error: classifyFailure(error) }
  }
}
