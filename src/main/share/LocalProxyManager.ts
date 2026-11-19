import { ShareGuestRef, ShareGuestRefusedEvent, SharePeerInfo } from '@/types/Share'
import {
  CloseStreamMessage,
  OpenStreamMessage,
  StreamOpenedMessage,
} from './shareProtocol'
import { AdmissionRequest, isSameGuest } from './hostControls'
import { encodeLoginDisconnect, GuestRefusal } from './loginDisconnect'
import net from 'net'

interface StreamRecord {
  streamId: number
  peerIp: string
  peerPort: number
  guestUserId?: string
  guestUsername?: string
  statusPing: boolean
  socket: net.Socket
  connectedAt: string
  isOpened: boolean
  isClosing: boolean
  closeTimer: NodeJS.Timeout | null
  gatewayPaused: boolean
}

interface LocalProxyTransport {
  sendControl: (message: StreamOpenedMessage | CloseStreamMessage) => void
  sendBinary: (streamId: number, payload: Buffer) => void
  isWritable: () => boolean
  getBufferedAmount: () => number
}

const WS_HIGH_WATER_MARK = 512 * 1024
const LOCAL_HIGH_WATER_MARK = 512 * 1024
const REFUSED_CLOSE_DELAY_MS = 1500
const LOCAL_CLOSE_GRACE_MS = 400

export type AdmissionDecider = (
  request: AdmissionRequest,
  connected: ShareGuestRef[],
) => GuestRefusal | null

export type GuestRefusedEvent = ShareGuestRefusedEvent

export class LocalProxyManager {
  private localPort: number | null = null
  private transport: LocalProxyTransport | null = null
  private streams = new Map<number, StreamRecord>()
  private refused = new Map<number, NodeJS.Timeout>()
  private admission: AdmissionDecider | null = null
  private guestRefusedListener?: (event: GuestRefusedEvent) => void
  private peersChangedListener?: (peers: SharePeerInfo[]) => void
  private streamClosedListener?: (event: {
    streamId: number
    reason: string
    source: 'local_proxy'
    at: string
  }) => void

  public setLocalPort(localPort: number | null): void {
    this.localPort = localPort
  }

  public setTransport(transport: LocalProxyTransport | null): void {
    this.transport = transport
  }

  public setAdmission(admission: AdmissionDecider | null): void {
    this.admission = admission
  }

  public onGuestRefused(listener: (event: GuestRefusedEvent) => void): void {
    this.guestRefusedListener = listener
  }

  public connectedGuests(): ShareGuestRef[] {
    return [...this.streams.values()]
      .filter((record) => !record.statusPing)
      .map((record) => ({
        userId: record.guestUserId,
        username: record.guestUsername,
      }))
  }

  public closeGuestStreams(guest: ShareGuestRef, reason: string): number {
    let closed = 0
    for (const record of [...this.streams.values()]) {
      if (record.statusPing) continue
      if (!isSameGuest({ userId: record.guestUserId, username: record.guestUsername }, guest)) {
        continue
      }
      this.closeStream(record.streamId, reason)
      closed += 1
    }
    return closed
  }

  public onPeersChanged(listener: (peers: SharePeerInfo[]) => void): void {
    this.peersChangedListener = listener
  }

  public onStreamClosed(
    listener: (event: {
      streamId: number
      reason: string
      source: 'local_proxy'
      at: string
    }) => void,
  ): void {
    this.streamClosedListener = listener
  }

  public async openStream(message: OpenStreamMessage): Promise<void> {
    if (!this.localPort || !this.transport) {
      this.transport?.sendControl({
        type: 'CLOSE_STREAM',
        streamId: message.streamId,
        reason: 'local_port_unavailable',
      })
      return
    }

    if (this.streams.has(message.streamId)) {
      this.closeStream(message.streamId, 'duplicate_stream')
    }

    const refusal = this.admission?.(
      {
        statusPing: message.statusPing === true,
        userId: message.guestUserId,
        username: message.guestUsername,
      },
      this.connectedGuests(),
    )
    if (refusal) {
      this.refuseStream(message, refusal)
      return
    }

    const socket = net.createConnection({
      host: '127.0.0.1',
      port: this.localPort,
    })

    const record: StreamRecord = {
      streamId: message.streamId,
      peerIp: message.peerIp,
      peerPort: message.peerPort,
      guestUserId: message.guestUserId,
      guestUsername: message.guestUsername,
      statusPing: message.statusPing === true,
      socket,
      connectedAt: new Date().toISOString(),
      isOpened: false,
      isClosing: false,
      closeTimer: null,
      gatewayPaused: false,
    }

    this.streams.set(message.streamId, record)
    this.emitPeersChanged()

    const initialData = this.decodeInitialData(message.initialDataBase64)

    socket.once('connect', () => {
      if (this.streams.get(message.streamId) !== record) return

      record.isOpened = true
      if (initialData.length > 0) {
        record.socket.write(initialData)
      }

      this.transport?.sendControl({
        type: 'STREAM_OPENED',
        streamId: message.streamId,
      })
    })

    socket.on('data', (chunk: Buffer) => {
      if (this.streams.get(message.streamId) !== record) return

      if (!this.transport?.isWritable()) {
        this.closeStream(message.streamId, 'gateway_unavailable')
        return
      }

      this.transport.sendBinary(message.streamId, chunk)

      if (this.transport.getBufferedAmount() > WS_HIGH_WATER_MARK && !record.gatewayPaused) {
        record.gatewayPaused = true
        record.socket.pause()
        this.waitForGatewayDrain(record)
      }
    })

    socket.on('error', () => {
      if (this.streams.get(message.streamId) !== record) return

      const reason = record.isOpened ? 'local_socket_error' : 'local_connect_failed'
      this.closeStream(message.streamId, reason)
    })

    socket.on('close', () => {
      if (this.streams.get(message.streamId) !== record) return

      if (!record.isOpened) {
        this.closeStream(message.streamId, 'local_connect_failed')
        return
      }
      if (record.closeTimer) return
      record.closeTimer = setTimeout(() => {
        record.closeTimer = null
        this.closeStream(message.streamId, 'local_socket_closed')
      }, LOCAL_CLOSE_GRACE_MS)
    })
  }

  public handleStreamData(streamId: number, payload: Buffer): void {
    if (this.refused.has(streamId)) return
    const record = this.streams.get(streamId)
    if (!record || record.isClosing || record.closeTimer) return

    record.socket.write(payload)

    if (record.socket.writableLength > LOCAL_HIGH_WATER_MARK) {
      this.closeStream(streamId, 'local_socket_overflow')
    }
  }

  public closeStream(streamId: number, reason: string, notifyGateway = true): void {
    const refusedTimer = this.refused.get(streamId)
    if (refusedTimer) {
      clearTimeout(refusedTimer)
      this.refused.delete(streamId)
      if (notifyGateway && this.transport?.isWritable()) {
        this.transport.sendControl({ type: 'CLOSE_STREAM', streamId, reason })
      }
      return
    }

    const record = this.streams.get(streamId)
    if (!record) return

    if (record.isClosing) return
    record.isClosing = true
    if (record.closeTimer) {
      clearTimeout(record.closeTimer)
      record.closeTimer = null
    }

    try {
      record.socket.destroy()
    } catch {}

    this.streams.delete(streamId)
    this.emitPeersChanged()
    this.streamClosedListener?.({
      streamId,
      reason,
      source: 'local_proxy',
      at: new Date().toISOString(),
    })

    if (notifyGateway && this.transport?.isWritable()) {
      this.transport.sendControl({
        type: 'CLOSE_STREAM',
        streamId,
        reason,
      })
    }
  }

  public dispose(reason = 'share_stopped'): void {
    for (const streamId of [...this.refused.keys()]) {
      this.closeStream(streamId, reason)
    }
    for (const streamId of [...this.streams.keys()]) {
      this.closeStream(streamId, reason)
    }
  }

  private refuseStream(message: OpenStreamMessage, reason: GuestRefusal): void {
    const transport = this.transport
    if (!transport) return

    const { streamId } = message
    transport.sendControl({ type: 'STREAM_OPENED', streamId })
    transport.sendBinary(streamId, encodeLoginDisconnect(reason))

    this.refused.set(
      streamId,
      setTimeout(() => {
        this.refused.delete(streamId)
        if (this.transport?.isWritable()) {
          this.transport.sendControl({
            type: 'CLOSE_STREAM',
            streamId,
            reason: `guest_${reason}`,
          })
        }
      }, REFUSED_CLOSE_DELAY_MS),
    )

    this.guestRefusedListener?.({
      streamId,
      reason,
      userId: message.guestUserId,
      username: message.guestUsername,
      at: new Date().toISOString(),
    })
  }

  private emitPeersChanged(): void {
    if (!this.peersChangedListener) return

    this.peersChangedListener(
      [...this.streams.values()]
        .filter((record) => !record.statusPing)
        .map((record) => ({
          streamId: record.streamId,
          peerIp: record.peerIp,
          peerPort: record.peerPort,
          connectedAt: record.connectedAt,
          guestUserId: record.guestUserId,
          guestUsername: record.guestUsername,
        })),
    )
  }

  private waitForGatewayDrain(record: StreamRecord): void {
    const check = () => {
      if (!this.transport) return
      if (this.streams.get(record.streamId) !== record) return

      if (this.transport.getBufferedAmount() <= WS_HIGH_WATER_MARK / 2) {
        record.gatewayPaused = false
        record.socket.resume()
        return
      }

      setTimeout(check, 50)
    }

    setTimeout(check, 50)
  }

  private decodeInitialData(initialDataBase64: string): Buffer {
    if (!initialDataBase64) return Buffer.alloc(0)

    try {
      return Buffer.from(initialDataBase64, 'base64')
    } catch {
      return Buffer.alloc(0)
    }
  }
}
