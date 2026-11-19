import { createSign, generateKeyPairSync, X509Certificate } from 'crypto'
import http from 'http'
import https from 'https'
import type net from 'net'
import { encodeFrame, websocketAccept, WsFrameDecoder, WsMessageAssembler, WsOpcode } from './wsFrame'

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length])
  const bytes: number[] = []
  let rest = length
  while (rest > 0) {
    bytes.unshift(rest & 0xff)
    rest >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

const seq = (...items: Buffer[]) => tlv(0x30, Buffer.concat(items))

function oid(value: string): Buffer {
  const parts = value.split('.').map(Number)
  const bytes = [parts[0] * 40 + parts[1]]
  for (const part of parts.slice(2)) {
    const chunk: number[] = [part & 0x7f]
    let rest = part >> 7
    while (rest > 0) {
      chunk.unshift((rest & 0x7f) | 0x80)
      rest >>= 7
    }
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}

function utcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, '0')
  const text =
    pad(date.getUTCFullYear() % 100) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  return tlv(0x17, Buffer.from(text, 'ascii'))
}

export function selfSignedCertificate(): { cert: string; key: string; fingerprint256: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const algorithm = seq(oid('1.2.840.113549.1.1.11'), Buffer.from([0x05, 0x00]))
  const name = seq(tlv(0x31, seq(oid('2.5.4.3'), tlv(0x0c, Buffer.from('localhost')))))
  const now = Date.now()
  const tbs = seq(
    tlv(0x02, Buffer.from([0x01])),
    algorithm,
    name,
    seq(utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 365 * 86_400_000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  )
  const signer = createSign('sha256')
  signer.update(tbs)
  const signature = signer.sign(privateKey)
  const der = seq(tbs, algorithm, tlv(0x03, Buffer.concat([Buffer.from([0x00]), signature])))
  const body = der.toString('base64').replace(/(.{64})/g, '$1\n').trimEnd()
  const cert = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`
  return {
    cert,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    fingerprint256: new X509Certificate(cert).fingerprint256,
  }
}

export interface FakeMsmpRequest {
  method: string
  params: unknown
  id: number
}

export interface FakeMsmpOptions {
  secret: string
  origin?: string
  tls?: { cert: string; key: string }
  handle?: (request: FakeMsmpRequest) => unknown
}

export interface FakeMsmpServer {
  port: number
  requests: FakeMsmpRequest[]
  headers: http.IncomingHttpHeaders[]
  notify: (method: string, params: unknown) => void
  dropClients: () => void
  close: () => Promise<void>
}

export class FakeRpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

export async function startFakeMsmp(options: FakeMsmpOptions): Promise<FakeMsmpServer> {
  const server = options.tls
    ? https.createServer({ cert: options.tls.cert, key: options.tls.key })
    : http.createServer()
  const sockets = new Set<net.Socket>()
  const requests: FakeMsmpRequest[] = []
  const headers: http.IncomingHttpHeaders[] = []

  server.on('request', (_req, res) => {
    res.statusCode = 426
    res.end()
  })

  server.on('upgrade', (req, socket: net.Socket) => {
    headers.push(req.headers)
    const authorized = req.headers.authorization === `Bearer ${options.secret}`
    const originOk = !options.origin || req.headers.origin === options.origin
    if (!authorized || !originOk) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n')
      return
    }

    const key = String(req.headers['sec-websocket-key'] ?? '')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${websocketAccept(key)}\r\n\r\n`,
    )
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => undefined)

    const decoder = new WsFrameDecoder()
    const assembler = new WsMessageAssembler()
    socket.on('data', (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) {
        const message = assembler.accept(frame)
        if (!message) continue
        if (message.opcode === WsOpcode.Close) {
          socket.end(encodeFrame(WsOpcode.Close, message.data.subarray(0, 2), false))
          continue
        }
        if (message.opcode !== WsOpcode.Text) continue

        const request = JSON.parse(message.data.toString('utf8')) as FakeMsmpRequest
        requests.push(request)
        let reply: Record<string, unknown>
        try {
          const result = options.handle ? options.handle(request) : null
          reply = { jsonrpc: '2.0', id: request.id, result: result ?? null }
        } catch (error) {
          const code = error instanceof FakeRpcError ? error.code : -32603
          reply = {
            jsonrpc: '2.0',
            id: request.id,
            error: { code, message: error instanceof Error ? error.message : String(error) },
          }
        }
        socket.write(encodeFrame(WsOpcode.Text, Buffer.from(JSON.stringify(reply)), false))
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port

  return {
    port,
    requests,
    headers,
    notify: (method, params) => {
      const payload = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method, params }))
      for (const socket of sockets) socket.write(encodeFrame(WsOpcode.Text, payload, false))
    },
    dropClients: () => {
      for (const socket of sockets) socket.destroy()
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
