import { timingSafeEqual } from 'crypto'
import type { SharePeerInfo, ShareState, ShareTransport } from '@/types/Share'
import type {
  CompanionFriend,
  CompanionFriendStatus,
  CompanionFriends,
  CompanionToast,
  CompanionToastKind,
  CompanionVoice,
  CompanionVoiceMember
} from '@/shared/companion'

export const COMPANION_MAX_LINE = 1024 * 1024
export const COMPANION_WIRE_PROTOCOL = 2
export const COMPANION_MAX_TOASTS = 8

export type CompanionInbound =
  | {
      t: 'hello'
      token: string
      mod: string
      minecraft: string
      loader: string
      protocol: number
      features: string[]
    }
  | { t: 'accept'; id: string }
  | { t: 'decline'; id: string }
  | { t: 'kick'; key: string }
  | { t: 'invite'; req: string; friend: string; server?: { address: string; name: string } }
  | { t: 'join'; req: string; friend: string }
  | { t: 'share'; req: string; action: 'start'; port: number; visibility: string; world: string }
  | { t: 'share'; req: string; action: 'stop' }
  | { t: 'voice'; action: 'mute' | 'unmute' | 'deafen' | 'undeafen' }
  | { t: 'ptt'; down: boolean }
  | { t: 'sendScreenshot'; req: string; path: string; friend: string }
  | { t: 'stats'; kind: 'server' | 'world'; key: string; name: string; snapshot: Record<string, unknown> }
  | { t: 'stage'; stage: string; detail?: string }
  | { t: 'hang'; seconds: number; stage: string; thread: string; frames: string[]; mods: string[] }

export interface CompanionGuest {
  key: string
  name: string
  transport: ShareTransport
  ping?: number
}

export interface CompanionHostMessage {
  t: 'host'
  active: boolean
  kind?: string
  title?: string
  code?: string
  visibility?: string
  max?: number
  guests?: CompanionGuest[]
  invited?: string[]
}

const TOAST_KINDS: CompanionToastKind[] = [
  'message',
  'invite',
  'call',
  'achievement',
  'screenshot',
  'system'
]
const FRIEND_STATUSES: CompanionFriendStatus[] = ['online', 'away', 'busy', 'playing']
const VOICE_ACTIONS = ['mute', 'unmute', 'deafen', 'undeafen'] as const
const STAGE_RE = /^[a-z][a-z-]{0,31}$/
const REQ_RE = /^[A-Za-z0-9:_.-]{1,64}$/
const TRANSPORT_RANK: Record<ShareTransport, number> = { direct: 0, turn: 1, relay: 2 }

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
}

function req(value: unknown): string | null {
  return typeof value === 'string' && REQ_RE.test(value) ? value : null
}

function strings(value: unknown, limit: number, length: number): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (result.length >= limit) break
    const entry = text(item, length)
    if (entry) result.push(entry)
  }
  return result
}

export function parseInbound(line: string): CompanionInbound | null {
  if (line.length > COMPANION_MAX_LINE) return null
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>

  switch (record.t) {
    case 'hello': {
      const token = text(record.token, 256)
      if (!token) return null
      const protocol = Number(record.protocol)
      return {
        t: 'hello',
        token,
        mod: text(record.mod, 32) ?? '',
        minecraft: text(record.minecraft, 32) ?? '',
        loader: text(record.loader, 16) ?? '',
        protocol: Number.isInteger(protocol) && protocol > 0 ? protocol : 1,
        features: strings(record.features, 32, 32)
      }
    }
    case 'accept':
    case 'decline': {
      const id = text(record.id, 200)
      return id ? { t: record.t, id } : null
    }
    case 'kick': {
      const key = text(record.key, 200)
      return key ? { t: 'kick', key } : null
    }
    case 'invite': {
      const id = req(record.req)
      const friend = text(record.friend, 64)
      if (!id || !friend) return null
      const server = record.server
      if (server && typeof server === 'object' && !Array.isArray(server)) {
        const target = server as Record<string, unknown>
        const address = text(target.address, 255)
        if (!address) return null
        return {
          t: 'invite',
          req: id,
          friend,
          server: { address, name: text(target.name, 64) ?? address }
        }
      }
      return { t: 'invite', req: id, friend }
    }
    case 'join': {
      const id = req(record.req)
      const friend = text(record.friend, 64)
      return id && friend ? { t: 'join', req: id, friend } : null
    }
    case 'share': {
      const id = req(record.req)
      if (!id) return null
      if (record.action === 'stop') return { t: 'share', req: id, action: 'stop' }
      const port = Number(record.port)
      if (record.action !== 'start' || !Number.isInteger(port) || port <= 0 || port > 65535) {
        return null
      }
      return {
        t: 'share',
        req: id,
        action: 'start',
        port,
        visibility: text(record.visibility, 16) ?? 'friends',
        world: text(record.world, 120) ?? ''
      }
    }
    case 'voice': {
      const action = VOICE_ACTIONS.find((candidate) => candidate === record.action)
      return action ? { t: 'voice', action } : null
    }
    case 'ptt':
      return typeof record.down === 'boolean' ? { t: 'ptt', down: record.down } : null
    case 'sendScreenshot': {
      const id = req(record.req)
      const path =
        typeof record.path === 'string' && record.path.length > 0 && record.path.length <= 4096
          ? record.path
          : null
      const friend = text(record.friend, 64)
      return id && path && friend ? { t: 'sendScreenshot', req: id, path, friend } : null
    }
    case 'stats': {
      const kind = record.kind === 'server' || record.kind === 'world' ? record.kind : null
      const key = text(record.key, 255)
      const snapshot = record.snapshot
      if (!kind || !key || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        return null
      }
      return {
        t: 'stats',
        kind,
        key,
        name: text(record.name, 120) ?? key,
        snapshot: snapshot as Record<string, unknown>
      }
    }
    case 'stage': {
      const stage =
        typeof record.stage === 'string' && STAGE_RE.test(record.stage) ? record.stage : null
      if (!stage) return null
      const detail = text(record.detail, 120)
      return detail ? { t: 'stage', stage, detail } : { t: 'stage', stage }
    }
    case 'hang': {
      const seconds = Number(record.seconds)
      if (!Number.isFinite(seconds) || seconds < 0) return null
      return {
        t: 'hang',
        seconds: Math.round(seconds),
        stage:
          typeof record.stage === 'string' && STAGE_RE.test(record.stage) ? record.stage : 'unknown',
        thread: text(record.thread, 120) ?? '',
        frames: strings(record.frames, 40, 400),
        mods: strings(record.mods, 40, 160)
      }
    }
    default:
      return null
  }
}

export function tokensMatch(expected: string, given: string): boolean {
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(given, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function sanitizeToasts(items: unknown): CompanionToast[] {
  if (!Array.isArray(items)) return []
  const result: CompanionToast[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object' || result.length >= COMPANION_MAX_TOASTS) continue
    const record = item as Record<string, unknown>
    const id = text(record.id, 200)
    const title = text(record.title, 300)
    if (!id || !title) continue
    const kind = TOAST_KINDS.includes(record.kind as CompanionToastKind)
      ? (record.kind as CompanionToastKind)
      : 'message'
    const count = Number(record.count)
    const toast: CompanionToast = {
      id,
      kind,
      title,
      body: text(record.body, 300) ?? '',
      count: Number.isInteger(count) && count > 0 ? count : 1,
      actionable: record.actionable === true
    }
    const meta = text(record.meta, 120)
    if (meta) toast.meta = meta
    const avatar = text(record.avatar, 128)
    if (avatar) toast.avatar = avatar
    result.push(toast)
  }
  return result
}

function avatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

export function sanitizeFriends(value: unknown): CompanionFriends {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const online: CompanionFriend[] = []
  if (Array.isArray(record.online)) {
    for (const item of record.online) {
      if (!item || typeof item !== 'object' || online.length >= 200) continue
      const friend = item as Record<string, unknown>
      const id = text(friend.id, 64)
      const name = text(friend.name, 64)
      if (!id || !name) continue
      const status = FRIEND_STATUSES.includes(friend.status as CompanionFriendStatus)
        ? (friend.status as CompanionFriendStatus)
        : 'online'
      const entry: CompanionFriend = { id, name, status, joinable: friend.joinable === true }
      const activity = text(friend.activity, 120)
      if (activity) entry.activity = activity
      const url = avatarUrl(friend.avatarUrl)
      if (url) entry.avatarUrl = url
      online.push(entry)
    }
  }
  const offline = Number(record.offline)
  return { online, offline: Number.isInteger(offline) && offline > 0 ? offline : 0 }
}

export function sanitizeVoice(value: unknown): CompanionVoice {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  if (record.active !== true) {
    return { active: false, muted: false, deafened: false, ptt: false, members: [] }
  }
  const members: CompanionVoiceMember[] = []
  if (Array.isArray(record.members)) {
    for (const item of record.members) {
      if (!item || typeof item !== 'object' || members.length >= 64) continue
      const member = item as Record<string, unknown>
      const id = text(member.id, 64)
      const name = text(member.name, 64)
      if (!id || !name) continue
      const entry: CompanionVoiceMember = {
        id,
        name,
        speaking: member.speaking === true,
        muted: member.muted === true
      }
      const url = avatarUrl(member.avatarUrl)
      if (url) entry.avatarUrl = url
      members.push(entry)
    }
  }
  const voice: CompanionVoice = {
    active: true,
    muted: record.muted === true,
    deafened: record.deafened === true,
    ptt: record.ptt === true,
    members
  }
  const channel = text(record.channel, 120)
  if (channel) voice.channel = channel
  const key = text(record.pttKey, 32)
  if (key) voice.pttKey = key
  const code = Number(record.pttCode)
  if (Number.isInteger(code) && code > 0 && code < 512) voice.pttCode = code
  return voice
}

export function guestKeyOf(peer: SharePeerInfo): string {
  if (peer.guestUserId) return `user:${peer.guestUserId.toLowerCase()}`
  if (peer.guestUsername) return `name:${peer.guestUsername.toLowerCase()}`
  return `stream:${peer.streamId}`
}

export function companionGuests(peers: SharePeerInfo[]): CompanionGuest[] {
  const rows = new Map<string, CompanionGuest & { since: number }>()
  for (const peer of peers) {
    const key = guestKeyOf(peer)
    const transport = peer.transport ?? 'relay'
    const since = Date.parse(peer.connectedAt)
    const ping =
      typeof peer.rttMs === 'number' && Number.isFinite(peer.rttMs) ? Math.round(peer.rttMs) : undefined
    const existing = rows.get(key)
    if (!existing) {
      rows.set(key, {
        key,
        name: peer.guestUsername || '?',
        transport,
        ...(ping === undefined ? {} : { ping }),
        since: Number.isNaN(since) ? Number.MAX_SAFE_INTEGER : since
      })
      continue
    }
    if (existing.name === '?' && peer.guestUsername) existing.name = peer.guestUsername
    if (TRANSPORT_RANK[transport] < TRANSPORT_RANK[existing.transport]) {
      existing.transport = transport
      if (ping !== undefined) existing.ping = ping
    }
    if (!Number.isNaN(since) && since < existing.since) existing.since = since
  }
  return [...rows.values()]
    .sort((a, b) => a.since - b.since)
    .map(({ since: _since, ...guest }) => guest)
}

export function hostMessageFor(
  session: { versionName: string; instance: number },
  state: ShareState,
  peers: SharePeerInfo[]
): CompanionHostMessage {
  const target = state.target
  const hosting =
    Boolean(state.sessionId) &&
    !!target &&
    target.versionName === session.versionName &&
    target.instance === session.instance
  if (!hosting || !target) return { t: 'host', active: false }
  const guests = companionGuests(peers)
  const connected = new Set(guests.map((guest) => guest.name.toLowerCase()))
  const host = state.host
  const invited = (host?.members ?? [])
    .map((member) => member.nickname)
    .filter((name): name is string => Boolean(name) && !connected.has(name.toLowerCase()))
    .slice(0, 16)
  const message: CompanionHostMessage = {
    t: 'host',
    active: true,
    kind: target.kind === 'server' ? 'server' : 'world',
    visibility: host?.inviteOnly ? 'invite' : state.visibility,
    guests
  }
  if (host && host.maxGuests > 0) message.max = host.maxGuests
  if (invited.length > 0) message.invited = invited
  return message
}

export function guestFromKey(
  key: string,
  peers: SharePeerInfo[]
): { userId?: string; username?: string; nickname?: string } | null {
  const match = peers.find((peer) => guestKeyOf(peer) === key)
  if (match && (match.guestUserId || match.guestUsername)) {
    return {
      userId: match.guestUserId,
      username: match.guestUsername,
      nickname: match.guestUsername
    }
  }
  if (key.startsWith('user:')) return { userId: key.slice(5) }
  if (key.startsWith('name:')) return { username: key.slice(5) }
  return null
}
