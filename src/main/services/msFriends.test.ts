import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import {
  actionBody,
  classifyFailure,
  minecraftTokenOf,
  parseFriendsResponse,
  parsePresence,
} from './msFriends'

const ID_A = '069a79f444e94726a5befca90e38aaf5'
const ID_B = '853c80ef3c3749fdaa49938b674adae6'

function jwt(payload: unknown): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode(payload)}.sig`
}

function httpError(status: number, data?: unknown): AxiosError {
  return new AxiosError('failed', String(status), undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data,
  })
}

describe('minecraftTokenOf', () => {
  it('takes the Minecraft token out of the account JWT', () => {
    expect(minecraftTokenOf(jwt({ auth: { accessToken: 'mc', expiresAt: 2000 } }), 1000)).toBe('mc')
  })

  it('refuses an expired or missing token instead of calling Microsoft with it', () => {
    expect(minecraftTokenOf(jwt({ auth: { accessToken: 'mc', expiresAt: 500 } }), 1000)).toBeNull()
    expect(minecraftTokenOf(jwt({ auth: { accessToken: '0' } }), 1000)).toBeNull()
    expect(minecraftTokenOf('not a jwt', 1000)).toBeNull()
  })
})

describe('parseFriendsResponse', () => {
  it('reads friends and both request lists, normalising dashed ids', () => {
    const parsed = parseFriendsResponse({
      friends: [{ profileId: '069a79f4-44e9-4726-a5be-fca90e38aaf5', name: 'Notch' }],
      incomingRequests: [{ profileId: ID_B, name: 'jeb_' }],
      outgoingRequests: [],
    })
    expect(parsed).toEqual({
      friends: [{ profileId: ID_A, name: 'Notch' }],
      incoming: [{ profileId: ID_B, name: 'jeb_' }],
      outgoing: [],
    })
  })

  it('drops malformed and duplicate entries', () => {
    const parsed = parseFriendsResponse({
      friends: [
        { profileId: ID_A, name: 'Notch' },
        { profileId: ID_A, name: 'Notch' },
        { profileId: 'xyz', name: 'Bad' },
        { profileId: ID_B, name: 'has space' },
        null,
      ],
    })
    expect(parsed.friends).toEqual([{ profileId: ID_A, name: 'Notch' }])
    expect(parsed.incoming).toEqual([])
  })
})

describe('parsePresence', () => {
  it('keeps only known statuses', () => {
    const presence = parsePresence({
      presence: [
        { profileId: ID_A, status: 'PLAYING_SERVER', lastUpdated: '2026-11-19T10:00:00Z' },
        { profileId: ID_B, status: 'DANCING' },
      ],
    })
    expect(presence.get(ID_A)).toEqual({ status: 'PLAYING_SERVER', lastUpdated: '2026-11-19T10:00:00Z' })
    expect(presence.has(ID_B)).toBe(false)
  })
})

describe('actionBody', () => {
  it('sends a new request by name', () => {
    expect(actionBody('add', { name: 'Notch' })).toEqual({ name: 'Notch', updateType: 'ADD' })
  })

  it('accepts and removes by profile id', () => {
    expect(actionBody('accept', { profileId: ID_A })).toEqual({ profileId: ID_A, updateType: 'ADD' })
    expect(actionBody('remove', { profileId: ID_B })).toEqual({ profileId: ID_B, updateType: 'REMOVE' })
  })

  it('refuses a request it cannot address', () => {
    expect(actionBody('remove', { name: 'Notch' })).toBeNull()
    expect(actionBody('add', { name: 'bad name' })).toBeNull()
  })
})

describe('classifyFailure', () => {
  it("maps Microsoft's answers to what the player is told", () => {
    expect(classifyFailure(httpError(400, { details: { status: 'UNKNOWN_PROFILE' } }))).toBe('unknown_profile')
    expect(classifyFailure(httpError(400, { details: { status: 'CANNOT_ADD_SELF' } }))).toBe('cannot_add_self')
    expect(classifyFailure(httpError(400))).toBe('invalid')
    expect(classifyFailure(httpError(401))).toBe('expired')
    expect(classifyFailure(httpError(403))).toBe('forbidden')
    expect(classifyFailure(httpError(429))).toBe('rate_limited')
    expect(classifyFailure(httpError(503))).toBe('unavailable')
    expect(classifyFailure(new Error('socket'))).toBe('unavailable')
  })
})
