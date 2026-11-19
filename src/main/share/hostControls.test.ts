import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import net from 'net'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import type { ShareHostState } from '@/types/Share'
import {
  applyHostPatch,
  countSeatedGuests,
  decideAdmission,
  HostControlsStore,
  hostControlsRequest,
  sanitizeHostControls,
} from './hostControls'
import { encodeLoginDisconnect, refusalComponent } from './loginDisconnect'
import { LocalProxyManager } from './LocalProxyManager'

const FRIEND = '64b7f0c2e1a4d9f3b2c10a55'
const OTHER = '64b7f0c2e1a4d9f3b2c10a56'

function host(overrides: Partial<ShareHostState> = {}): ShareHostState {
  return {
    inviteOnly: false,
    members: [],
    maxGuests: 0,
    removed: [],
    apiSynced: null,
    ...overrides,
  }
}

function readVarInt(buffer: Buffer, offset: number): [number, number] {
  let value = 0
  let shift = 0
  let index = offset
  for (;;) {
    const byte = buffer[index++]
    value |= (byte & 0x7f) << shift
    if ((byte & 0x80) === 0) return [value, index]
    shift += 7
  }
}

describe('guest admission', () => {
  it('never refuses a server-list ping', () => {
    expect(
      decideAdmission(
        { statusPing: true, username: 'Steve' },
        [],
        host({ removed: [{ username: 'steve', nickname: 'Steve' }] }),
        'friends',
      ),
    ).toBeNull()
  })

  it('keeps a removed guest out by account or by in-game name', () => {
    const removed = host({ removed: [{ userId: FRIEND, nickname: 'Friend' }, { username: 'Griefer', nickname: 'Griefer' }] })
    expect(decideAdmission({ statusPing: false, userId: FRIEND.toUpperCase() }, [], removed, 'friends')).toBe('removed')
    expect(decideAdmission({ statusPing: false, username: 'griefer' }, [], removed, 'public')).toBe('removed')
    expect(decideAdmission({ statusPing: false, userId: OTHER, username: 'Alex' }, [], removed, 'friends')).toBeNull()
  })

  it('lets only invited accounts into an invite-only share', () => {
    const invite = host({ inviteOnly: true, members: [{ userId: FRIEND, nickname: 'Friend' }] })
    expect(decideAdmission({ statusPing: false, userId: FRIEND }, [], invite, 'friends')).toBeNull()
    expect(decideAdmission({ statusPing: false, userId: OTHER }, [], invite, 'friends')).toBe('not_invited')
    expect(decideAdmission({ statusPing: false, username: 'Alex' }, [], invite, 'public')).toBeNull()
  })

  it('counts seats by guest, so a second connection of a seated guest still gets in', () => {
    const limited = host({ maxGuests: 2 })
    const seated = [{ userId: FRIEND }, { userId: FRIEND }, { username: 'Alex' }]
    expect(countSeatedGuests(seated)).toBe(2)
    expect(decideAdmission({ statusPing: false, userId: OTHER }, seated, limited, 'friends')).toBe('full')
    expect(decideAdmission({ statusPing: false, userId: FRIEND }, seated, limited, 'friends')).toBeNull()
    expect(decideAdmission({ statusPing: false, userId: OTHER }, seated.slice(0, 2), limited, 'friends')).toBeNull()
  })
})

describe('host controls', () => {
  it('sanitizes what is stored and what the renderer sends', () => {
    expect(
      sanitizeHostControls({
        inviteOnly: 'yes',
        maxGuests: 1000,
        members: [{ userId: FRIEND.toUpperCase(), nickname: 'A' }, { userId: FRIEND }, { userId: 'bad' }],
      }),
    ).toEqual({
      inviteOnly: false,
      maxGuests: 100,
      members: [{ userId: FRIEND, nickname: 'A' }],
    })
    expect(applyHostPatch(sanitizeHostControls(null), { inviteOnly: true, maxGuests: -3 })).toEqual({
      inviteOnly: true,
      members: [],
      maxGuests: 0,
    })
  })

  it('sends removed accounts but not removed names to the API', () => {
    expect(
      hostControlsRequest(
        host({
          inviteOnly: true,
          maxGuests: 3,
          members: [{ userId: FRIEND, nickname: 'A' }],
          removed: [{ userId: OTHER, nickname: 'B' }, { username: 'Griefer', nickname: 'Griefer' }],
        }),
      ),
    ).toEqual({
      inviteOnly: true,
      memberUserIds: [FRIEND],
      removedUserIds: [OTHER],
      maxGuests: 3,
    })
  })

  it('remembers the controls of each shared world and server', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grubie-hosts-'))
    try {
      const file = path.join(dir, 'share-hosts.json')
      const store = new HostControlsStore(() => file)
      await store.set('server:Survival', {
        inviteOnly: true,
        members: [{ userId: FRIEND, nickname: 'A' }],
        maxGuests: 4,
      })

      const reopened = new HostControlsStore(() => file)
      expect(await reopened.get('server:Survival')).toEqual({
        inviteOnly: true,
        members: [{ userId: FRIEND, nickname: 'A' }],
        maxGuests: 4,
      })
      expect(await reopened.get('world:Survival')).toEqual({ inviteOnly: false, members: [], maxGuests: 0 })
    } finally {
      await fs.remove(dir)
    }
  })
})

describe('login disconnect packet', () => {
  it('frames a login Disconnect with a two-language reason', () => {
    const packet = encodeLoginDisconnect('full')
    const [length, bodyStart] = readVarInt(packet, 0)
    expect(packet.length - bodyStart).toBe(length)
    expect(packet[bodyStart]).toBe(0x00)

    const [textLength, textStart] = readVarInt(packet, bodyStart + 1)
    const text = packet.subarray(textStart, textStart + textLength).toString('utf8')
    expect(text).toBe(refusalComponent('full'))
    const component = JSON.parse(text)
    expect(component.text).toMatch(/мест/)
    expect(component.extra[0].text).toMatch(/seats/)
  })
})

describe('LocalProxyManager admission', () => {
  let server: net.Server
  let manager: LocalProxyManager
  let controls: { type: string; streamId: number; reason?: string }[]
  let binary: { streamId: number; payload: Buffer }[]

  beforeEach(async () => {
    server = net.createServer((socket) => socket.on('error', () => undefined))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    controls = []
    binary = []
    manager = new LocalProxyManager()
    manager.setLocalPort((server.address() as net.AddressInfo).port)
    manager.setTransport({
      sendControl: (message) => controls.push(message),
      sendBinary: (streamId, payload) => binary.push({ streamId, payload }),
      isWritable: () => true,
      getBufferedAmount: () => 0,
    })
  })

  afterEach(async () => {
    manager.dispose('test_done')
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('answers a refused guest with the reason and closes the stream after it is delivered', async () => {
    const refused: string[] = []
    manager.onGuestRefused((event) => refused.push(`${event.username}:${event.reason}`))
    manager.setAdmission(() => 'full')

    await manager.openStream({
      type: 'OPEN_STREAM',
      streamId: 7,
      peerIp: '203.0.113.1',
      peerPort: 5000,
      initialDataBase64: '',
      guestUsername: 'Alex',
    })

    expect(controls[0]).toEqual({ type: 'STREAM_OPENED', streamId: 7 })
    expect(binary[0].streamId).toBe(7)
    expect(binary[0].payload.equals(encodeLoginDisconnect('full'))).toBe(true)
    expect(refused).toEqual(['Alex:full'])
    expect(manager.connectedGuests()).toEqual([])

    manager.handleStreamData(7, Buffer.from('ignored'))
    await new Promise((resolve) => setTimeout(resolve, 1700))
    expect(controls.at(-1)).toEqual({ type: 'CLOSE_STREAM', streamId: 7, reason: 'guest_full' })
  })

  it('closes every stream of a removed guest and keeps the others', async () => {
    const open = (streamId: number, guestUserId: string) =>
      manager.openStream({
        type: 'OPEN_STREAM',
        streamId,
        peerIp: '203.0.113.1',
        peerPort: 5000,
        initialDataBase64: '',
        guestUserId,
      })
    await open(1, FRIEND)
    await open(2, FRIEND)
    await open(3, OTHER)

    expect(manager.closeGuestStreams({ userId: FRIEND }, 'kicked_by_host')).toBe(2)
    expect(manager.connectedGuests()).toEqual([{ userId: OTHER, username: undefined }])
    expect(controls.filter((message) => message.type === 'CLOSE_STREAM')).toHaveLength(2)
  })

  it('hands the guest the last bytes the server sent before telling the gateway to close', async () => {
    const reply = Buffer.from('disconnect: not white-listed')
    const ending = net.createServer((socket) => {
      socket.on('error', () => undefined)
      socket.end(reply)
    })
    await new Promise<void>((resolve) => ending.listen(0, '127.0.0.1', resolve))
    manager.setLocalPort((ending.address() as net.AddressInfo).port)

    try {
      const order: string[] = []
      manager.setTransport({
        sendControl: (message) => order.push(message.type),
        sendBinary: (_streamId, payload) => order.push(`data:${payload.toString()}`),
        isWritable: () => true,
        getBufferedAmount: () => 0,
      })

      await manager.openStream({
        type: 'OPEN_STREAM',
        streamId: 9,
        peerIp: '203.0.113.1',
        peerPort: 5000,
        initialDataBase64: '',
        guestUsername: 'Alex',
      })

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(order).toEqual(['STREAM_OPENED', `data:${reply.toString()}`])

      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(order).toEqual(['STREAM_OPENED', `data:${reply.toString()}`, 'CLOSE_STREAM'])
    } finally {
      await new Promise<void>((resolve) => ending.close(() => resolve()))
    }
  })
})
