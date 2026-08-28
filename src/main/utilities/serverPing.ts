import net from 'net'
import dns from 'dns/promises'

export interface ServerPingPlayerSample {
  name: string
  id?: string
}

export interface ServerPingResult {
  online: boolean
  latencyMs?: number
  players?: { online: number; max: number; sample?: ServerPingPlayerSample[] }
  versionName?: string
  protocol?: number
  motd?: string
  descriptionRaw?: string
  favicon?: string
  modded?: boolean
  secureChat?: boolean
  error?: string
}

export interface SrvRecord {
  name: string
  port: number
  priority: number
  weight: number
}

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let rest = value >>> 0

  do {
    let byte = rest & 0x7f
    rest >>>= 7
    if (rest !== 0) byte |= 0x80
    bytes.push(byte)
  } while (rest !== 0)

  return Buffer.from(bytes)
}

export function readVarInt(
  buffer: Buffer,
  offset = 0
): { value: number; size: number } | null {
  let value = 0
  let size = 0

  while (size < 5) {
    if (offset + size >= buffer.length) return null

    const byte = buffer[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size += 1

    if ((byte & 0x80) === 0) return { value, size }
  }

  return null
}

export function buildHandshakePacket(host: string, port: number): Buffer {
  const hostBuffer = Buffer.from(host, 'utf8')
  const payload = Buffer.concat([
    writeVarInt(0x00),
    writeVarInt(-1 >>> 0),
    writeVarInt(hostBuffer.length),
    hostBuffer,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(0x01)
  ])

  return Buffer.concat([writeVarInt(payload.length), payload])
}

export function buildStatusRequestPacket(): Buffer {
  const payload = writeVarInt(0x00)
  return Buffer.concat([writeVarInt(payload.length), payload])
}

export function buildPingPacket(payload: Buffer): Buffer {
  const body = Buffer.concat([writeVarInt(0x01), payload])
  return Buffer.concat([writeVarInt(body.length), body])
}

export function parseAddress(address: string): { host: string; port: number } {
  const trimmed = address.trim()
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '')

  if (withoutScheme.startsWith('[')) {
    const end = withoutScheme.indexOf(']')
    const host = withoutScheme.slice(1, end)
    const rest = withoutScheme.slice(end + 1)
    const port = rest.startsWith(':') ? Number(rest.slice(1)) : NaN
    return { host, port: Number.isFinite(port) ? port : 25565 }
  }

  const parts = withoutScheme.split(':')
  if (parts.length === 2) {
    const port = Number(parts[1])
    return { host: parts[0], port: Number.isFinite(port) ? port : 25565 }
  }

  return { host: withoutScheme, port: 25565 }
}

export function hasExplicitPort(address: string): boolean {
  const withoutScheme = address.trim().replace(/^[a-z]+:\/\//i, '')

  if (withoutScheme.startsWith('[')) {
    const end = withoutScheme.indexOf(']')
    if (end < 0) return false
    return /^:\d+$/.test(withoutScheme.slice(end + 1))
  }

  const parts = withoutScheme.split(':')
  return parts.length === 2 && /^\d+$/.test(parts[1])
}

export function pickSrvRecord(
  records: SrvRecord[]
): { host: string; port: number } | null {
  const usable = records.filter((record) => record.name && record.port > 0)
  if (!usable.length) return null

  const best = [...usable].sort(
    (a, b) => a.priority - b.priority || b.weight - a.weight
  )[0]

  return { host: best.name.replace(/\.$/, ''), port: best.port }
}

function flattenDescription(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(flattenDescription).join('')
  if (!node || typeof node !== 'object') return ''

  const record = node as Record<string, unknown>
  const own = typeof record.text === 'string' ? record.text : ''
  const extra = Array.isArray(record.extra)
    ? record.extra.map(flattenDescription).join('')
    : ''

  return `${own}${extra}`
}

export function parseStatusResponse(json: string): ServerPingResult {
  try {
    const data = JSON.parse(json)
    const description = data?.description
    const motd = flattenDescription(description)

    const sample = Array.isArray(data?.players?.sample)
      ? data.players.sample
          .filter((entry: unknown) => typeof (entry as any)?.name === 'string')
          .slice(0, 24)
          .map((entry: any) => ({
            name: String(entry.name),
            id: typeof entry.id === 'string' ? entry.id : undefined
          }))
      : undefined

    return {
      online: true,
      players:
        data?.players && typeof data.players.online === 'number'
          ? {
              online: data.players.online,
              max: Number(data.players.max) || 0,
              sample: sample && sample.length ? sample : undefined
            }
          : undefined,
      versionName:
        typeof data?.version?.name === 'string' ? data.version.name : undefined,
      protocol:
        typeof data?.version?.protocol === 'number'
          ? data.version.protocol
          : undefined,
      motd: motd.replace(/§[0-9a-fk-or]/gi, '').trim() || undefined,
      descriptionRaw:
        description === undefined ? undefined : JSON.stringify(description),
      favicon: typeof data?.favicon === 'string' ? data.favicon : undefined,
      modded:
        (data?.forgeData !== undefined && data.forgeData !== null) ||
        (data?.modinfo !== undefined && data.modinfo !== null) ||
        undefined,
      secureChat:
        typeof data?.enforcesSecureChat === 'boolean'
          ? data.enforcesSecureChat
          : undefined
    }
  } catch {
    return { online: false, error: 'bad_response' }
  }
}

async function resolveSrvTarget(
  host: string,
  timeoutMs: number
): Promise<{ host: string; port: number } | null> {
  if (net.isIP(host)) return null

  try {
    const records = await Promise.race([
      dns.resolveSrv(`_minecraft._tcp.${host}`),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs).unref?.()
      })
    ])

    return records ? pickSrvRecord(records) : null
  } catch {
    return null
  }
}

const MAX_PING_RESPONSE_BYTES = 512 * 1024

export async function pingServer(
  address: string,
  timeoutMs = 4000
): Promise<ServerPingResult> {
  const parsed = parseAddress(address)
  const srv = hasExplicitPort(address)
    ? null
    : await resolveSrvTarget(parsed.host, timeoutMs)

  const host = srv?.host ?? parsed.host
  const port = srv?.port ?? parsed.port

  return new Promise((resolve) => {
    const startedAt = Date.now()
    let pingSentAt = 0
    let status: ServerPingResult | null = null
    let received = Buffer.alloc(0)
    let settled = false
    let deadline: NodeJS.Timeout | null = null

    const finish = (result: ServerPingResult) => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      socket.destroy()
      resolve(result)
    }

    const socket = net.createConnection({ host, port }, () => {
      socket.write(buildHandshakePacket(host, port))
      socket.write(buildStatusRequestPacket())
    })

    socket.setTimeout(timeoutMs)

    const finishWithoutAnswer = () =>
      finish(
        status
          ? { ...status, latencyMs: Date.now() - startedAt }
          : { online: false, error: 'bad_response' }
      )

    const giveUp = () =>
      finish(
        status
          ? { ...status, latencyMs: Date.now() - startedAt }
          : { online: false, error: 'timeout' }
      )

    deadline = setTimeout(giveUp, timeoutMs)
    deadline.unref?.()

    socket.on('end', finishWithoutAnswer)
    socket.on('close', finishWithoutAnswer)

    socket.on('timeout', giveUp)

    socket.on('error', (error) =>
      finish(
        status
          ? { ...status, latencyMs: Date.now() - startedAt }
          : { online: false, error: error.message }
      )
    )

    const drain = () => {
      while (!settled) {
        const packetLength = readVarInt(received)
        if (!packetLength) return

        const total = packetLength.size + packetLength.value
        if (received.length < total) return

        if (status) {
          finish({ ...status, latencyMs: Date.now() - pingSentAt })
          return
        }

        const packetId = readVarInt(received, packetLength.size)
        if (!packetId) return finish({ online: false, error: 'bad_response' })

        const stringStart = packetLength.size + packetId.size
        const stringLength = readVarInt(received, stringStart)
        if (!stringLength) {
          return finish({ online: false, error: 'bad_response' })
        }

        const jsonStart = stringStart + stringLength.size
        const json = received
          .subarray(jsonStart, jsonStart + stringLength.value)
          .toString('utf8')

        const parsed = parseStatusResponse(json)
        if (!parsed.online) {
          return finish({ ...parsed, latencyMs: Date.now() - startedAt })
        }

        status = parsed
        received = received.subarray(total)
        pingSentAt = Date.now()

        try {
          socket.write(buildPingPacket(Buffer.alloc(8)))
        } catch {
          return finish({ ...parsed, latencyMs: Date.now() - startedAt })
        }
      }
    }

    socket.on('data', (chunk) => {
      if (received.length + chunk.length > MAX_PING_RESPONSE_BYTES) {
        return finish({ online: false, error: 'bad_response' })
      }

      received = Buffer.concat([received, chunk])
      drain()
    })
  })
}
