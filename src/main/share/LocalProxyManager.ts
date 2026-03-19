import { SharePeerInfo } from '@/types/Share'
import {
  CloseStreamMessage,
  OpenStreamMessage,
  StreamOpenedMessage,
} from './shareProtocol'
import net from 'net'

interface StreamRecord {
  streamId: number
  peerIp: string
  peerPort: number
  socket: net.Socket
  connectedAt: string
  isOpened: boolean
  isClosing: boolean
  gatewayPaused: boolean
}

interface LocalProxyTransport {
  sendControl: (message: StreamOpenedMessage | CloseStreamMessage) => void
  sendBinary: (streamId: number, payload: Buffer) => void
  isWritable: () => boolean
  getBufferedAmount: () => number
}

const WS_HIGH_WATER_MARK = 512 * 1024

export class LocalProxyManager {
  private localPort: number | null = null
  private transport: LocalProxyTransport | null = null
  private streams = new Map<number, StreamRecord>()
  private peersChangedListener?: (peers: SharePeerInfo[]) => void

  public setLocalPort(localPort: number | null): void {
    this.localPort = localPort
  }

  public setTransport(transport: LocalProxyTransport | null): void {
    this.transport = transport
  }

  public onPeersChanged(listener: (peers: SharePeerInfo[]) => void): void {
    this.peersChangedListener = listener
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

    const socket = net.createConnection({
      host: '127.0.0.1',
      port: this.localPort,
    })

    const record: StreamRecord = {
      streamId: message.streamId,
      peerIp: message.peerIp,
      peerPort: message.peerPort,
      socket,
      connectedAt: new Date().toISOString(),
      isOpened: false,
      isClosing: false,
      gatewayPaused: false,
    }

    this.streams.set(message.streamId, record)
    this.emitPeersChanged()

    const initialData = this.decodeInitialData(message.initialDataBase64)

    socket.once('connect', () => {
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
      const reason = record.isOpened ? 'local_socket_error' : 'local_connect_failed'
      this.closeStream(message.streamId, reason)
    })

    socket.on('close', () => {
      this.closeStream(message.streamId, record.isOpened ? 'local_socket_closed' : 'local_connect_failed')
    })
  }

  public handleStreamData(streamId: number, payload: Buffer): void {
    const record = this.streams.get(streamId)
    if (!record || record.isClosing) return

    record.socket.write(payload)
  }

  public closeStream(streamId: number, reason: string, notifyGateway = true): void {
    const record = this.streams.get(streamId)
    if (!record) return

    if (record.isClosing) return
    record.isClosing = true

    try {
      record.socket.destroy()
    } catch {}

    this.streams.delete(streamId)
    this.emitPeersChanged()

    if (notifyGateway && this.transport?.isWritable()) {
      this.transport.sendControl({
        type: 'CLOSE_STREAM',
        streamId,
        reason,
      })
    }
  }

  public dispose(reason = 'share_stopped'): void {
    for (const streamId of [...this.streams.keys()]) {
      this.closeStream(streamId, reason)
    }
  }

  private emitPeersChanged(): void {
    if (!this.peersChangedListener) return

    this.peersChangedListener(
      [...this.streams.values()].map((record) => ({
        streamId: record.streamId,
        peerIp: record.peerIp,
        peerPort: record.peerPort,
        connectedAt: record.connectedAt,
      })),
    )
  }

  private waitForGatewayDrain(record: StreamRecord): void {
    const check = () => {
      if (!this.transport) return
      if (!this.streams.has(record.streamId)) return

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
