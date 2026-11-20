import { timingSafeEqual } from 'crypto'
import type { SharePeerInfo, ShareState, ShareTransport } from '@/types/Share'
import type { CompanionToast, CompanionToastKind } from '@/shared/companion'

export const COMPANION_PROTOCOL = 1
export const COMPANION_MAX_LINE = 64 * 1024
export const COMPANION_MAX_TOASTS = 8

export type CompanionInbound =
  | { t: 'hello'; token: string; mod: string; minecraft: string; loader: string }
  | { t: 'accept'; id: string }
  | { t: 'kick'; key: string }

export interface CompanionGuest {
  key: string
  name: string
  transport: ShareTransport
}

export interface CompanionHostMessage {
  t: 'host'
  active: boolean
  kind?: string
  guests?: CompanionGuest[]
}

const TOAST_KINDS: CompanionToastKind[] = ['message', 'invite', 'call']
const TRANSPORT_RANK: Record<ShareTransport, number> = { direct: 0, turn: 1, relay: 2 }

function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed
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
      return {
        t: 'hello',
        token,
        mod: text(record.mod, 32) ?? '',
        minecraft: text(record.minecraft, 32) ?? '',
        loader: text(record.loader, 16) ?? ''
      }
    }
    case 'accept': {
      const id = text(record.id, 200)
      return id ? { t: 'accept', id } : null
    }
    case 'kick': {
      const key = text(record.key, 200)
      return key ? { t: 'kick', key } : null
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
    result.push({
      id,
      kind,
      title,
      body: text(record.body, 300) ?? '',
      count: Number.isInteger(count) && count > 0 ? count : 1,
      actionable: record.actionable === true
    })
  }
  return result
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
    const existing = rows.get(key)
    if (!existing) {
      rows.set(key, {
        key,
        name: peer.guestUsername || '?',
        transport,
        since: Number.isNaN(since) ? Number.MAX_SAFE_INTEGER : since
      })
      continue
    }
    if (existing.name === '?' && peer.guestUsername) existing.name = peer.guestUsername
    if (TRANSPORT_RANK[transport] < TRANSPORT_RANK[existing.transport]) {
      existing.transport = transport
    }
    if (!Number.isNaN(since) && since < existing.since) existing.since = since
  }
  return [...rows.values()]
    .sort((a, b) => a.since - b.since)
    .map(({ key, name, transport }) => ({ key, name, transport }))
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
  return {
    t: 'host',
    active: true,
    kind: target.kind === 'server' ? 'server' : 'world',
    guests: companionGuests(peers)
  }
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
