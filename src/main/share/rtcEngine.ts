import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron'
import { EventEmitter } from 'events'
import path from 'path'
import { appPageUrl } from '../windows/appPages'
import type {
  RtcCommand,
  RtcData,
  RtcEvent,
  RtcIceServer,
  RtcPathStats,
  RtcReply,
  RtcRole,
} from '@/shared/rtcBridge'

const REQUEST_TIMEOUT_MS = 15_000
const READY_TIMEOUT_MS = 20_000
const IDLE_CLOSE_MS = 60_000

type RtcEngineEvents = {
  state: (peerId: string, state: string) => void
  channelOpen: (peerId: string, channelId: number) => void
  channelClose: (peerId: string, channelId: number) => void
  data: (peerId: string, channelId: number, data: Buffer) => void
  gone: () => void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

function channelKey(peerId: string, channelId: number): string {
  return `${peerId}:${channelId}`
}

export class RtcEngine extends EventEmitter {
  private window: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private markReady: (() => void) | null = null
  private readonly pending = new Map<number, PendingRequest>()
  private readonly peers = new Set<string>()
  private readonly buffered = new Map<string, number>()
  private nextRequestId = 1
  private idleTimer: NodeJS.Timeout | null = null
  private listening = false

  public override on<K extends keyof RtcEngineEvents>(event: K, listener: RtcEngineEvents[K]): this {
    return super.on(event, listener)
  }

  public async createPeer(peerId: string, role: RtcRole, iceServers: RtcIceServer[]): Promise<void> {
    this.peers.add(peerId)
    this.cancelIdle()
    await this.request({ cmd: 'create', peerId, role, iceServers })
  }

  public async makeOffer(peerId: string): Promise<string> {
    return String(await this.request({ cmd: 'offer', peerId }))
  }

  public async answerOffer(peerId: string, sdp: string): Promise<string> {
    return String(await this.request({ cmd: 'answer', peerId, sdp }))
  }

  public async acceptAnswer(peerId: string, sdp: string): Promise<void> {
    await this.request({ cmd: 'accept', peerId, sdp })
  }

  public async openChannel(peerId: string, channelId: number): Promise<void> {
    await this.request({ cmd: 'open', peerId, channelId })
  }

  public closeChannel(peerId: string, channelId: number): void {
    this.buffered.delete(channelKey(peerId, channelId))
    if (!this.window) return
    void this.request({ cmd: 'closeChannel', peerId, channelId }).catch(() => undefined)
  }

  public closePeer(peerId: string): void {
    if (!this.peers.delete(peerId)) return
    for (const key of [...this.buffered.keys()]) {
      if (key.startsWith(`${peerId}:`)) this.buffered.delete(key)
    }
    if (this.window) {
      void this.request({ cmd: 'close', peerId }).catch(() => undefined)
    }
    this.scheduleIdle()
  }

  public async stats(peerId: string): Promise<RtcPathStats> {
    return (await this.request({ cmd: 'stats', peerId })) as RtcPathStats
  }

  public send(peerId: string, channelId: number, data: Buffer): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const payload: RtcData = { peerId, channelId, data }
    window.webContents.send('rtc:send', payload)
  }

  public bufferedAmount(peerId: string, channelId: number): number {
    return this.buffered.get(channelKey(peerId, channelId)) ?? 0
  }

  public hasPeer(peerId: string): boolean {
    return this.peers.has(peerId)
  }

  public dispose(): void {
    this.peers.clear()
    this.cancelIdle()
    this.destroyWindow()
  }

  private async request(command: RtcCommand): Promise<unknown> {
    await this.ensureWindow()
    const window = this.window
    if (!window || window.isDestroyed()) throw new Error('rtc_window_unavailable')

    const id = this.nextRequestId++
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('rtc_request_timeout'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      window.webContents.send('rtc:request', { id, command })
    })
  }

  private ensureWindow(): Promise<void> {
    if (this.window && !this.window.isDestroyed() && this.ready) return this.ready
    this.installListeners()

    const window = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/rtc.js'),
        devTools: !app.isPackaged,
        nodeIntegration: false,
        sandbox: true,
        contextIsolation: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('render-process-gone', () => this.handleGone())
    window.on('closed', () => {
      if (this.window === window) this.handleGone()
    })
    this.window = window

    this.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.markReady = null
        reject(new Error('rtc_window_timeout'))
        this.destroyWindow()
      }, READY_TIMEOUT_MS)
      this.markReady = () => {
        clearTimeout(timer)
        this.markReady = null
        resolve()
      }
    })

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      void window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/rtc.html`)
    } else {
      void window.loadURL(appPageUrl('rtc', 'rtc.html'))
    }
    return this.ready
  }

  private installListeners(): void {
    if (this.listening) return
    this.listening = true

    ipcMain.on('rtc:ready', (event) => {
      if (this.isOwnSender(event)) this.markReady?.()
    })
    ipcMain.on('rtc:reply', (event, reply: RtcReply) => {
      if (!this.isOwnSender(event)) return
      const pending = this.pending.get(reply.id)
      if (!pending) return
      this.pending.delete(reply.id)
      clearTimeout(pending.timer)
      if (reply.ok) pending.resolve(reply.result)
      else pending.reject(new Error(reply.error || 'rtc_request_failed'))
    })
    ipcMain.on('rtc:event', (event, payload: RtcEvent) => {
      if (!this.isOwnSender(event)) return
      this.handleEvent(payload)
    })
    ipcMain.on('rtc:data', (event, payload: RtcData) => {
      if (!this.isOwnSender(event)) return
      this.emit('data', payload.peerId, payload.channelId, Buffer.from(payload.data))
    })
  }

  private handleEvent(event: RtcEvent): void {
    switch (event.type) {
      case 'state':
        this.emit('state', event.peerId, event.state)
        return
      case 'channelOpen':
        this.emit('channelOpen', event.peerId, event.channelId)
        return
      case 'channelClose':
        this.buffered.delete(channelKey(event.peerId, event.channelId))
        this.emit('channelClose', event.peerId, event.channelId)
        return
      case 'buffered':
        this.buffered.set(channelKey(event.peerId, event.channelId), event.amount)
        return
    }
  }

  private isOwnSender(event: IpcMainEvent): boolean {
    const window = this.window
    return !!window && !window.isDestroyed() && event.sender === window.webContents
  }

  private handleGone(): void {
    this.window = null
    this.ready = null
    this.markReady = null
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('rtc_window_gone'))
      this.pending.delete(id)
    }
    this.buffered.clear()
    const hadPeers = this.peers.size > 0
    this.peers.clear()
    if (hadPeers) this.emit('gone')
  }

  private destroyWindow(): void {
    const window = this.window
    if (window && !window.isDestroyed()) window.destroy()
    this.handleGone()
  }

  private cancelIdle(): void {
    if (!this.idleTimer) return
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private scheduleIdle(): void {
    if (this.peers.size > 0 || this.idleTimer || !this.window) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.peers.size === 0) this.destroyWindow()
    }, IDLE_CLOSE_MS)
  }
}

export const rtcEngine = new RtcEngine()
