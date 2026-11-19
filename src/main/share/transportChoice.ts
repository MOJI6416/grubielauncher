import type { ShareTransport, ShareVisibility } from '@/types/Share'
import { McHandshake, NEXT_STATE_LOGIN, namesEqual } from './mcHandshake'

export const DIRECT_CONNECT_TIMEOUT_MS = 6000
export const DIRECT_RETRY_BASE_MS = 30_000
export const DIRECT_RETRY_MAX_MS = 5 * 60_000

const JOIN_HOST_PATTERN = /^(?:jt-([a-z0-9]{1,64})--)?([a-z0-9-]{3,48})\.join\.grubielauncher\.com(?::(\d{1,5}))?$/

export interface JoinHost {
  slug: string
  ticketId?: string
  host: string
  port: number
}

export function parseJoinHost(connectHost: string): JoinHost | null {
  const match = JOIN_HOST_PATTERN.exec(connectHost.trim().toLowerCase())
  if (!match) return null
  const port = match[3] ? Number(match[3]) : 25565
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null
  const host = connectHost.trim().toLowerCase().replace(/:\d{1,5}$/, '')
  return {
    slug: match[2],
    ticketId: match[1] || undefined,
    host,
    port,
  }
}

export interface DirectPolicy {
  directConnect: boolean
  streamerMode: boolean
}

export type GuestPlan =
  | { kind: 'direct'; join: JoinHost }
  | { kind: 'relay'; reason: 'disabled' | 'streamer' | 'public' | 'unknown_host' }

export function planGuestLink(policy: DirectPolicy, connectHost: string): GuestPlan {
  if (!policy.directConnect) return { kind: 'relay', reason: 'disabled' }
  if (policy.streamerMode) return { kind: 'relay', reason: 'streamer' }
  const join = parseJoinHost(connectHost)
  if (!join) return { kind: 'relay', reason: 'unknown_host' }
  if (!join.ticketId) return { kind: 'relay', reason: 'public' }
  return { kind: 'direct', join }
}

export type HostOfferDecision =
  | { accept: true }
  | { accept: false; reason: 'disabled' | 'streamer' | 'public' | 'stopped' }

export function decideHostOffer(
  policy: DirectPolicy,
  visibility: ShareVisibility | undefined,
  isSharing: boolean,
): HostOfferDecision {
  if (!isSharing) return { accept: false, reason: 'stopped' }
  if (!policy.directConnect) return { accept: false, reason: 'disabled' }
  if (policy.streamerMode) return { accept: false, reason: 'streamer' }
  if (visibility !== 'friends') return { accept: false, reason: 'public' }
  return { accept: true }
}

export function advertiseDirect(policy: DirectPolicy): boolean {
  return policy.directConnect && !policy.streamerMode
}

export type DirectLoginCheck =
  | { ok: true; statusPing: boolean; username?: string }
  | { ok: false; reason: 'no_name' | 'host_name' | 'wrong_name' }

export function checkDirectLogin(
  handshake: McHandshake,
  guestUsername: string | undefined,
  hostNickname: string | undefined,
): DirectLoginCheck {
  if (handshake.nextState !== NEXT_STATE_LOGIN) return { ok: true, statusPing: true }
  const name = handshake.username
  if (!name) return { ok: false, reason: 'no_name' }
  if (hostNickname && namesEqual(name, hostNickname)) return { ok: false, reason: 'host_name' }
  if (!guestUsername || !namesEqual(name, guestUsername)) {
    return { ok: false, reason: 'wrong_name' }
  }
  return { ok: true, statusPing: false, username: name }
}

export type PeerLinkState = 'new' | 'connecting' | 'connected' | 'failed' | 'closed'

export function routeGuestConnection(peer: PeerLinkState): 'direct' | 'relay' {
  return peer === 'connected' ? 'direct' : 'relay'
}

export function nextDirectRetryAt(
  failures: number,
  lastAttemptAtMs: number,
): number {
  if (failures <= 0) return lastAttemptAtMs
  const delay = Math.min(DIRECT_RETRY_MAX_MS, DIRECT_RETRY_BASE_MS * 2 ** (failures - 1))
  return lastAttemptAtMs + delay
}

export function shouldRetryDirect(
  peer: PeerLinkState,
  failures: number,
  lastAttemptAtMs: number,
  nowMs: number,
): boolean {
  if (peer === 'connected' || peer === 'connecting' || peer === 'new') return false
  return nowMs >= nextDirectRetryAt(failures, lastAttemptAtMs)
}

export interface CandidatePairStats {
  localCandidateType?: string
  remoteCandidateType?: string
}

export function classifyPath(pair: CandidatePairStats | null | undefined): ShareTransport {
  if (!pair) return 'direct'
  if (pair.localCandidateType === 'relay' || pair.remoteCandidateType === 'relay') {
    return 'turn'
  }
  return 'direct'
}

export function roundRtt(seconds: number | undefined | null): number | undefined {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return undefined
  }
  return Math.max(1, Math.round(seconds * 1000))
}
