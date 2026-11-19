import { describe, expect, it } from 'vitest'
import {
  NEXT_STATE_LOGIN,
  NEXT_STATE_STATUS,
  encodeVarInt,
  readHandshake,
  rewriteHandshakeHost,
} from './mcHandshake'

function packet(id: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat([encodeVarInt(id), ...parts])
  return Buffer.concat([encodeVarInt(body.length), body])
}

function text(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  return Buffer.concat([encodeVarInt(bytes.length), bytes])
}

function port(value: number): Buffer {
  const bytes = Buffer.alloc(2)
  bytes.writeUInt16BE(value)
  return bytes
}

function handshake(host: string, nextState: number, protocol = 774): Buffer {
  return packet(0, encodeVarInt(protocol), text(host), port(25565), encodeVarInt(nextState))
}

function loginStart(name: string): Buffer {
  return packet(0, text(name), Buffer.alloc(16, 7))
}

describe('readHandshake', () => {
  it('reads a status ping from the first packet', () => {
    const read = readHandshake(handshake('127.0.0.1', NEXT_STATE_STATUS))
    expect(read).toMatchObject({
      status: 'ok',
      handshake: { hostname: '127.0.0.1', nextState: NEXT_STATE_STATUS, username: '' },
    })
  })

  it('waits for Login Start and reads the name from it', () => {
    const first = handshake('127.0.0.1', NEXT_STATE_LOGIN)
    expect(readHandshake(first).status).toBe('need_more')

    const both = Buffer.concat([first, loginStart('FriendOne')])
    const read = readHandshake(both)
    expect(read).toMatchObject({ status: 'ok', handshake: { username: 'FriendOne', length: both.length } })
  })

  it('waits while a packet is only partly there', () => {
    const whole = Buffer.concat([handshake('127.0.0.1', NEXT_STATE_LOGIN), loginStart('FriendOne')])
    for (let cut = 1; cut < whole.length; cut += 1) {
      expect(readHandshake(whole.subarray(0, cut)).status).toBe('need_more')
    }
  })

  it('refuses anything that is not a handshake', () => {
    expect(readHandshake(packet(5, text('x'))).status).toBe('invalid')
  })

  it('refuses an oversized first packet instead of buffering it', () => {
    const big = Buffer.concat([encodeVarInt(10_000), Buffer.alloc(16)])
    expect(readHandshake(big).status).toBe('invalid')
  })

  it('gives an empty name for a Login Start it cannot read', () => {
    const both = Buffer.concat([handshake('127.0.0.1', NEXT_STATE_LOGIN), packet(0, text('bad name!'))])
    expect(readHandshake(both)).toMatchObject({ status: 'ok', handshake: { username: '' } })
  })
})

describe('rewriteHandshakeHost', () => {
  const TICKET_HOST = 'jt-9xk31f8m2a--grubie-ab12.join.grubielauncher.com'

  it('points the handshake at the relay and keeps every following byte', () => {
    const tail = loginStart('FriendOne')
    const original = Buffer.concat([handshake('127.0.0.1', NEXT_STATE_LOGIN), tail])

    const rewritten = rewriteHandshakeHost(original, TICKET_HOST, 25565)
    expect(rewritten).not.toBeNull()
    const read = readHandshake(rewritten as Buffer)
    expect(read).toMatchObject({
      status: 'ok',
      handshake: { hostname: TICKET_HOST, protocolVersion: 774, username: 'FriendOne' },
    })
    expect((rewritten as Buffer).subarray((rewritten as Buffer).length - tail.length)).toEqual(tail)
  })

  it("keeps Forge's marker after the host name", () => {
    const original = handshake('127.0.0.1\0FML3\0', NEXT_STATE_LOGIN)
    const read = readHandshake(Buffer.concat([rewriteHandshakeHost(original, TICKET_HOST, 25565) as Buffer, loginStart('A')]))
    expect(read).toMatchObject({ status: 'ok', handshake: { hostname: `${TICKET_HOST}\0FML3\0` } })
  })

  it('waits for the whole first packet', () => {
    const original = handshake('127.0.0.1', NEXT_STATE_STATUS)
    expect(rewriteHandshakeHost(original.subarray(0, 5), TICKET_HOST, 25565)).toBeNull()
  })
})
