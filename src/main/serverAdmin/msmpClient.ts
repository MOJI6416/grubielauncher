import { EventEmitter } from 'events'
import { connectWebSocket, WsConnection } from './wsClient'

export const MSMP_ORIGIN = 'grubie-launcher'
export const MSMP_NOTIFICATION_PREFIX = 'minecraft:notification/'

export interface MsmpConnectOptions {
  host: string
  port: number
  secret: string
  tls: boolean
  fingerprint256?: string
  origin?: string
  timeoutMs?: number
  callTimeoutMs?: number
}

export class MsmpError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly data?: unknown,
  ) {
    super(message)
    this.name = 'MsmpError'
  }
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

function readError(value: unknown): MsmpError | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { code?: unknown; message?: unknown; data?: unknown }
  if (typeof record.message !== 'string' && typeof record.code !== 'number') return null
  return new MsmpError(
    typeof record.message === 'string' ? record.message : 'MSMP error',
    typeof record.code === 'number' ? record.code : undefined,
    record.data,
  )
}

export function msmpUrl(options: Pick<MsmpConnectOptions, 'host' | 'port' | 'tls'>): string {
  const host = options.host.includes(':') ? `[${options.host}]` : options.host
  return `${options.tls ? 'wss' : 'ws'}://${host}:${options.port}`
}

export class MsmpClient extends EventEmitter {
  private nextId = 1
  private readonly pending = new Map<number, PendingCall>()
  private closed = false

  private constructor(
    private readonly connection: WsConnection,
    private readonly callTimeoutMs: number,
  ) {
    super()
    connection.on('message', (text: string) => this.handleMessage(text))
    connection.on('error', (error: Error) => {
      if (this.listenerCount('error') > 0) this.emit('error', error)
    })
    connection.on('close', (code: number, reason: string) => {
      this.closed = true
      for (const [, call] of this.pending) {
        clearTimeout(call.timer)
        call.reject(new MsmpError('MSMP connection closed'))
      }
      this.pending.clear()
      this.emit('close', code, reason)
    })
  }

  static async connect(options: MsmpConnectOptions): Promise<MsmpClient> {
    const connection = await connectWebSocket({
      url: msmpUrl(options),
      fingerprint256: options.fingerprint256,
      timeoutMs: options.timeoutMs ?? 5000,
      headers: {
        Authorization: `Bearer ${options.secret}`,
        Origin: options.origin ?? MSMP_ORIGIN,
      },
    })
    return new MsmpClient(connection, options.callTimeoutMs ?? 10000)
  }

  get isOpen(): boolean {
    return !this.closed && this.connection.isOpen
  }

  call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.isOpen) return Promise.reject(new MsmpError('MSMP connection closed'))

    const id = this.nextId++
    const request: Record<string, unknown> = { jsonrpc: '2.0', id, method }
    if (params !== undefined) request.params = params

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new MsmpError(`MSMP call ${method} timed out`))
      }, this.callTimeoutMs)
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      })
      try {
        this.connection.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new MsmpError(String(error)))
      }
    })
  }

  close(): void {
    this.connection.close()
  }

  private handleMessage(text: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(text)
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return

    if (typeof message.method === 'string' && message.id === undefined) {
      this.emit('notification', message.method, message.params)
      return
    }

    const id = typeof message.id === 'number' ? message.id : Number(message.id)
    const call = this.pending.get(id)
    if (!call) return
    this.pending.delete(id)
    clearTimeout(call.timer)

    const error =
      readError(message.error) ??
      readError((message.result as { error?: unknown } | undefined)?.error)
    if (error) {
      call.reject(error)
      return
    }
    call.resolve(message.result)
  }
}
