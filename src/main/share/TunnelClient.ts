import { EventEmitter } from 'events'
import {
  AuthMessage,
  AuthOkMessage,
  CloseStreamMessage,
  ErrorMessage,
  OpenStreamMessage,
  PingMessage,
  PongMessage,
  StreamOpenedMessage,
  decodeStreamDataFrame,
  encodeStreamDataFrame,
  normalizeGatewayUrl,
  parseTunnelControlMessage,
  toBuffer,
} from './shareProtocol'
import { LocalProxyManager } from './LocalProxyManager'
import { ShareServiceError } from './errors'

type TunnelEvents = {
  connected: () => void
  authOk: (message: AuthOkMessage) => void
  disconnected: (reason: string) => void
  controlError: (message: ErrorMessage) => void
  protocolError: (error: Error) => void
}

export class TunnelClient extends EventEmitter {
  private ws: WebSocket | null = null
  private readonly proxyManager: LocalProxyManager
  private gatewayUrl = ''
  private token = ''
  private expectedSessionId = ''
  private expectedSlug = ''
  private shouldIgnoreClose = false

  constructor(proxyManager: LocalProxyManager) {
    super()
    this.proxyManager = proxyManager
    this.proxyManager.setTransport({
      sendControl: (message) => this.sendControl(message),
      sendBinary: (streamId, payload) => this.sendBinary(streamId, payload),
      isWritable: () => this.isWritable(),
      getBufferedAmount: () => this.getBufferedAmount(),
    })
  }

  public async connect(options: {
    gatewayUrl: string
    token: string
    sessionId: string
    slug: string
  }): Promise<void> {
    await this.disconnect('replaced_connection', true)

    this.gatewayUrl = normalizeGatewayUrl(options.gatewayUrl)
    this.token = options.token
    this.expectedSessionId = options.sessionId
    this.expectedSlug = options.slug
    this.shouldIgnoreClose = false

    const ws = new WebSocket(this.gatewayUrl)
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.addEventListener('open', this.handleOpen)
    ws.addEventListener('message', this.handleMessage)
    ws.addEventListener('error', this.handleError)
    ws.addEventListener('close', this.handleClose)
  }

  public async disconnect(reason = 'manual_disconnect', silent = false): Promise<void> {
    this.shouldIgnoreClose = silent

    if (!this.ws) return

    const ws = this.ws
    this.ws = null

    ws.removeEventListener('open', this.handleOpen)
    ws.removeEventListener('message', this.handleMessage)
    ws.removeEventListener('error', this.handleError)
    ws.removeEventListener('close', this.handleClose)

    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close(1000, reason)
      } catch {}
    }

    this.proxyManager.dispose(reason)
  }

  public isWritable(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN
  }

  public getBufferedAmount(): number {
    return this.ws?.bufferedAmount || 0
  }

  public on<K extends keyof TunnelEvents>(eventName: K, listener: TunnelEvents[K]): this {
    return super.on(eventName, listener)
  }

  public off<K extends keyof TunnelEvents>(eventName: K, listener: TunnelEvents[K]): this {
    return super.off(eventName, listener)
  }

  private readonly handleOpen = () => {
    this.emit('connected')

    const authMessage: AuthMessage = {
      type: 'AUTH',
      token: this.token,
    }

    this.sendControl(authMessage)
  }

  private readonly handleMessage = async (event: MessageEvent) => {
    try {
      if (typeof event.data === 'string') {
        const controlMessage = parseTunnelControlMessage(event.data)
        if (controlMessage.type === 'AUTH') {
          throw new ShareServiceError(
            'tunnel_protocol_error',
            'Unexpected AUTH message received from gateway',
          )
        }

        this.handleControlMessage(controlMessage)
        return
      }

      const payload =
        event.data instanceof Blob ? await event.data.arrayBuffer() : (event.data as ArrayBuffer)
      const frame = decodeStreamDataFrame(toBuffer(payload))
      this.proxyManager.handleStreamData(frame.streamId, frame.payload)
    } catch (error) {
      this.emit('protocolError', error instanceof Error ? error : new Error(String(error)))
      await this.disconnect('protocol_error')
    }
  }

  private readonly handleError = () => {
    this.emit('protocolError', new Error('WebSocket connection error'))
  }

  private readonly handleClose = (event: CloseEvent) => {
    this.proxyManager.dispose('gateway_closed')

    const reason = event.reason || `code_${event.code}`
    if (this.shouldIgnoreClose) return
    this.emit('disconnected', reason)
  }

  private handleControlMessage(
    message:
      | AuthOkMessage
      | PingMessage
      | PongMessage
      | OpenStreamMessage
      | StreamOpenedMessage
      | CloseStreamMessage
      | ErrorMessage,
  ): void {
    switch (message.type) {
      case 'AUTH_OK':
        if (
          message.sessionId !== this.expectedSessionId ||
          message.slug !== this.expectedSlug
        ) {
          throw new ShareServiceError(
            'tunnel_protocol_error',
            'Tunnel AUTH_OK does not match expected session',
          )
        }
        this.emit('authOk', message)
        return
      case 'PING': {
        const pong: PongMessage = {
          type: 'PONG',
          ts: message.ts,
        }
        this.sendControl(pong)
        return
      }
      case 'OPEN_STREAM':
        void this.proxyManager.openStream(message)
        return
      case 'CLOSE_STREAM':
        this.proxyManager.closeStream(
          message.streamId,
          message.reason || 'gateway_closed',
          false,
        )
        return
      case 'ERROR':
        this.emit('controlError', message)
        return
      case 'PONG':
      case 'STREAM_OPENED':
        return
    }
  }

  private sendControl(message: AuthMessage | PongMessage | StreamOpenedMessage | CloseStreamMessage): void {
    if (!this.isWritable() || !this.ws) return

    if (message.type === 'AUTH') {
      const sanitized = {
        ...message,
        token: '[redacted]',
      }
      console.log('[Tunnel] send', JSON.stringify(sanitized))
    }

    this.ws.send(JSON.stringify(message))
  }

  private sendBinary(streamId: number, payload: Buffer): void {
    if (!this.isWritable() || !this.ws) return
    this.ws.send(encodeStreamDataFrame(streamId, payload))
  }
}
