import fs from 'fs-extra'
import { writeJsonAtomic } from '../utilities/atomicJson'
import type {
  ShareGuestRef,
  ShareHostControls,
  ShareHostPatch,
  ShareHostState,
  ShareMember,
  ShareRemovedGuest,
  ShareVisibility,
} from '@/types/Share'
import type { GuestRefusal } from './loginDisconnect'

export const SHARE_MEMBERS_LIMIT = 200
export const SHARE_MAX_GUESTS_LIMIT = 100

const USER_ID_PATTERN = /^[a-f0-9]{24}$/i

export const DEFAULT_HOST_CONTROLS: ShareHostControls = {
  inviteOnly: false,
  members: [],
  maxGuests: 0,
}

export interface AdmissionRequest extends ShareGuestRef {
  statusPing: boolean
}

function sanitizeMember(value: unknown): ShareMember | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const userId = typeof record.userId === 'string' ? record.userId.toLowerCase() : ''
  if (!USER_ID_PATTERN.test(userId)) return null
  const nickname =
    typeof record.nickname === 'string' ? record.nickname.slice(0, 64) : ''
  return { userId, nickname }
}

export function sanitizeHostControls(value: unknown): ShareHostControls {
  if (!value || typeof value !== 'object') return { ...DEFAULT_HOST_CONTROLS, members: [] }
  const record = value as Record<string, unknown>
  const members: ShareMember[] = []
  const seen = new Set<string>()
  if (Array.isArray(record.members)) {
    for (const entry of record.members) {
      const member = sanitizeMember(entry)
      if (!member || seen.has(member.userId)) continue
      seen.add(member.userId)
      members.push(member)
      if (members.length >= SHARE_MEMBERS_LIMIT) break
    }
  }
  const rawMax = Number(record.maxGuests)
  const maxGuests =
    Number.isInteger(rawMax) && rawMax > 0
      ? Math.min(rawMax, SHARE_MAX_GUESTS_LIMIT)
      : 0
  return {
    inviteOnly: record.inviteOnly === true,
    members,
    maxGuests,
  }
}

export function applyHostPatch(
  current: ShareHostControls,
  patch: ShareHostPatch,
): ShareHostControls {
  return sanitizeHostControls({
    inviteOnly: patch.inviteOnly ?? current.inviteOnly,
    members: patch.members ?? current.members,
    maxGuests: patch.maxGuests ?? current.maxGuests,
  })
}

export function guestKey(guest: ShareGuestRef): string | null {
  if (guest.userId) return `user:${guest.userId.toLowerCase()}`
  if (guest.username) return `name:${guest.username.toLowerCase()}`
  return null
}

export function isSameGuest(a: ShareGuestRef, b: ShareGuestRef): boolean {
  if (a.userId && b.userId) return a.userId.toLowerCase() === b.userId.toLowerCase()
  if (a.username && b.username) {
    return a.username.toLowerCase() === b.username.toLowerCase()
  }
  return false
}

export function isRemovedGuest(
  guest: ShareGuestRef,
  removed: ShareRemovedGuest[],
): boolean {
  return removed.some((entry) => isSameGuest(guest, entry))
}

export function countSeatedGuests(
  connected: ShareGuestRef[],
  except?: ShareGuestRef,
): number {
  const keys = new Set<string>()
  const exceptKey = except ? guestKey(except) : null
  for (const guest of connected) {
    if (except && isSameGuest(guest, except)) continue
    const key = guestKey(guest)
    if (key && key === exceptKey) continue
    keys.add(key ?? `anonymous:${keys.size}`)
  }
  return keys.size
}

export function decideAdmission(
  request: AdmissionRequest,
  connected: ShareGuestRef[],
  host: Pick<ShareHostState, 'inviteOnly' | 'members' | 'maxGuests' | 'removed'>,
  visibility: ShareVisibility | undefined,
): GuestRefusal | null {
  if (request.statusPing) return null
  if (isRemovedGuest(request, host.removed)) return 'removed'

  if (host.inviteOnly && visibility !== 'public' && request.userId) {
    const userId = request.userId.toLowerCase()
    if (!host.members.some((member) => member.userId === userId)) {
      return 'not_invited'
    }
  }

  if (host.maxGuests > 0) {
    if (connected.some((guest) => isSameGuest(guest, request))) return null
    if (countSeatedGuests(connected) >= host.maxGuests) return 'full'
  }

  return null
}

export function hostControlsRequest(host: ShareHostState) {
  return {
    inviteOnly: host.inviteOnly,
    memberUserIds: host.members.map((member) => member.userId),
    removedUserIds: host.removed
      .map((entry) => entry.userId?.toLowerCase())
      .filter((userId): userId is string => !!userId && USER_ID_PATTERN.test(userId)),
    maxGuests: host.maxGuests,
  }
}

export class HostControlsStore {
  private cache: Record<string, ShareHostControls> | null = null

  constructor(private readonly filePath: () => string) {}

  private async load(): Promise<Record<string, ShareHostControls>> {
    if (this.cache) return this.cache
    const raw = await fs.readJSON(this.filePath()).catch(() => null)
    const next: Record<string, ShareHostControls> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof key !== 'string' || key.length > 512) continue
        next[key] = sanitizeHostControls(value)
      }
    }
    this.cache = next
    return next
  }

  async get(key: string): Promise<ShareHostControls> {
    const all = await this.load()
    return sanitizeHostControls(all[key])
  }

  async set(key: string, controls: ShareHostControls): Promise<void> {
    const all = await this.load()
    all[key] = sanitizeHostControls(controls)
    await writeJsonAtomic(this.filePath(), all).catch((error) => {
      console.error('[share:host] could not save host controls:', error)
    })
  }
}
