export const NEXT_STATE_STATUS = 1
export const NEXT_STATE_LOGIN = 2
export const MAX_HANDSHAKE_BYTES = 4096

const MAX_STRING_LENGTH = 255
const LOGIN_NAME_PATTERN = /^[\x21-\x7E]{1,16}$/

export interface McHandshake {
  protocolVersion: number
  hostname: string
  port: number
  nextState: number
  username: string
  length: number
}

export type HandshakeRead =
  | { status: 'need_more' }
  | { status: 'invalid'; reason: string }
  | { status: 'ok'; handshake: McHandshake }

interface VarInt {
  value: number
  size: number
}

function readVarInt(buffer: Buffer, offset: number): VarInt | null | 'invalid' {
  let value = 0
  let size = 0
  while (true) {
    if (offset + size >= buffer.length) return null
    const byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size += 1
    if ((byte & 0x80) === 0) return { value, size }
    if (size >= 5) return 'invalid'
  }
}

export function encodeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let unsigned = value >>> 0
  do {
    let current = unsigned & 0x7f
    unsigned >>>= 7
    if (unsigned !== 0) current |= 0x80
    bytes.push(current)
  } while (unsigned !== 0)
  return Buffer.from(bytes)
}

function readPacket(
  buffer: Buffer,
  offset: number,
  maxBytes: number,
): { body: Buffer; end: number } | null | 'invalid' {
  const length = readVarInt(buffer, offset)
  if (length === 'invalid') return 'invalid'
  if (!length) return null
  if (length.value <= 0) return 'invalid'
  const end = offset + length.size + length.value
  if (end > maxBytes) return 'invalid'
  if (end > buffer.length) return null
  return { body: buffer.subarray(offset + length.size, end), end }
}

function readString(
  body: Buffer,
  offset: number,
): { value: string; end: number } | null {
  const length = readVarInt(body, offset)
  if (!length || length === 'invalid') return null
  if (length.value < 0 || length.value > MAX_STRING_LENGTH) return null
  const start = offset + length.size
  const end = start + length.value
  if (end > body.length) return null
  return { value: body.subarray(start, end).toString('utf8'), end }
}

function parseHandshakeBody(body: Buffer) {
  const packetId = readVarInt(body, 0)
  if (!packetId || packetId === 'invalid' || packetId.value !== 0) return null
  const protocol = readVarInt(body, packetId.size)
  if (!protocol || protocol === 'invalid') return null
  const host = readString(body, packetId.size + protocol.size)
  if (!host || host.value.length === 0) return null
  if (host.end + 2 > body.length) return null
  const port = body.readUInt16BE(host.end)
  const nextState = readVarInt(body, host.end + 2)
  if (!nextState || nextState === 'invalid') return null
  return {
    protocolVersion: protocol.value,
    hostname: host.value,
    port,
    nextState: nextState.value,
  }
}

function parseLoginName(body: Buffer): string {
  const packetId = readVarInt(body, 0)
  if (!packetId || packetId === 'invalid' || packetId.value !== 0) return ''
  const name = readString(body, packetId.size)
  if (!name || !LOGIN_NAME_PATTERN.test(name.value)) return ''
  return name.value
}

export function readHandshake(
  buffer: Buffer,
  maxBytes = MAX_HANDSHAKE_BYTES,
): HandshakeRead {
  const first = readPacket(buffer, 0, maxBytes)
  if (first === 'invalid') return { status: 'invalid', reason: 'handshake_packet' }
  if (!first) return { status: 'need_more' }

  const parsed = parseHandshakeBody(first.body)
  if (!parsed) return { status: 'invalid', reason: 'handshake_body' }

  if (parsed.nextState !== NEXT_STATE_LOGIN) {
    return {
      status: 'ok',
      handshake: { ...parsed, username: '', length: first.end },
    }
  }

  const login = readPacket(buffer, first.end, maxBytes)
  if (login === 'invalid') return { status: 'invalid', reason: 'login_packet' }
  if (!login) return { status: 'need_more' }

  return {
    status: 'ok',
    handshake: {
      ...parsed,
      username: parseLoginName(login.body),
      length: login.end,
    },
  }
}

export function rewriteHandshakeHost(
  buffer: Buffer,
  hostname: string,
  port: number,
): Buffer | null {
  const first = readPacket(buffer, 0, MAX_HANDSHAKE_BYTES)
  if (!first || first === 'invalid') return null
  const body = first.body

  const packetId = readVarInt(body, 0)
  if (!packetId || packetId === 'invalid' || packetId.value !== 0) return null
  const protocol = readVarInt(body, packetId.size)
  if (!protocol || protocol === 'invalid') return null
  const host = readString(body, packetId.size + protocol.size)
  if (!host || host.end + 2 > body.length) return null

  const nul = host.value.indexOf('\0')
  const suffix = nul >= 0 ? host.value.slice(nul) : ''
  const nextHost = Buffer.from(`${hostname}${suffix}`, 'utf8')
  if (nextHost.length > MAX_STRING_LENGTH) return null

  const portBytes = Buffer.alloc(2)
  portBytes.writeUInt16BE(port)

  const nextBody = Buffer.concat([
    body.subarray(0, packetId.size + protocol.size),
    encodeVarInt(nextHost.length),
    nextHost,
    portBytes,
    body.subarray(host.end + 2),
  ])

  return Buffer.concat([
    encodeVarInt(nextBody.length),
    nextBody,
    buffer.subarray(first.end),
  ])
}

export function namesEqual(left: string, right: string): boolean {
  const a = left.trim()
  const b = right.trim()
  return a !== '' && b !== '' && a.toLowerCase() === b.toLowerCase()
}
