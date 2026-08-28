import net from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildHandshakePacket,
  buildPingPacket,
  buildStatusRequestPacket,
  hasExplicitPort,
  parseAddress,
  parseStatusResponse,
  pickSrvRecord,
  pingServer,
  readVarInt,
  writeVarInt
} from './serverPing'

describe('varint', () => {
  it('encodes the values from the protocol spec', () => {
    expect([...writeVarInt(0)]).toEqual([0x00])
    expect([...writeVarInt(1)]).toEqual([0x01])
    expect([...writeVarInt(127)]).toEqual([0x7f])
    expect([...writeVarInt(128)]).toEqual([0x80, 0x01])
    expect([...writeVarInt(255)]).toEqual([0xff, 0x01])
    expect([...writeVarInt(25565)]).toEqual([0xdd, 0xc7, 0x01])
  })

  it('round-trips through the reader', () => {
    for (const value of [0, 1, 127, 128, 300, 25565, 2097151]) {
      const buffer = writeVarInt(value)
      expect(readVarInt(buffer)).toEqual({ value, size: buffer.length })
    }
  })

  it('reads from an offset', () => {
    const buffer = Buffer.concat([writeVarInt(5), writeVarInt(300)])
    expect(readVarInt(buffer, 1)).toEqual({ value: 300, size: 2 })
  })

  it('returns null when the value is cut off', () => {
    expect(readVarInt(Buffer.from([0x80]))).toBeNull()
    expect(readVarInt(Buffer.alloc(0))).toBeNull()
  })
})

describe('parseAddress', () => {
  it('defaults to the vanilla port', () => {
    expect(parseAddress('play.example.net')).toEqual({
      host: 'play.example.net',
      port: 25565
    })
  })

  it('keeps an explicit port', () => {
    expect(parseAddress('play.example.net:25566')).toEqual({
      host: 'play.example.net',
      port: 25566
    })
  })

  it('strips a scheme and surrounding spaces', () => {
    expect(parseAddress('  tcp://play.example.net:25567 ')).toEqual({
      host: 'play.example.net',
      port: 25567
    })
  })

  it('understands bracketed ipv6', () => {
    expect(parseAddress('[::1]:25568')).toEqual({ host: '::1', port: 25568 })
    expect(parseAddress('[::1]')).toEqual({ host: '::1', port: 25565 })
  })

  it('falls back to the default port for a broken port', () => {
    expect(parseAddress('play.example.net:abc')).toEqual({
      host: 'play.example.net',
      port: 25565
    })
  })
})

describe('handshake packets', () => {
  it('prefixes the payload with its length', () => {
    const packet = buildHandshakePacket('play.example.net', 25565)
    const length = readVarInt(packet)

    expect(length).not.toBeNull()
    expect(packet.length).toBe(length!.size + length!.value)
  })

  it('carries the host and port', () => {
    const packet = buildHandshakePacket('play.example.net', 25565)

    expect(packet.includes(Buffer.from('play.example.net'))).toBe(true)
    expect(packet.includes(Buffer.from([0x63, 0xdd]))).toBe(true)
  })

  it('asks for status, not login', () => {
    const packet = buildHandshakePacket('host', 25565)
    expect(packet[packet.length - 1]).toBe(0x01)
  })

  it('builds a minimal status request', () => {
    expect([...buildStatusRequestPacket()]).toEqual([0x01, 0x00])
  })

  it('builds a ping packet with an eight byte payload', () => {
    const packet = buildPingPacket(Buffer.alloc(8))

    expect(packet.length).toBe(10)
    expect(packet[0]).toBe(0x09)
    expect(packet[1]).toBe(0x01)
  })
})

describe('hasExplicitPort', () => {
  it('detects a written port', () => {
    expect(hasExplicitPort('play.example.net:25566')).toBe(true)
    expect(hasExplicitPort('  tcp://play.example.net:25566 ')).toBe(true)
    expect(hasExplicitPort('[::1]:25566')).toBe(true)
  })

  it('reports a bare host', () => {
    expect(hasExplicitPort('play.example.net')).toBe(false)
    expect(hasExplicitPort('[::1]')).toBe(false)
    expect(hasExplicitPort('play.example.net:abc')).toBe(false)
  })
})

describe('pickSrvRecord', () => {
  it('prefers the lowest priority, then the highest weight', () => {
    expect(
      pickSrvRecord([
        { name: 'b.example.net', port: 3, priority: 10, weight: 1 },
        { name: 'a.example.net.', port: 1, priority: 0, weight: 5 },
        { name: 'c.example.net', port: 2, priority: 0, weight: 50 }
      ])
    ).toEqual({ host: 'c.example.net', port: 2 })
  })

  it('drops empty records', () => {
    expect(pickSrvRecord([])).toBeNull()
    expect(
      pickSrvRecord([{ name: '', port: 0, priority: 0, weight: 0 }])
    ).toBeNull()
  })
})

describe('parseStatusResponse', () => {
  it('reads players, version and plain description', () => {
    const result = parseStatusResponse(
      JSON.stringify({
        players: { online: 12, max: 100 },
        version: { name: '1.21.1' },
        description: 'Welcome home'
      })
    )

    expect(result.online).toBe(true)
    expect(result.players).toEqual({ online: 12, max: 100 })
    expect(result.versionName).toBe('1.21.1')
    expect(result.motd).toBe('Welcome home')
  })

  it('joins a component description and strips colour codes', () => {
    const result = parseStatusResponse(
      JSON.stringify({
        description: { text: '§aHello ', extra: [{ text: '§bworld' }] }
      })
    )

    expect(result.motd).toBe('Hello world')
  })

  it('survives a missing players block', () => {
    const result = parseStatusResponse(JSON.stringify({ version: {} }))

    expect(result.online).toBe(true)
    expect(result.players).toBeUndefined()
  })

  it('keeps the raw description for the renderer', () => {
    const description = { text: '§aHello', extra: [{ text: ' world' }] }
    const result = parseStatusResponse(JSON.stringify({ description }))

    expect(result.descriptionRaw).toBe(JSON.stringify(description))
  })

  it('carries the protocol and the player sample', () => {
    const result = parseStatusResponse(
      JSON.stringify({
        version: { name: 'NeoForge 1.21.1', protocol: 767 },
        players: {
          online: 2,
          max: 20,
          sample: [{ name: 'moji', id: 'x' }, { name: 'kit' }, { id: 'no' }]
        }
      })
    )

    expect(result.protocol).toBe(767)
    expect(result.players?.sample).toEqual([
      { name: 'moji', id: 'x' },
      { name: 'kit', id: undefined }
    ])
  })

  it('marks a modded server and an unsigned chat server', () => {
    const forge = parseStatusResponse(
      JSON.stringify({ forgeData: { fmlNetworkVersion: 3 } })
    )
    const legacy = parseStatusResponse(
      JSON.stringify({ modinfo: { type: 'FML', modList: [] } })
    )
    const plain = parseStatusResponse(
      JSON.stringify({ enforcesSecureChat: false })
    )

    expect(forge.modded).toBe(true)
    expect(legacy.modded).toBe(true)
    expect(plain.modded).toBeUndefined()
    expect(plain.secureChat).toBe(false)
  })

  it('reports a broken payload instead of throwing', () => {
    expect(parseStatusResponse('not json')).toEqual({
      online: false,
      error: 'bad_response'
    })
  })
})

describe('pingServer against a real socket', () => {
  const servers: net.Server[] = []
  const sockets: net.Socket[] = []
  const timers: NodeJS.Timeout[] = []

  afterEach(async () => {
    for (const timer of timers.splice(0)) clearInterval(timer)
    for (const socket of sockets.splice(0)) socket.destroy()
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve()))
      )
    )
  })

  function listen(onConnection: (socket: net.Socket) => void): Promise<number> {
    return new Promise((resolve) => {
      const server = net.createServer((socket) => {
        sockets.push(socket)
        socket.on('error', () => {})
        onConnection(socket)
      })
      servers.push(server)
      server.listen(0, '127.0.0.1', () =>
        resolve((server.address() as net.AddressInfo).port)
      )
    })
  }

  it('settles when the server hangs up without answering', async () => {
    const port = await listen((socket) => socket.end())

    const result = await Promise.race([
      pingServer(`127.0.0.1:${port}`, 10000),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000))
    ])

    expect(result).toEqual({ online: false, error: 'bad_response' })
  })

  it('gives up on a server that trickles bytes to keep the socket busy', async () => {
    const port = await listen((socket) => {
      socket.write(writeVarInt(100000))
      const timer = setInterval(() => socket.write(Buffer.from([0x41])), 40)
      timers.push(timer)
      socket.on('close', () => clearInterval(timer))
    })

    const result = await Promise.race([
      pingServer(`127.0.0.1:${port}`, 500),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 5000))
    ])

    expect(result).toEqual({ online: false, error: 'timeout' })
  })

  it('gives up on a server that streams a packet it promised but never sends', async () => {
    const port = await listen((socket) => {
      socket.write(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x07]))
      const filler = Buffer.alloc(64 * 1024)
      const timer = setInterval(() => {
        if (!socket.write(filler)) return
      }, 1)
      socket.on('close', () => clearInterval(timer))
      socket.on('error', () => clearInterval(timer))
    })

    const result = await Promise.race([
      pingServer(`127.0.0.1:${port}`, 10000),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 5000))
    ])

    expect(result).toEqual({ online: false, error: 'bad_response' })
  })
})
