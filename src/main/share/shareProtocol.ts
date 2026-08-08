import net from 'net'

export const SHARE_STREAM_FRAME_VERSION = 1
export const SHARE_STREAM_FRAME_TYPE_DATA = 1
export const SHARE_WS_PATH = '/ws'
export const SHARE_TUNNEL_URL = 'wss://tunnel.grubielauncher.com/ws'
export const SHARE_JOIN_DOMAIN_SUFFIX = '.join.grubielauncher.com'
export const SHARE_HANDSHAKE_PROTOCOL_VERSION = 2
export const SHARE_GATEWAY_HOST_SUFFIX = 'grubielauncher.com'
export const MAX_INITIAL_DATA_BASE64_LENGTH = 64 * 1024
const GUEST_USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const GUEST_USERNAME_PATTERN = /^[\x21-\x7E]{1,16}$/

export interface AuthMessage {
  type: 'AUTH'
  token: string
  protocolVersion?: number
}

export interface AuthOkMessage {
  type: 'AUTH_OK'
  connectionId: string
  sessionId: string
  slug: string
  protocolVersion?: number
  minSupportedVersion?: number
}

export interface PingMessage {
  type: 'PING'
  ts: number
}

export interface PongMessage {
  type: 'PONG'
  ts: number
}

export interface OpenStreamMessage {
  type: 'OPEN_STREAM'
  streamId: number
  peerIp: string
  peerPort: number
  initialDataBase64: string
  guestUserId?: string
  guestUsername?: string
}

export interface StreamOpenedMessage {
  type: 'STREAM_OPENED'
  streamId: number
}

export interface CloseStreamMessage {
  type: 'CLOSE_STREAM'
  streamId: number
  reason: string
}

export interface ErrorMessage {
  type: 'ERROR'
  code: string
  message: string
}

export type TunnelControlMessage =
  | AuthMessage
  | AuthOkMessage
  | PingMessage
  | PongMessage
  | OpenStreamMessage
  | StreamOpenedMessage
  | CloseStreamMessage
  | ErrorMessage

export interface StreamDataFrame {
  version: number
  frameType: number
  streamId: number
  payload: Buffer
}

export function encodeStreamDataFrame(streamId: number, payload: Buffer | Uint8Array): Buffer {
  if (!Number.isInteger(streamId) || streamId < 0) {
    throw new Error(`Invalid streamId: ${streamId}`)
  }

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  const frame = Buffer.allocUnsafe(10 + body.length)

  frame.writeUInt8(SHARE_STREAM_FRAME_VERSION, 0)
  frame.writeUInt8(SHARE_STREAM_FRAME_TYPE_DATA, 1)
  frame.writeBigUInt64BE(BigInt(streamId), 2)
  body.copy(frame, 10)

  return frame
}

export function decodeStreamDataFrame(data: ArrayBuffer | Buffer | Uint8Array): StreamDataFrame {
  const buffer = toBuffer(data)

  if (buffer.length < 10) {
    throw new Error('STREAM_DATA frame is too short')
  }

  const version = buffer.readUInt8(0)
  const frameType = buffer.readUInt8(1)

  if (version !== SHARE_STREAM_FRAME_VERSION) {
    throw new Error(`Unsupported frame version: ${version}`)
  }

  if (frameType !== SHARE_STREAM_FRAME_TYPE_DATA) {
    throw new Error(`Unsupported frame type: ${frameType}`)
  }

  const streamIdBig = buffer.readBigUInt64BE(2)
  const streamId = Number(streamIdBig)

  if (!Number.isSafeInteger(streamId)) {
    throw new Error(`streamId exceeds Number.MAX_SAFE_INTEGER: ${streamIdBig}`)
  }

  return {
    version,
    frameType,
    streamId,
    payload: buffer.subarray(10),
  }
}

function invalidField(field: string): Error {
  return new Error(`Invalid control message field: ${field}`)
}

function readString(source: Record<string, unknown>, field: string): string {
  const value = source[field]
  if (typeof value !== 'string') throw invalidField(field)
  return value
}

function readStreamId(source: Record<string, unknown>): number {
  const value = source.streamId
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidField('streamId')
  }
  return value
}

function readTimestamp(source: Record<string, unknown>): number {
  const value = source.ts
  if (typeof value !== 'number' || !Number.isFinite(value)) throw invalidField('ts')
  return value
}

function readOptionalVersion(
  source: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = source[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidField(field)
  }
  return value
}

function readOptionalPattern(
  source: Record<string, unknown>,
  field: string,
  pattern: RegExp,
): string | undefined {
  const value = source[field]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || !pattern.test(value)) throw invalidField(field)
  return value
}

export function parseTunnelControlMessage(raw: string): TunnelControlMessage {
  const parsed = JSON.parse(raw) as unknown

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid control message payload')
  }

  const source = parsed as Record<string, unknown>
  const type = source.type

  switch (type) {
    case 'AUTH':
      return {
        type,
        token: readString(source, 'token'),
        protocolVersion: readOptionalVersion(source, 'protocolVersion'),
      }
    case 'AUTH_OK':
      return {
        type,
        connectionId: readString(source, 'connectionId'),
        sessionId: readString(source, 'sessionId'),
        slug: readString(source, 'slug'),
        protocolVersion: readOptionalVersion(source, 'protocolVersion'),
        minSupportedVersion: readOptionalVersion(source, 'minSupportedVersion'),
      }
    case 'PING':
    case 'PONG':
      return {
        type,
        ts: readTimestamp(source),
      }
    case 'OPEN_STREAM': {
      const peerIp = readString(source, 'peerIp')
      if (net.isIP(peerIp) === 0) throw invalidField('peerIp')

      const peerPort = source.peerPort
      if (
        typeof peerPort !== 'number' ||
        !Number.isSafeInteger(peerPort) ||
        peerPort < 1 ||
        peerPort > 65535
      ) {
        throw invalidField('peerPort')
      }

      const initialDataBase64 = readString(source, 'initialDataBase64')
      if (initialDataBase64.length > MAX_INITIAL_DATA_BASE64_LENGTH) {
        throw invalidField('initialDataBase64')
      }

      return {
        type,
        streamId: readStreamId(source),
        peerIp,
        peerPort,
        initialDataBase64,
        guestUserId: readOptionalPattern(source, 'guestUserId', GUEST_USER_ID_PATTERN),
        guestUsername: readOptionalPattern(source, 'guestUsername', GUEST_USERNAME_PATTERN),
      }
    }
    case 'STREAM_OPENED':
      return {
        type,
        streamId: readStreamId(source),
      }
    case 'CLOSE_STREAM':
      return {
        type,
        streamId: readStreamId(source),
        reason: readString(source, 'reason'),
      }
    case 'ERROR':
      return {
        type,
        code: readString(source, 'code'),
        message: readString(source, 'message'),
      }
    default:
      throw new Error(`Unsupported control message type: ${String(type)}`)
  }
}

export function isValidShareSlug(slug: string): boolean {
  return typeof slug === 'string' && /^[a-z0-9-]{3,48}$/.test(slug)
}

export function isValidPublicShareHost(host: string): boolean {
  return new RegExp(`^(?!jt-[a-z0-9]+--)[a-z0-9-]{3,48}\\.join\\.grubielauncher\\.com$`).test(host)
}

export function isValidTicketShareHost(host: string): boolean {
  return new RegExp(`^jt-[a-z0-9]+--[a-z0-9-]{3,48}\\.join\\.grubielauncher\\.com$`).test(host)
}

export function normalizeGatewayUrl(gatewayUrl: string): string {
  if (!gatewayUrl) {
    return SHARE_TUNNEL_URL
  }

  try {
    const url = new URL(gatewayUrl)
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = SHARE_WS_PATH
    }
    return url.toString()
  } catch {
    return gatewayUrl
  }
}

function isLoopbackGatewayHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function allowsInsecureLoopbackGateway(): boolean {
  return process.env.NODE_ENV === 'development'
}

export function isValidGatewayUrl(gatewayUrl: string): boolean {
  if (typeof gatewayUrl !== 'string') return false

  let parsed: URL
  try {
    parsed = new URL(normalizeGatewayUrl(gatewayUrl))
  } catch {
    return false
  }

  const host = parsed.hostname.toLowerCase()

  if (parsed.protocol === 'ws:') {
    return isLoopbackGatewayHost(host) && allowsInsecureLoopbackGateway()
  }

  if (parsed.protocol !== 'wss:') return false
  if (isLoopbackGatewayHost(host)) return true

  return (
    host === SHARE_GATEWAY_HOST_SUFFIX || host.endsWith(`.${SHARE_GATEWAY_HOST_SUFFIX}`)
  )
}

export function toBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  return Buffer.from(data)
}
