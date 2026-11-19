import { afterEach, describe, expect, it } from 'vitest'
import { MsmpClient, MsmpError, msmpUrl } from './msmpClient'
import { WsHandshakeError } from './wsClient'
import { encodeFrame, WsFrameDecoder, WsMessageAssembler, WsOpcode } from './wsFrame'
import {
  FakeMsmpServer,
  FakeRpcError,
  selfSignedCertificate,
  startFakeMsmp,
} from './fakeMsmp.testutil'

const SECRET = 'A'.repeat(20) + 'b'.repeat(10) + '0123456789'

describe('WebSocket frames', () => {
  it('round-trips masked frames of every length class', () => {
    for (const size of [0, 5, 125, 126, 70000]) {
      const payload = Buffer.alloc(size, 7)
      const decoder = new WsFrameDecoder()
      const frames = decoder.push(encodeFrame(WsOpcode.Text, payload, true))
      expect(frames).toHaveLength(1)
      expect(frames[0].fin).toBe(true)
      expect(frames[0].opcode).toBe(WsOpcode.Text)
      expect(frames[0].payload.equals(payload)).toBe(true)
    }
  })

  it('waits for a frame split across chunks and joins continuation frames', () => {
    const decoder = new WsFrameDecoder()
    const assembler = new WsMessageAssembler()
    const first = encodeFrame(WsOpcode.Text, Buffer.from('{"a":'), false)
    first[0] &= 0x7f
    const second = encodeFrame(WsOpcode.Continuation, Buffer.from('1}'), false)
    const wire = Buffer.concat([first, second])

    const messages: string[] = []
    for (let index = 0; index < wire.length; index += 3) {
      for (const frame of decoder.push(wire.subarray(index, index + 3))) {
        const message = assembler.accept(frame)
        if (message) messages.push(message.data.toString())
      }
    }
    expect(messages).toEqual(['{"a":1}'])
  })

  it('refuses a frame larger than the payload cap', () => {
    const decoder = new WsFrameDecoder(10)
    expect(() => decoder.push(encodeFrame(WsOpcode.Text, Buffer.alloc(11), false))).toThrow()
  })
})

describe('MsmpClient', () => {
  let server: FakeMsmpServer | null = null
  let client: MsmpClient | null = null

  afterEach(async () => {
    client?.close()
    client = null
    await server?.close()
    server = null
  })

  it('builds ws and wss addresses for the management port', () => {
    expect(msmpUrl({ host: '127.0.0.1', port: 25585, tls: false })).toBe('ws://127.0.0.1:25585')
    expect(msmpUrl({ host: '::1', port: 1, tls: true })).toBe('wss://[::1]:1')
  })

  it('authenticates with the bearer secret and the allowed origin, then calls methods', async () => {
    server = await startFakeMsmp({
      secret: SECRET,
      origin: 'grubie-launcher',
      handle: (request) =>
        request.method === 'minecraft:players' ? [{ id: 'u-1', name: 'Steve' }] : true,
    })

    client = await MsmpClient.connect({
      host: '127.0.0.1',
      port: server.port,
      secret: SECRET,
      tls: false,
    })

    await expect(client.call('minecraft:players')).resolves.toEqual([
      { id: 'u-1', name: 'Steve' },
    ])
    await client.call('minecraft:allowlist/add', [[{ name: 'Alex' }]])

    expect(server.headers[0].authorization).toBe(`Bearer ${SECRET}`)
    expect(server.headers[0].origin).toBe('grubie-launcher')
    expect(server.requests.map((request) => request.method)).toEqual([
      'minecraft:players',
      'minecraft:allowlist/add',
    ])
    expect(server.requests[1].params).toEqual([[{ name: 'Alex' }]])
    expect(server.requests[0]).not.toHaveProperty('params')
  })

  it('reports a wrong secret as an HTTP 401 handshake refusal', async () => {
    server = await startFakeMsmp({ secret: SECRET })

    const error = await MsmpClient.connect({
      host: '127.0.0.1',
      port: server.port,
      secret: 'B'.repeat(40),
      tls: false,
    }).catch((caught) => caught)

    expect(error).toBeInstanceOf(WsHandshakeError)
    expect(error.status).toBe(401)
  })

  it('turns a JSON-RPC error into an MsmpError with its code', async () => {
    server = await startFakeMsmp({
      secret: SECRET,
      handle: () => {
        throw new FakeRpcError(-32601, 'Method not found')
      },
    })
    client = await MsmpClient.connect({ host: '127.0.0.1', port: server.port, secret: SECRET, tls: false })

    const error = await client.call('minecraft:foo/bar').catch((caught: MsmpError) => caught)
    expect(error).toBeInstanceOf(MsmpError)
    expect((error as MsmpError).code).toBe(-32601)
  })

  it('emits server notifications', async () => {
    server = await startFakeMsmp({ secret: SECRET })
    client = await MsmpClient.connect({ host: '127.0.0.1', port: server.port, secret: SECRET, tls: false })

    const received = new Promise<[string, unknown]>((resolve) =>
      client!.once('notification', (method: string, params: unknown) => resolve([method, params])),
    )
    server.notify('minecraft:notification/players/joined', [{ id: 'u-2', name: 'Alex' }])

    await expect(received).resolves.toEqual([
      'minecraft:notification/players/joined',
      [{ id: 'u-2', name: 'Alex' }],
    ])
  })

  it('fails pending calls when the connection drops', async () => {
    server = await startFakeMsmp({
      secret: SECRET,
      handle: () => {
        server!.dropClients()
        return null
      },
    })
    client = await MsmpClient.connect({ host: '127.0.0.1', port: server.port, secret: SECRET, tls: false })

    await expect(client.call('minecraft:server/status')).rejects.toBeInstanceOf(MsmpError)
    expect(client.isOpen).toBe(false)
  })

  it('connects over TLS only to the pinned self-signed certificate', async () => {
    const tls = selfSignedCertificate()
    server = await startFakeMsmp({ secret: SECRET, tls, handle: () => 'ok' })

    client = await MsmpClient.connect({
      host: '127.0.0.1',
      port: server.port,
      secret: SECRET,
      tls: true,
      fingerprint256: tls.fingerprint256,
    })
    await expect(client.call('rpc.discover')).resolves.toBe('ok')
    client.close()
    client = null

    const other = selfSignedCertificate()
    await expect(
      MsmpClient.connect({
        host: '127.0.0.1',
        port: server.port,
        secret: SECRET,
        tls: true,
        fingerprint256: other.fingerprint256,
      }),
    ).rejects.toThrow(/pinned fingerprint/)
  })
})
