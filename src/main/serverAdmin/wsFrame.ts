import { createHash, randomBytes } from 'crypto'

export const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export const WsOpcode = {
  Continuation: 0x0,
  Text: 0x1,
  Binary: 0x2,
  Close: 0x8,
  Ping: 0x9,
  Pong: 0xa,
} as const

export interface WsFrame {
  fin: boolean
  opcode: number
  payload: Buffer
}

export function websocketAccept(key: string): string {
  return createHash('sha1').update(key + WS_GUID).digest('base64')
}

export function encodeFrame(
  opcode: number,
  payload: Buffer,
  mask: boolean,
  maskKey: Buffer = randomBytes(4),
): Buffer {
  const length = payload.length
  const header: number[] = [0x80 | (opcode & 0x0f)]
  const maskBit = mask ? 0x80 : 0
  let extended: Buffer
  if (length < 126) {
    header.push(maskBit | length)
    extended = Buffer.alloc(0)
  } else if (length < 0x10000) {
    header.push(maskBit | 126)
    extended = Buffer.alloc(2)
    extended.writeUInt16BE(length, 0)
  } else {
    header.push(maskBit | 127)
    extended = Buffer.alloc(8)
    extended.writeBigUInt64BE(BigInt(length), 0)
  }

  if (!mask) {
    return Buffer.concat([Buffer.from(header), extended, payload])
  }

  const body = Buffer.allocUnsafe(length)
  for (let index = 0; index < length; index++) {
    body[index] = payload[index] ^ maskKey[index & 3]
  }
  return Buffer.concat([Buffer.from(header), extended, maskKey, body])
}

export class WsFrameDecoder {
  private buffer: Buffer = Buffer.alloc(0)

  constructor(private readonly maxPayload = 16 * 1024 * 1024) {}

  push(chunk: Buffer): WsFrame[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk
    const frames: WsFrame[] = []

    for (;;) {
      if (this.buffer.length < 2) break
      const first = this.buffer[0]
      const second = this.buffer[1]
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2

      if (length === 126) {
        if (this.buffer.length < 4) break
        length = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) break
        const big = this.buffer.readBigUInt64BE(2)
        if (big > BigInt(this.maxPayload)) throw new Error('WebSocket frame is too large')
        length = Number(big)
        offset = 10
      }

      if (length > this.maxPayload) throw new Error('WebSocket frame is too large')

      const maskOffset = offset
      if (masked) offset += 4
      if (this.buffer.length < offset + length) break

      let payload = this.buffer.subarray(offset, offset + length)
      if (masked) {
        const key = this.buffer.subarray(maskOffset, maskOffset + 4)
        const unmasked = Buffer.allocUnsafe(length)
        for (let index = 0; index < length; index++) {
          unmasked[index] = payload[index] ^ key[index & 3]
        }
        payload = unmasked
      } else {
        payload = Buffer.from(payload)
      }

      frames.push({ fin: (first & 0x80) !== 0, opcode: first & 0x0f, payload })
      this.buffer = this.buffer.subarray(offset + length)
    }

    return frames
  }
}

export class WsMessageAssembler {
  private parts: Buffer[] = []
  private opcode = 0

  accept(frame: WsFrame): { opcode: number; data: Buffer } | null {
    if (frame.opcode >= 0x8) return { opcode: frame.opcode, data: frame.payload }

    if (frame.opcode !== WsOpcode.Continuation) {
      this.parts = []
      this.opcode = frame.opcode
    }
    this.parts.push(frame.payload)
    if (!frame.fin) return null

    const data = Buffer.concat(this.parts)
    this.parts = []
    return { opcode: this.opcode, data }
  }
}
