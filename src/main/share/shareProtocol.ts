export const SHARE_STREAM_FRAME_VERSION = 1
export const SHARE_STREAM_FRAME_TYPE_DATA = 1
export const SHARE_WS_PATH = '/ws'
export const SHARE_TUNNEL_URL = 'wss://tunnel.grubielauncher.com/ws'
export const SHARE_JOIN_DOMAIN_SUFFIX = '.join.grubielauncher.com'

export interface AuthMessage {
  type: 'AUTH'
  token: string
}

export interface AuthOkMessage {
  type: 'AUTH_OK'
  connectionId: string
  sessionId: string
  slug: string
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

export function parseTunnelControlMessage(raw: string): TunnelControlMessage {
  const parsed = JSON.parse(raw) as TunnelControlMessage

  if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
    throw new Error('Invalid control message payload')
  }

  return parsed
}

export function isValidShareSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,48}$/.test(slug)
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

export function toBuffer(data: ArrayBuffer | Buffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  return Buffer.from(data)
}
