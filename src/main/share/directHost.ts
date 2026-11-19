import type { ShareVisibility } from '@/types/Share'
import type { RtcEngine } from './rtcEngine'
import type { LocalProxyManager, LocalProxyTransport, StreamLink } from './LocalProxyManager'
import type { RtcOfferMessage } from './shareProtocol'
import { MAX_HANDSHAKE_BYTES, readHandshake } from './mcHandshake'
import {
  checkDirectLogin,
  classifyPath,
  decideHostOffer,
  roundRtt,
  type DirectPolicy,
} from './transportChoice'

export const DIRECT_STREAM_ID_BASE = 2 ** 40

const STATS_INTERVAL_MS = 5000
const HANDSHAKE_WAIT_MS = 10_000
const PEER_CONNECT_TIMEOUT_MS = 30_000

interface HostChannel {
  streamId: number
  pending: Buffer[]
  pendingBytes: number
  opened: boolean
  timer: NodeJS.Timeout | null
}

interface HostPeer {
  peerId: string
  guestUserId?: string
  guestUsername?: string
  hostNickname?: string
  connected: boolean
  channels: Map<number, HostChannel>
  link: StreamLink
  connectTimer: NodeJS.Timeout | null
}

export interface DirectHostDeps {
  policy: () => DirectPolicy
  visibility: () => ShareVisibility | undefined
  isSharing: () => boolean
  sendAnswer: (peerId: string, sdp: string) => void
  sendReject: (peerId: string, reason: string) => void
}

export class DirectHost {
  private readonly peers = new Map<string, HostPeer>()
  private nextStreamId = DIRECT_STREAM_ID_BASE
  private statsTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly engine: RtcEngine,
    private readonly proxy: LocalProxyManager,
    private readonly deps: DirectHostDeps,
  ) {
    engine.on('state', this.handleState)
    engine.on('channelOpen', this.handleChannelOpen)
    engine.on('channelClose', this.handleChannelClose)
    engine.on('data', this.handleData)
    engine.on('gone', this.handleGone)
  }

  public async handleOffer(offer: RtcOfferMessage): Promise<void> {
    const decision = decideHostOffer(
      this.deps.policy(),
      this.deps.visibility(),
      this.deps.isSharing(),
    )
    if (!decision.accept) {
      this.deps.sendReject(offer.peerId, decision.reason)
      return
    }

    this.closePeer(offer.peerId, 'replaced')
    const peer: HostPeer = {
      peerId: offer.peerId,
      guestUserId: offer.guestUserId,
      guestUsername: offer.guestUsername,
      hostNickname: offer.hostNickname,
      connected: false,
      channels: new Map(),
      link: { transport: 'direct' },
      connectTimer: null,
    }
    this.peers.set(offer.peerId, peer)

    try {
      await this.engine.createPeer(offer.peerId, 'host', offer.iceServers)
      const sdp = await this.engine.answerOffer(offer.peerId, offer.sdp)
      if (this.peers.get(offer.peerId) !== peer) return
      this.deps.sendAnswer(offer.peerId, sdp)
      peer.connectTimer = setTimeout(() => {
        peer.connectTimer = null
        if (!peer.connected) this.closePeer(offer.peerId, 'connect_timeout')
      }, PEER_CONNECT_TIMEOUT_MS)
    } catch (error) {
      console.warn('[share:direct] could not answer an offer:', error)
      this.closePeer(offer.peerId, 'answer_failed')
      this.deps.sendReject(offer.peerId, 'answer_failed')
    }
  }

  public closeAll(reason: string): void {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId, reason)
  }

  public peerCount(): number {
    return this.peers.size
  }

  private closePeer(peerId: string, reason: string): void {
    const peer = this.peers.get(peerId)
    if (!peer) return
    this.peers.delete(peerId)
    if (peer.connectTimer) clearTimeout(peer.connectTimer)
    for (const channel of peer.channels.values()) {
      if (channel.timer) clearTimeout(channel.timer)
      if (channel.opened) this.proxy.closeStream(channel.streamId, reason, false)
    }
    peer.channels.clear()
    this.engine.closePeer(peerId)
    this.syncStatsTimer()
  }

  private transportFor(peerId: string, channelId: number): LocalProxyTransport {
    return {
      sendControl: (message) => {
        if (message.type === 'CLOSE_STREAM') this.engine.closeChannel(peerId, channelId)
      },
      sendBinary: (_streamId, payload) => this.engine.send(peerId, channelId, payload),
      isWritable: () => this.peers.get(peerId)?.channels.has(channelId) === true,
      getBufferedAmount: () => this.engine.bufferedAmount(peerId, channelId),
    }
  }

  private readonly handleState = (peerId: string, state: string) => {
    const peer = this.peers.get(peerId)
    if (!peer) return
    if (state === 'connected') {
      peer.connected = true
      if (peer.connectTimer) {
        clearTimeout(peer.connectTimer)
        peer.connectTimer = null
      }
      this.syncStatsTimer()
      void this.refreshStats()
      return
    }
    if (state === 'failed' || state === 'closed') this.closePeer(peerId, `peer_${state}`)
  }

  private readonly handleChannelOpen = (peerId: string, channelId: number) => {
    const peer = this.peers.get(peerId)
    if (!peer || peer.channels.has(channelId)) return
    const channel: HostChannel = {
      streamId: this.nextStreamId++,
      pending: [],
      pendingBytes: 0,
      opened: false,
      timer: null,
    }
    channel.timer = setTimeout(() => {
      channel.timer = null
      if (!channel.opened) this.dropChannel(peer, channelId)
    }, HANDSHAKE_WAIT_MS)
    peer.channels.set(channelId, channel)
  }

  private readonly handleChannelClose = (peerId: string, channelId: number) => {
    const peer = this.peers.get(peerId)
    const channel = peer?.channels.get(channelId)
    if (!peer || !channel) return
    peer.channels.delete(channelId)
    if (channel.timer) clearTimeout(channel.timer)
    if (channel.opened) this.proxy.closeStream(channel.streamId, 'peer_closed', false)
  }

  private readonly handleData = (peerId: string, channelId: number, data: Buffer) => {
    const peer = this.peers.get(peerId)
    const channel = peer?.channels.get(channelId)
    if (!peer || !channel) return

    if (channel.opened) {
      this.proxy.handleStreamData(channel.streamId, data)
      return
    }

    channel.pending.push(data)
    channel.pendingBytes += data.length
    const buffered = Buffer.concat(channel.pending)
    const read = readHandshake(buffered, MAX_HANDSHAKE_BYTES)
    if (read.status === 'need_more') {
      if (channel.pendingBytes > MAX_HANDSHAKE_BYTES) this.dropChannel(peer, channelId)
      return
    }
    if (read.status === 'invalid') {
      this.dropChannel(peer, channelId)
      return
    }

    const check = checkDirectLogin(read.handshake, peer.guestUsername, peer.hostNickname)
    if (!check.ok) {
      console.warn(`[share:direct] refused a direct login: ${check.reason}`)
      this.dropChannel(peer, channelId)
      return
    }

    channel.opened = true
    channel.pending = []
    if (channel.timer) {
      clearTimeout(channel.timer)
      channel.timer = null
    }
    void this.proxy.openStream(
      {
        type: 'OPEN_STREAM',
        streamId: channel.streamId,
        peerIp: '0.0.0.0',
        peerPort: 0,
        initialDataBase64: buffered.toString('base64'),
        guestUserId: peer.guestUserId,
        guestUsername: check.statusPing ? undefined : check.username,
        statusPing: check.statusPing,
      },
      { transport: this.transportFor(peerId, channelId), link: peer.link },
    )
  }

  private readonly handleGone = () => {
    for (const peerId of [...this.peers.keys()]) this.closePeer(peerId, 'rtc_window_gone')
  }

  private dropChannel(peer: HostPeer, channelId: number): void {
    const channel = peer.channels.get(channelId)
    if (!channel) return
    peer.channels.delete(channelId)
    if (channel.timer) clearTimeout(channel.timer)
    this.engine.closeChannel(peer.peerId, channelId)
  }

  private syncStatsTimer(): void {
    const anyConnected = [...this.peers.values()].some((peer) => peer.connected)
    if (anyConnected && !this.statsTimer) {
      this.statsTimer = setInterval(() => void this.refreshStats(), STATS_INTERVAL_MS)
    } else if (!anyConnected && this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
  }

  private async refreshStats(): Promise<void> {
    for (const peer of [...this.peers.values()]) {
      if (!peer.connected) continue
      try {
        const stats = await this.engine.stats(peer.peerId)
        if (this.peers.get(peer.peerId) !== peer) continue
        peer.link = {
          transport: classifyPath(stats),
          rttMs: roundRtt(stats.rttSeconds),
        }
        for (const channel of peer.channels.values()) {
          if (channel.opened) this.proxy.setStreamLink(channel.streamId, peer.link)
        }
      } catch {}
    }
  }
}
