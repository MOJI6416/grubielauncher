import net from 'net'
import { EventEmitter } from 'events'
import type {
  ShareGuestLink,
  ShareGuestLinkRequest,
  ShareTransport,
} from '@/types/Share'
import { RTC_BUFFER_HIGH, RTC_BUFFER_LOW } from '@/shared/rtcBridge'
import type { RtcEngine } from './rtcEngine'
import { SHARE_RTC_URL, readIceServers, readSdp } from './shareProtocol'
import { MAX_HANDSHAKE_BYTES, rewriteHandshakeHost } from './mcHandshake'
import {
  DIRECT_CONNECT_TIMEOUT_MS,
  classifyPath,
  planGuestLink,
  roundRtt,
  routeGuestConnection,
  shouldRetryDirect,
  type DirectPolicy,
  type JoinHost,
  type PeerLinkState,
} from './transportChoice'
import { pingServer } from '../utilities/serverPing'
import { gameProcesses } from '../utilities/runtime'

const SIGNAL_PROTOCOL_VERSION = 1
const STATS_INTERVAL_MS = 5000
const RELAY_PING_INTERVAL_MS = 15_000
const SWEEP_INTERVAL_MS = 30_000
const IDLE_CLOSE_MS = 10 * 60_000
const NO_GAME_GRACE_MS = 5 * 60_000
const NO_GAME_IDLE_MS = 60_000
const DRAIN_POLL_MS = 50

interface GuestConnection {
  socket: net.Socket
  channelId: number
  open: boolean
  pending: Buffer[]
  paused: boolean
}

interface GuestLinkRecord {
  request: ShareGuestLinkRequest
  join: JoinHost
  peerId: string | null
  peerState: PeerLinkState
  failures: number
  lastAttemptAt: number
  server: net.Server | null
  channels: Map<number, GuestConnection>
  relayed: Set<net.Socket>
  nextChannelId: number
  createdAt: number
  lastActivityAt: number
  negotiation: Promise<boolean> | null
  connected: (() => void) | null
  view: ShareGuestLink
}

class SignalError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

export class DirectGuest extends EventEmitter {
  private readonly links = new Map<string, GuestLinkRecord>()
  private statsTimer: NodeJS.Timeout | null = null
  private relayPingTimer: NodeJS.Timeout | null = null
  private sweepTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly engine: RtcEngine,
    private readonly policy: () => DirectPolicy,
    private readonly signalUrl = SHARE_RTC_URL,
  ) {
    super()
    engine.on('state', this.handleState)
    engine.on('channelOpen', this.handleChannelOpen)
    engine.on('channelClose', this.handleChannelClose)
    engine.on('data', this.handleData)
    engine.on('gone', this.handleGone)
  }

  public list(): ShareGuestLink[] {
    return [...this.links.values()].map((record) => ({ ...record.view }))
  }

  public async open(request: ShareGuestLinkRequest): Promise<ShareGuestLink> {
    const plan = planGuestLink(this.policy(), request.connectHost)
    const existing = this.links.get(request.slug)

    if (existing && existing.request.connectHost === request.connectHost && existing.server) {
      existing.request = { ...existing.request, hostUserId: request.hostUserId }
      existing.lastActivityAt = Date.now()
      if (plan.kind === 'direct' && existing.peerState !== 'connected') {
        await this.negotiate(existing)
      }
      return { ...existing.view }
    }
    if (existing) this.closeLink(existing)

    if (plan.kind === 'relay') {
      const record = this.createRecord(request, null)
      record.view = this.relayView(request, plan.reason)
      this.links.set(request.slug, record)
      this.startTimers()
      this.notify()
      return { ...record.view }
    }

    const record = this.createRecord(request, plan.join)
    this.links.set(request.slug, record)
    this.startTimers()
    this.notify()

    const ok = await this.negotiate(record)
    if (this.links.get(request.slug) !== record) return this.relayView(request, 'closed')
    if (!ok) {
      record.view = this.relayView(request, record.view.fallbackReason ?? 'direct_failed')
      this.notify()
      return { ...record.view }
    }

    try {
      const port = await this.listen(record)
      record.view = {
        ...record.view,
        address: `127.0.0.1:${port}`,
        state: 'connected',
        updatedAt: nowIso(),
      }
      void this.refreshStats()
    } catch {
      this.closePeer(record)
      record.view = this.relayView(request, 'listen_failed')
    }
    this.notify()
    return { ...record.view }
  }

  public closeAll(): void {
    for (const record of [...this.links.values()]) this.closeLink(record)
    this.stopTimers()
  }

  private createRecord(request: ShareGuestLinkRequest, join: JoinHost | null): GuestLinkRecord {
    return {
      request,
      join: join ?? { slug: request.slug, host: request.connectHost, port: 25565 },
      peerId: null,
      peerState: 'new',
      failures: 0,
      lastAttemptAt: 0,
      server: null,
      channels: new Map(),
      relayed: new Set(),
      nextChannelId: 1,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      negotiation: null,
      connected: null,
      view: {
        slug: request.slug,
        hostUserId: request.hostUserId,
        address: request.connectHost,
        transport: 'direct',
        state: 'connecting',
        updatedAt: nowIso(),
      },
    }
  }

  private relayView(request: ShareGuestLinkRequest, reason: string): ShareGuestLink {
    return {
      slug: request.slug,
      hostUserId: request.hostUserId,
      address: request.connectHost,
      transport: 'relay',
      state: 'connected',
      fallbackReason: reason,
      updatedAt: nowIso(),
    }
  }

  private negotiate(record: GuestLinkRecord): Promise<boolean> {
    if (record.negotiation) return record.negotiation
    record.negotiation = this.runNegotiation(record).finally(() => {
      record.negotiation = null
    })
    return record.negotiation
  }

  private async runNegotiation(record: GuestLinkRecord): Promise<boolean> {
    this.closePeer(record)
    record.peerState = 'connecting'
    record.lastAttemptAt = Date.now()

    const connected = new Promise<void>((resolve) => {
      record.connected = resolve
    })

    let timer: NodeJS.Timeout | null = null
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SignalError('timeout')), DIRECT_CONNECT_TIMEOUT_MS)
    })

    try {
      await Promise.race([this.signal(record).then(() => connected), deadline])
      record.peerState = 'connected'
      record.failures = 0
      record.view = { ...record.view, transport: 'direct', fallbackReason: undefined }
      return true
    } catch (error) {
      this.closePeer(record)
      record.peerState = 'failed'
      record.failures += 1
      record.view = {
        ...record.view,
        transport: 'relay',
        fallbackReason: error instanceof SignalError ? error.code : 'direct_failed',
        updatedAt: nowIso(),
      }
      return false
    } finally {
      if (timer) clearTimeout(timer)
      record.connected = null
      this.notify()
    }
  }

  private signal(record: GuestLinkRecord): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const ws = new WebSocket(this.signalUrl)
      const fail = (code: string) => {
        if (settled) return
        settled = true
        ws.close()
        reject(new SignalError(code))
      }

      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            type: 'RTC_JOIN',
            slug: record.join.slug,
            ticketId: record.join.ticketId,
            protocolVersion: SIGNAL_PROTOCOL_VERSION,
          }),
        )
      })
      ws.addEventListener('error', () => fail('signal_error'))
      ws.addEventListener('close', () => fail('signal_closed'))
      ws.addEventListener('message', (event: MessageEvent) => {
        void (async () => {
          if (settled || typeof event.data !== 'string') return
          let message: Record<string, unknown>
          try {
            message = JSON.parse(event.data) as Record<string, unknown>
          } catch {
            return fail('signal_protocol')
          }

          try {
            switch (message.type) {
              case 'RTC_READY': {
                const peerId = typeof message.peerId === 'string' ? message.peerId : ''
                if (!/^[a-f0-9]{8,64}$/.test(peerId)) return fail('signal_protocol')
                record.peerId = peerId
                await this.engine.createPeer(peerId, 'guest', readIceServers(message.iceServers))
                const sdp = await this.engine.makeOffer(peerId)
                if (settled || record.peerId !== peerId) return
                ws.send(JSON.stringify({ type: 'RTC_OFFER', sdp }))
                return
              }
              case 'RTC_ANSWER': {
                const peerId = record.peerId
                if (!peerId) return fail('signal_protocol')
                const sdp = readSdp(message)
                settled = true
                ws.close()
                try {
                  await this.engine.acceptAnswer(peerId, sdp)
                  resolve()
                } catch {
                  reject(new SignalError('rtc_failed'))
                }
                return
              }
              case 'ERROR':
                return fail(typeof message.code === 'string' ? message.code.toLowerCase() : 'signal_error')
              default:
                return fail('signal_protocol')
            }
          } catch {
            fail('rtc_failed')
          }
        })()
      })
    })
  }

  private listen(record: GuestLinkRecord): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.handleSocket(record, socket))
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        server.on('error', () => undefined)
        record.server = server
        resolve((server.address() as net.AddressInfo).port)
      })
    })
  }

  private handleSocket(record: GuestLinkRecord, socket: net.Socket): void {
    socket.setNoDelay(true)
    record.lastActivityAt = Date.now()

    if (routeGuestConnection(record.peerState) === 'direct' && record.peerId) {
      this.pipeDirect(record, record.peerId, socket)
      return
    }

    this.pipeRelay(record, socket)
    if (shouldRetryDirect(record.peerState, record.failures, record.lastAttemptAt, Date.now())) {
      void this.negotiate(record)
    }
  }

  private pipeDirect(record: GuestLinkRecord, peerId: string, socket: net.Socket): void {
    const channelId = record.nextChannelId++
    const connection: GuestConnection = {
      socket,
      channelId,
      open: false,
      pending: [],
      paused: false,
    }
    record.channels.set(channelId, connection)

    socket.on('data', (chunk: Buffer) => {
      record.lastActivityAt = Date.now()
      if (!connection.open) {
        connection.pending.push(chunk)
        return
      }
      this.engine.send(peerId, channelId, chunk)
      this.applyBackpressure(peerId, connection)
    })
    const cleanup = () => {
      if (record.channels.get(channelId) !== connection) return
      record.channels.delete(channelId)
      this.engine.closeChannel(peerId, channelId)
    }
    socket.on('close', cleanup)
    socket.on('error', cleanup)

    this.engine.openChannel(peerId, channelId).catch(() => socket.destroy())
  }

  private applyBackpressure(peerId: string, connection: GuestConnection): void {
    if (connection.paused) return
    if (this.engine.bufferedAmount(peerId, connection.channelId) <= RTC_BUFFER_HIGH) return
    connection.paused = true
    connection.socket.pause()
    const check = () => {
      if (connection.socket.destroyed) return
      if (this.engine.bufferedAmount(peerId, connection.channelId) <= RTC_BUFFER_LOW) {
        connection.paused = false
        connection.socket.resume()
        return
      }
      setTimeout(check, DRAIN_POLL_MS)
    }
    setTimeout(check, DRAIN_POLL_MS)
  }

  private pipeRelay(record: GuestLinkRecord, socket: net.Socket): void {
    record.relayed.add(socket)
    let buffered = Buffer.alloc(0)
    let upstream: net.Socket | null = null

    const close = () => {
      record.relayed.delete(socket)
      socket.destroy()
      upstream?.destroy()
    }
    socket.on('error', close)
    socket.on('close', close)

    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const rewritten = rewriteHandshakeHost(buffered, record.join.host, record.join.port)
      if (!rewritten) {
        if (buffered.length > MAX_HANDSHAKE_BYTES) close()
        return
      }
      socket.off('data', onData)
      socket.pause()
      upstream = net.createConnection({ host: record.join.host, port: record.join.port }, () => {
        upstream?.write(rewritten)
        socket.pipe(upstream as net.Socket)
        upstream?.pipe(socket)
        socket.resume()
      })
      upstream.setNoDelay(true)
      upstream.on('error', close)
      upstream.on('close', close)
    }
    socket.on('data', onData)
  }

  private readonly handleState = (peerId: string, state: string) => {
    const record = this.recordByPeer(peerId)
    if (!record) return
    if (state === 'connected') {
      record.connected?.()
      return
    }
    if ((state === 'failed' || state === 'closed') && record.peerState === 'connected') {
      this.closePeer(record)
      record.peerState = 'failed'
      record.failures += 1
      record.lastAttemptAt = Date.now()
      record.view = {
        ...record.view,
        transport: 'relay',
        rttMs: undefined,
        fallbackReason: `peer_${state}`,
        updatedAt: nowIso(),
      }
      this.notify()
    }
  }

  private readonly handleChannelOpen = (peerId: string, channelId: number) => {
    const connection = this.recordByPeer(peerId)?.channels.get(channelId)
    if (!connection || connection.open) return
    connection.open = true
    for (const chunk of connection.pending) this.engine.send(peerId, channelId, chunk)
    connection.pending = []
    this.applyBackpressure(peerId, connection)
  }

  private readonly handleChannelClose = (peerId: string, channelId: number) => {
    const record = this.recordByPeer(peerId)
    const connection = record?.channels.get(channelId)
    if (!record || !connection) return
    record.channels.delete(channelId)
    connection.socket.end()
  }

  private readonly handleData = (peerId: string, channelId: number, data: Buffer) => {
    const record = this.recordByPeer(peerId)
    const connection = record?.channels.get(channelId)
    if (!record || !connection) return
    record.lastActivityAt = Date.now()
    connection.socket.write(data)
  }

  private readonly handleGone = () => {
    for (const record of this.links.values()) {
      if (record.peerId) this.handleState(record.peerId, 'failed')
    }
  }

  private recordByPeer(peerId: string): GuestLinkRecord | undefined {
    for (const record of this.links.values()) {
      if (record.peerId === peerId) return record
    }
    return undefined
  }

  private closePeer(record: GuestLinkRecord): void {
    const peerId = record.peerId
    record.peerId = null
    for (const connection of record.channels.values()) connection.socket.destroy()
    record.channels.clear()
    if (peerId) this.engine.closePeer(peerId)
  }

  private closeLink(record: GuestLinkRecord): void {
    if (this.links.get(record.request.slug) === record) this.links.delete(record.request.slug)
    this.closePeer(record)
    for (const socket of record.relayed) socket.destroy()
    record.relayed.clear()
    record.server?.close()
    record.server = null
    record.view = { ...record.view, state: 'closed', updatedAt: nowIso() }
    this.notify()
    if (this.links.size === 0) this.stopTimers()
  }

  private startTimers(): void {
    if (!this.statsTimer) {
      this.statsTimer = setInterval(() => void this.refreshStats(), STATS_INTERVAL_MS)
    }
    if (!this.relayPingTimer) {
      this.relayPingTimer = setInterval(() => void this.refreshRelayPing(), RELAY_PING_INTERVAL_MS)
      setTimeout(() => void this.refreshRelayPing(), 1000)
    }
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    }
  }

  private stopTimers(): void {
    for (const timer of [this.statsTimer, this.relayPingTimer, this.sweepTimer]) {
      if (timer) clearInterval(timer)
    }
    this.statsTimer = null
    this.relayPingTimer = null
    this.sweepTimer = null
  }

  private async refreshStats(): Promise<void> {
    for (const record of [...this.links.values()]) {
      const peerId = record.peerId
      if (!peerId || record.peerState !== 'connected') continue
      try {
        const stats = await this.engine.stats(peerId)
        if (record.peerId !== peerId) continue
        const transport: ShareTransport = classifyPath(stats)
        const rttMs = roundRtt(stats.rttSeconds)
        if (record.view.transport === transport && record.view.rttMs === rttMs) continue
        record.view = { ...record.view, transport, rttMs, updatedAt: nowIso() }
        this.notify()
      } catch {
        continue
      }
    }
  }

  private async refreshRelayPing(): Promise<void> {
    for (const record of [...this.links.values()]) {
      if (record.view.transport !== 'relay' || record.view.state !== 'connected') continue
      const result = await pingServer(`${record.join.host}:${record.join.port}`, 4000)
      if (this.links.get(record.request.slug) !== record || record.view.transport !== 'relay') {
        continue
      }
      const rttMs = result.online ? result.latencyMs : undefined
      if (record.view.rttMs === rttMs) continue
      record.view = { ...record.view, rttMs, updatedAt: nowIso() }
      this.notify()
    }
  }

  private sweep(): void {
    const gameRunning = gameProcesses.size > 0
    const now = Date.now()
    for (const record of [...this.links.values()]) {
      const busy = record.channels.size > 0 || record.relayed.size > 0
      if (busy || (gameRunning && !record.server)) {
        record.lastActivityAt = now
        continue
      }
      const idleMs = now - record.lastActivityAt
      const noGame = !gameRunning && now - record.createdAt > NO_GAME_GRACE_MS
      if ((noGame && idleMs > NO_GAME_IDLE_MS) || idleMs > IDLE_CLOSE_MS) {
        this.closeLink(record)
      }
    }
  }

  private notify(): void {
    this.emit('changed', this.list())
  }
}
