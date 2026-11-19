import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import net from 'net'
import tls from 'tls'
import {
  encodeFrame,
  websocketAccept,
  WsFrameDecoder,
  WsMessageAssembler,
  WsOpcode,
} from './wsFrame'

export interface WsConnectOptions {
  url: string
  headers?: Record<string, string>
  fingerprint256?: string
  timeoutMs?: number
}

export class WsHandshakeError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'WsHandshakeError'
  }
}

const MAX_HANDSHAKE_BYTES = 16 * 1024

export function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-f0-9]/gi, '').toUpperCase()
}

export class WsConnection extends EventEmitter {
  private readonly decoder = new WsFrameDecoder()
  private readonly assembler = new WsMessageAssembler()
  private closed = false

  constructor(private readonly socket: net.Socket) {
    super()
    socket.on('data', (chunk: Buffer) => this.handleData(chunk))
    socket.on('error', (error) => {
      if (this.listenerCount('error') > 0) this.emit('error', error)
    })
    socket.on('close', () => this.finish(1006, ''))
  }

  get isOpen(): boolean {
    return !this.closed && !this.socket.destroyed
  }

  feed(chunk: Buffer): void {
    if (chunk.length > 0) this.handleData(chunk)
  }

  send(text: string): void {
    if (!this.isOpen) throw new Error('WebSocket is closed')
    this.socket.write(encodeFrame(WsOpcode.Text, Buffer.from(text, 'utf8'), true))
  }

  close(code = 1000): void {
    if (!this.isOpen) return
    const payload = Buffer.alloc(2)
    payload.writeUInt16BE(code, 0)
    try {
      this.socket.write(encodeFrame(WsOpcode.Close, payload, true))
    } catch {}
    this.socket.end()
    setTimeout(() => this.socket.destroy(), 1000).unref()
    this.finish(code, '')
  }

  private handleData(chunk: Buffer): void {
    let frames
    try {
      frames = this.decoder.push(chunk)
    } catch (error) {
      if (this.listenerCount('error') > 0) this.emit('error', error)
      this.socket.destroy()
      return
    }

    for (const frame of frames) {
      const message = this.assembler.accept(frame)
      if (!message) continue

      switch (message.opcode) {
        case WsOpcode.Text:
          this.emit('message', message.data.toString('utf8'))
          break
        case WsOpcode.Ping:
          if (this.isOpen) {
            this.socket.write(encodeFrame(WsOpcode.Pong, message.data, true))
          }
          break
        case WsOpcode.Close: {
          const code = message.data.length >= 2 ? message.data.readUInt16BE(0) : 1005
          const reason = message.data.length > 2 ? message.data.subarray(2).toString('utf8') : ''
          if (this.isOpen) {
            try {
              this.socket.write(encodeFrame(WsOpcode.Close, message.data.subarray(0, 2), true))
            } catch {}
            this.socket.end()
          }
          this.finish(code, reason)
          break
        }
        default:
          break
      }
    }
  }

  private finish(code: number, reason: string): void {
    if (this.closed) return
    this.closed = true
    this.emit('close', code, reason)
  }
}

function openSocket(
  url: URL,
  fingerprint256: string | undefined,
): Promise<net.Socket> {
  const port = Number(url.port || (url.protocol === 'wss:' ? 443 : 80))
  const host = url.hostname.replace(/^\[|\]$/g, '')

  return new Promise((resolve, reject) => {
    if (url.protocol === 'ws:') {
      const socket = net.connect({ host, port })
      socket.once('connect', () => resolve(socket))
      socket.once('error', reject)
      return
    }

    const socket = tls.connect({
      host,
      port,
      rejectUnauthorized: false,
      servername: net.isIP(host) ? undefined : host,
    })
    socket.once('secureConnect', () => {
      if (fingerprint256) {
        const presented = socket.getPeerCertificate()?.fingerprint256 || ''
        if (normalizeFingerprint(presented) !== normalizeFingerprint(fingerprint256)) {
          socket.destroy()
          reject(new WsHandshakeError('TLS certificate does not match the pinned fingerprint'))
          return
        }
      }
      resolve(socket)
    })
    socket.once('error', reject)
  })
}

export async function connectWebSocket(options: WsConnectOptions): Promise<WsConnection> {
  const url = new URL(options.url)
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new WsHandshakeError(`Unsupported WebSocket scheme ${url.protocol}`)
  }

  const timeoutMs = options.timeoutMs ?? 5000
  let socket: net.Socket | null = null
  let timer: NodeJS.Timeout | null = null

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      socket?.destroy()
      reject(new WsHandshakeError('WebSocket handshake timed out'))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      (async () => {
        socket = await openSocket(url, options.fingerprint256)
        return await upgrade(socket, url, options.headers ?? {})
      })(),
      timeout,
    ])
  } catch (error) {
    ;(socket as net.Socket | null)?.destroy()
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function upgrade(
  socket: net.Socket,
  url: URL,
  headers: Record<string, string>,
): Promise<WsConnection> {
  const key = randomBytes(16).toString('base64')
  const lines = [
    `GET ${url.pathname || '/'}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
  ]
  for (const [name, value] of Object.entries(headers)) {
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) continue
    lines.push(`${name}: ${value}`)
  }

  socket.on('error', () => undefined)

  return new Promise((resolve, reject) => {
    let received = Buffer.alloc(0)

    const cleanup = () => {
      socket.off('data', onData)
      socket.off('error', onError)
      socket.off('close', onClose)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onClose = () => {
      cleanup()
      reject(new WsHandshakeError('Connection closed during the WebSocket handshake'))
    }
    const onData = (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])
      const end = received.indexOf('\r\n\r\n')
      if (end < 0) {
        if (received.length > MAX_HANDSHAKE_BYTES) {
          cleanup()
          socket.destroy()
          reject(new WsHandshakeError('WebSocket handshake response is too large'))
        }
        return
      }

      cleanup()
      const head = received.subarray(0, end).toString('latin1')
      const rest = received.subarray(end + 4)
      const [statusLine, ...headerLines] = head.split('\r\n')
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(statusLine)?.[1] ?? 0)
      if (status !== 101) {
        socket.destroy()
        reject(new WsHandshakeError(`WebSocket upgrade refused with HTTP ${status}`, status))
        return
      }

      const responseHeaders = new Map<string, string>()
      for (const line of headerLines) {
        const index = line.indexOf(':')
        if (index <= 0) continue
        responseHeaders.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim())
      }
      if (responseHeaders.get('sec-websocket-accept') !== websocketAccept(key)) {
        socket.destroy()
        reject(new WsHandshakeError('WebSocket upgrade returned a wrong accept key'))
        return
      }

      const connection = new WsConnection(socket)
      resolve(connection)
      if (rest.length > 0) setImmediate(() => connection.feed(rest))
    }

    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('close', onClose)
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
  })
}
