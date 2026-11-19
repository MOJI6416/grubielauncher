import { describe, expect, it } from 'vitest'
import {
  DIRECT_RETRY_BASE_MS,
  DIRECT_RETRY_MAX_MS,
  advertiseDirect,
  checkDirectLogin,
  classifyPath,
  decideHostOffer,
  nextDirectRetryAt,
  parseJoinHost,
  planGuestLink,
  roundRtt,
  routeGuestConnection,
  shouldRetryDirect,
} from './transportChoice'
import { NEXT_STATE_LOGIN, NEXT_STATE_STATUS, type McHandshake } from './mcHandshake'

const TICKET_HOST = 'jt-9xk31f8m2a--grubie-ab12.join.grubielauncher.com'
const PUBLIC_HOST = 'grubie-ab12.join.grubielauncher.com'
const ON = { directConnect: true, streamerMode: false }

function login(username: string): McHandshake {
  return { protocolVersion: 774, hostname: '127.0.0.1', port: 25565, nextState: NEXT_STATE_LOGIN, username, length: 40 }
}

describe('parseJoinHost', () => {
  it('reads the ticket and slug of an invite address', () => {
    expect(parseJoinHost(TICKET_HOST)).toEqual({
      slug: 'grubie-ab12',
      ticketId: '9xk31f8m2a',
      host: TICKET_HOST,
      port: 25565,
    })
  })

  it('keeps an explicit port and drops it from the host', () => {
    expect(parseJoinHost(`${TICKET_HOST}:25570`)).toMatchObject({ host: TICKET_HOST, port: 25570 })
  })

  it('treats a public address as ticketless', () => {
    expect(parseJoinHost(PUBLIC_HOST)).toMatchObject({ slug: 'grubie-ab12', ticketId: undefined })
  })

  it('refuses anything outside the join domain', () => {
    expect(parseJoinHost('play.example.com')).toBeNull()
    expect(parseJoinHost('jt-x--grubie-ab12.join.grubielauncher.com.evil.net')).toBeNull()
  })
})

describe('guest transport plan', () => {
  it('tries the direct path for an invite address', () => {
    expect(planGuestLink(ON, TICKET_HOST)).toMatchObject({ kind: 'direct' })
  })

  it('stays on the relay when the player turned direct connections off', () => {
    expect(planGuestLink({ ...ON, directConnect: false }, TICKET_HOST)).toEqual({
      kind: 'relay',
      reason: 'disabled',
    })
  })

  it('stays on the relay in streamer mode, so the guest IP never reaches the host', () => {
    expect(planGuestLink({ ...ON, streamerMode: true }, TICKET_HOST)).toEqual({
      kind: 'relay',
      reason: 'streamer',
    })
  })

  it('stays on the relay for a public world, where nobody is vouched for', () => {
    expect(planGuestLink(ON, PUBLIC_HOST)).toEqual({ kind: 'relay', reason: 'public' })
  })

  it('stays on the relay for an address it cannot read', () => {
    expect(planGuestLink(ON, 'mc.hypixel.net')).toEqual({ kind: 'relay', reason: 'unknown_host' })
  })
})

describe('host offer decision', () => {
  it('answers a friends-only share', () => {
    expect(decideHostOffer(ON, 'friends', true)).toEqual({ accept: true })
  })

  it('declines a public share: strangers must not learn the host IP', () => {
    expect(decideHostOffer(ON, 'public', true)).toEqual({ accept: false, reason: 'public' })
  })

  it('declines when sharing already stopped', () => {
    expect(decideHostOffer(ON, 'friends', false)).toEqual({ accept: false, reason: 'stopped' })
  })

  it('declines in streamer mode and when turned off', () => {
    expect(decideHostOffer({ ...ON, streamerMode: true }, 'friends', true)).toMatchObject({ reason: 'streamer' })
    expect(decideHostOffer({ ...ON, directConnect: false }, 'friends', true)).toMatchObject({ reason: 'disabled' })
  })

  it('advertises rtc to the gateway only when it would answer', () => {
    expect(advertiseDirect(ON)).toBe(true)
    expect(advertiseDirect({ ...ON, streamerMode: true })).toBe(false)
    expect(advertiseDirect({ ...ON, directConnect: false })).toBe(false)
  })
})

describe('login over a direct channel', () => {
  it('lets the ticket holder in under their own name, whatever the case', () => {
    expect(checkDirectLogin(login('friendone'), 'FriendOne', 'HostOne')).toEqual({
      ok: true,
      statusPing: false,
      username: 'friendone',
    })
  })

  it('refuses another name than the ticket was issued to', () => {
    expect(checkDirectLogin(login('SomebodyElse'), 'FriendOne', 'HostOne')).toEqual({
      ok: false,
      reason: 'wrong_name',
    })
  })

  it("refuses the host's own name", () => {
    expect(checkDirectLogin(login('HostOne'), 'HostOne', 'HostOne')).toEqual({
      ok: false,
      reason: 'host_name',
    })
  })

  it('refuses a login without a name', () => {
    expect(checkDirectLogin(login(''), 'FriendOne', 'HostOne')).toEqual({ ok: false, reason: 'no_name' })
  })

  it('refuses a login when the gateway vouched for nobody', () => {
    expect(checkDirectLogin(login('FriendOne'), undefined, 'HostOne')).toMatchObject({ ok: false })
  })

  it('lets a server-list ping through without a name', () => {
    const status = { ...login(''), nextState: NEXT_STATE_STATUS }
    expect(checkDirectLogin(status, 'FriendOne', 'HostOne')).toEqual({ ok: true, statusPing: true })
  })
})

describe('per-connection routing and retries', () => {
  it('sends a game connection over the direct link only while it is up', () => {
    expect(routeGuestConnection('connected')).toBe('direct')
    for (const state of ['new', 'connecting', 'failed', 'closed'] as const) {
      expect(routeGuestConnection(state)).toBe('relay')
    }
  })

  it('backs off between direct attempts and caps the wait', () => {
    expect(nextDirectRetryAt(1, 1000)).toBe(1000 + DIRECT_RETRY_BASE_MS)
    expect(nextDirectRetryAt(2, 1000)).toBe(1000 + 2 * DIRECT_RETRY_BASE_MS)
    expect(nextDirectRetryAt(20, 1000)).toBe(1000 + DIRECT_RETRY_MAX_MS)
  })

  it('retries a failed link only after the back-off and never while one is up', () => {
    expect(shouldRetryDirect('failed', 1, 0, DIRECT_RETRY_BASE_MS - 1)).toBe(false)
    expect(shouldRetryDirect('failed', 1, 0, DIRECT_RETRY_BASE_MS)).toBe(true)
    expect(shouldRetryDirect('connected', 1, 0, 10 * DIRECT_RETRY_MAX_MS)).toBe(false)
    expect(shouldRetryDirect('connecting', 1, 0, 10 * DIRECT_RETRY_MAX_MS)).toBe(false)
  })
})

describe('path shown to the player', () => {
  it('calls a pair through the TURN server "turn" on either side', () => {
    expect(classifyPath({ localCandidateType: 'relay', remoteCandidateType: 'srflx' })).toBe('turn')
    expect(classifyPath({ localCandidateType: 'host', remoteCandidateType: 'relay' })).toBe('turn')
  })

  it('calls host, reflexive and peer-reflexive pairs direct', () => {
    expect(classifyPath({ localCandidateType: 'srflx', remoteCandidateType: 'prflx' })).toBe('direct')
    expect(classifyPath({ localCandidateType: 'host', remoteCandidateType: 'host' })).toBe('direct')
  })

  it('turns the stats RTT into whole milliseconds', () => {
    expect(roundRtt(0.0234)).toBe(23)
    expect(roundRtt(0.0001)).toBe(1)
    expect(roundRtt(undefined)).toBeUndefined()
    expect(roundRtt(-1)).toBeUndefined()
  })
})
