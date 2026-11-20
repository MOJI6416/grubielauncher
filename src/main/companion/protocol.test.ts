import { describe, expect, it } from 'vitest'
import type { SharePeerInfo, ShareState } from '@/types/Share'
import {
  companionGuests,
  guestFromKey,
  hostMessageFor,
  parseInbound,
  sanitizeToasts,
  tokensMatch
} from './protocol'

function peer(overrides: Partial<SharePeerInfo>): SharePeerInfo {
  return {
    streamId: 1,
    peerIp: '1.2.3.4',
    peerPort: 1000,
    connectedAt: '2026-11-20T10:00:00.000Z',
    ...overrides
  }
}

function shareState(overrides: Partial<ShareState>): ShareState {
  return {
    phase: 'connected',
    candidate: null,
    target: null,
    isTunnelConnected: true,
    isAuthenticated: true,
    isHeartbeatActive: true,
    isDegraded: false,
    reconnectAttempt: 0,
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...overrides
  } as ShareState
}

describe('companion protocol', () => {
  it('reads only known messages', () => {
    expect(parseInbound('{"t":"hello","token":"abc","mod":"1.0.0","loader":"fabric"}')).toEqual({
      t: 'hello',
      token: 'abc',
      mod: '1.0.0',
      minecraft: '',
      loader: 'fabric'
    })
    expect(parseInbound('{"t":"accept","id":"gameInvite:1"}')).toEqual({ t: 'accept', id: 'gameInvite:1' })
    expect(parseInbound('{"t":"kick","key":"user:abc"}')).toEqual({ t: 'kick', key: 'user:abc' })
    expect(parseInbound('{"t":"accept"}')).toBeNull()
    expect(parseInbound('{"t":"run","cmd":"x"}')).toBeNull()
    expect(parseInbound('not json')).toBeNull()
    expect(parseInbound('[1,2]')).toBeNull()
  })

  it('compares tokens of any length safely', () => {
    expect(tokensMatch('abcdef', 'abcdef')).toBe(true)
    expect(tokensMatch('abcdef', 'abcdeg')).toBe(false)
    expect(tokensMatch('abcdef', 'abc')).toBe(false)
  })

  it('keeps toasts small and well formed', () => {
    const items = sanitizeToasts([
      { id: 'a', kind: 'invite', title: 'Kituk', body: 'line\nbreak', count: 2, actionable: true },
      { id: 'b', kind: 'weird', title: 'Alex' },
      { title: 'no id' },
      'junk',
      ...Array.from({ length: 20 }, (_, index) => ({ id: `x${index}`, title: 'T' }))
    ])
    expect(items).toHaveLength(8)
    expect(items[0]).toEqual({
      id: 'a',
      kind: 'invite',
      title: 'Kituk',
      body: 'line break',
      count: 2,
      actionable: true
    })
    expect(items[1]).toMatchObject({ kind: 'message', count: 1, actionable: false, body: '' })
    expect(sanitizeToasts('nope')).toEqual([])
  })

  it('groups peers into guests with the best transport', () => {
    const guests = companionGuests([
      peer({ streamId: 1, guestUserId: 'AA', guestUsername: 'Steve', transport: 'relay', connectedAt: '2026-11-20T10:05:00.000Z' }),
      peer({ streamId: 2, guestUserId: 'aa', transport: 'direct', connectedAt: '2026-11-20T10:06:00.000Z' }),
      peer({ streamId: 3, guestUsername: 'Alex', connectedAt: '2026-11-20T10:01:00.000Z' }),
      peer({ streamId: 4, connectedAt: '2026-11-20T10:10:00.000Z' })
    ])
    expect(guests).toEqual([
      { key: 'name:alex', name: 'Alex', transport: 'relay' },
      { key: 'user:aa', name: 'Steve', transport: 'direct' },
      { key: 'stream:4', name: '?', transport: 'relay' }
    ])
  })

  it('reports hosting only for the instance that shares', () => {
    const target = {
      key: 'k',
      versionName: 'Pack',
      instance: 0,
      localPort: 25565,
      detectedAt: '',
      isReachable: true
    }
    const peers = [peer({ guestUsername: 'Alex' })]
    const sharing = shareState({ sessionId: 's1', target })

    expect(hostMessageFor({ versionName: 'Pack', instance: 0 }, sharing, peers)).toEqual({
      t: 'host',
      active: true,
      kind: 'world',
      guests: [{ key: 'name:alex', name: 'Alex', transport: 'relay' }]
    })
    expect(hostMessageFor({ versionName: 'Other', instance: 0 }, sharing, peers)).toEqual({
      t: 'host',
      active: false
    })
    expect(
      hostMessageFor({ versionName: 'Pack', instance: 0 }, shareState({ target }), peers)
    ).toEqual({ t: 'host', active: false })
    expect(
      hostMessageFor(
        { versionName: 'Pack', instance: 0 },
        shareState({ sessionId: 's1', target: { ...target, kind: 'server' } }),
        []
      )
    ).toMatchObject({ active: true, kind: 'server', guests: [] })
  })

  it('turns a guest key back into a kick target', () => {
    const peers = [peer({ guestUserId: 'aa', guestUsername: 'Steve' })]
    expect(guestFromKey('user:aa', peers)).toEqual({
      userId: 'aa',
      username: 'Steve',
      nickname: 'Steve'
    })
    expect(guestFromKey('name:alex', peers)).toEqual({ username: 'alex' })
    expect(guestFromKey('user:bb', peers)).toEqual({ userId: 'bb' })
    expect(guestFromKey('stream:3', peers)).toBeNull()
  })
})
