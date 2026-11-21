import { EventEmitter } from 'events'
import net from 'net'
import { randomBytes } from 'crypto'
import type {
  CompanionFriends,
  CompanionSelf,
  CompanionSession,
  CompanionToast,
  CompanionVoice
} from '@/shared/companion'
import {
  COMPANION_ENV_ADDRESS,
  COMPANION_ENV_STATS_DIR,
  COMPANION_ENV_TOKEN
} from '@/shared/companion'
import {
  COMPANION_MAX_LINE,
  COMPANION_WIRE_PROTOCOL,
  type CompanionHostMessage,
  type CompanionInbound,
  parseInbound,
  tokensMatch
} from './protocol'

const HELLO_TIMEOUT_MS = 5000
const MAX_PENDING_SOCKETS = 8

interface Registration {
  key: string
  token: string
  versionName: string
  instance: number
  socket: net.Socket | null
  mod: string
  host: string
  protocol: number
  avatars: Set<string>
  extraToasts: CompanionToast[]
  toasts: string
}

export type CompanionMessage = Exclude<CompanionInbound, { t: 'hello' }>

type BridgeEvents = {
  accept: (id: string, session: CompanionSession) => void
  kick: (key: string, session: CompanionSession) => void
  message: (message: CompanionMessage, session: CompanionSession) => void
  connected: (session: CompanionSession) => void
  status: (sessions: CompanionSession[]) => void
}

export interface CompanionAvatarSource {
  png(id: string, url: string): Promise<string | null>
}

export class CompanionBridge extends EventEmitter {
  private server: net.Server | null = null
  private listening: Promise<number> | null = null
  private readonly registrations = new Map<string, Registration>()
  private readonly pending = new Set<net.Socket>()
  private toasts: CompanionToast[] = []
  private friendsLine = JSON.stringify({ t: 'friends', online: [], offline: 0 })
  private voiceLine = JSON.stringify({ t: 'voice', active: false })
  private self: CompanionSelf | null = null
  private avatarUrls = new Map<string, string>()
  private avatarData = new Map<string, string>()
  private avatarSource: CompanionAvatarSource | null = null

  public setAvatarSource(source: CompanionAvatarSource): void {
    this.avatarSource = source
  }

  public setSelf(self: CompanionSelf | null): void {
    this.self = self
  }

  public override on<K extends keyof BridgeEvents>(event: K, listener: BridgeEvents[K]): this {
    return super.on(event, listener)
  }

  public async register(
    versionName: string,
    instance: number,
    statsDir: string
  ): Promise<Record<string, string>> {
    const port = await this.listen()
    const key = `${versionName}-${instance}`
    this.unregister(versionName, instance)
    const token = randomBytes(24).toString('hex')
    this.registrations.set(key, {
      key,
      token,
      versionName,
      instance,
      socket: null,
      mod: '',
      host: '',
      protocol: 1,
      avatars: new Set(),
      extraToasts: [],
      toasts: ''
    })
    return {
      [COMPANION_ENV_ADDRESS]: `127.0.0.1:${port}`,
      [COMPANION_ENV_TOKEN]: token,
      [COMPANION_ENV_STATS_DIR]: statsDir
    }
  }

  public unregister(versionName: string, instance: number): void {
    const key = `${versionName}-${instance}`
    const existing = this.registrations.get(key)
    if (!existing) return
    this.registrations.delete(key)
    if (existing.socket) {
      existing.socket.destroy()
      existing.socket = null
      this.emitStatus()
    }
  }

  public sessions(): CompanionSession[] {
    return [...this.registrations.values()]
      .filter((entry) => entry.socket)
      .map((entry) => ({
        versionName: entry.versionName,
        instance: entry.instance,
        mod: entry.mod
      }))
  }

  public isConnected(versionName: string, instance: number): boolean {
    return Boolean(this.registrations.get(`${versionName}-${instance}`)?.socket)
  }

  public setToasts(items: CompanionToast[]): void {
    this.toasts = items
    for (const entry of this.registrations.values()) this.writeToasts(entry)
  }

  public pushToast(versionName: string, instance: number, toast: CompanionToast): void {
    const entry = this.registrations.get(`${versionName}-${instance}`)
    if (!entry) return
    entry.extraToasts = [...entry.extraToasts.filter((item) => item.id !== toast.id), toast].slice(-4)
    this.writeToasts(entry)
  }

  public setFriends(friends: CompanionFriends): void {
    const online = friends.online.map(({ avatarUrl, ...friend }) => {
      if (!avatarUrl) return friend
      this.rememberAvatar(friend.id, avatarUrl)
      return { ...friend, avatar: friend.id }
    })
    const line = JSON.stringify({ t: 'friends', online, offline: friends.offline })
    if (line === this.friendsLine) return
    this.friendsLine = line
    for (const entry of this.registrations.values()) {
      if (entry.protocol >= 2) this.write(entry, line)
    }
  }

  public setVoice(voice: CompanionVoice): void {
    const members = voice.members.map(({ avatarUrl, ...member }) => {
      if (!avatarUrl) return member
      this.rememberAvatar(member.id, avatarUrl)
      return { ...member, avatar: member.id }
    })
    const line = JSON.stringify({ t: 'voice', ...voice, members })
    if (line === this.voiceLine) return
    this.voiceLine = line
    for (const entry of this.registrations.values()) {
      if (entry.protocol >= 2) this.write(entry, line)
    }
  }

  public result(
    versionName: string,
    instance: number,
    req: string,
    ok: boolean,
    error?: string
  ): boolean {
    const entry = this.registrations.get(`${versionName}-${instance}`)
    if (!entry?.socket || entry.protocol < 2) return false
    return this.write(entry, JSON.stringify(error ? { t: 'result', req, ok, error } : { t: 'result', req, ok }))
  }

  private rememberAvatar(id: string, url: string): void {
    if (this.avatarUrls.get(id) === url && this.avatarData.has(id)) {
      for (const entry of this.registrations.values()) this.sendAvatar(entry, id)
      return
    }
    this.avatarUrls.set(id, url)
    const source = this.avatarSource
    if (!source) return
    void source.png(id, url).then((png) => {
      if (!png || this.avatarUrls.get(id) !== url) return
      this.avatarData.set(id, png)
      for (const entry of this.registrations.values()) {
        entry.avatars.delete(id)
        this.sendAvatar(entry, id)
      }
    })
  }

  private sendAvatar(entry: Registration, id: string): void {
    if (entry.protocol < 2 || entry.avatars.has(id)) return
    const png = this.avatarData.get(id)
    if (!png) return
    if (this.write(entry, JSON.stringify({ t: 'avatar', id, png }))) entry.avatars.add(id)
  }

  private writeToasts(entry: Registration): void {
    const items = [...this.toasts, ...entry.extraToasts].slice(-8)
    const line = JSON.stringify({ t: 'toasts', items })
    if (line === entry.toasts) return
    if (this.write(entry, line)) entry.toasts = line
  }

  public setHost(versionName: string, instance: number, message: CompanionHostMessage): void {
    const entry = this.registrations.get(`${versionName}-${instance}`)
    if (!entry) return
    const line = JSON.stringify(message)
    if (line === entry.host) return
    entry.host = line
    this.write(entry, line)
  }

  public connect(versionName: string, instance: number, address: string, name: string): boolean {
    const entry = this.registrations.get(`${versionName}-${instance}`)
    if (!entry?.socket) return false
    return this.write(entry, JSON.stringify({ t: 'connect', address, name }))
  }

  public async close(): Promise<void> {
    for (const entry of this.registrations.values()) entry.socket?.destroy()
    this.registrations.clear()
    for (const socket of this.pending) socket.destroy()
    this.pending.clear()
    const server = this.server
    this.server = null
    this.listening = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  }

  private listen(): Promise<number> {
    if (this.listening) return this.listening
    const server = net.createServer((socket) => this.accept(socket))
    server.maxConnections = 32
    this.server = server
    this.listening = new Promise<number>((resolve, reject) => {
      server.once('error', (error) => {
        this.server = null
        this.listening = null
        reject(error)
      })
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        resolve(typeof address === 'object' && address ? address.port : 0)
      })
    })
    return this.listening
  }

  private accept(socket: net.Socket): void {
    if (this.pending.size >= MAX_PENDING_SOCKETS) {
      socket.destroy()
      return
    }
    this.pending.add(socket)
    socket.setNoDelay(true)
    socket.setEncoding('utf8')

    let buffer = ''
    let owner: Registration | null = null
    const timer = setTimeout(() => {
      if (!owner) socket.destroy()
    }, HELLO_TIMEOUT_MS)

    const onLine = (line: string) => {
      const message = parseInbound(line)
      if (!message) return
      if (!owner) {
        owner = this.authenticate(socket, message)
        if (!owner) socket.destroy()
        return
      }
      this.dispatch(owner, message)
    }

    socket.on('data', (chunk: string) => {
      buffer += chunk
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line) onLine(line)
        if (socket.destroyed) return
        newline = buffer.indexOf('\n')
      }
      if (buffer.length > COMPANION_MAX_LINE) socket.destroy()
    })

    socket.on('error', () => {})
    socket.on('close', () => {
      clearTimeout(timer)
      this.pending.delete(socket)
      if (owner && owner.socket === socket) {
        owner.socket = null
        owner.host = ''
        this.emitStatus()
      }
    })
  }

  private authenticate(socket: net.Socket, message: CompanionInbound): Registration | null {
    if (message.t !== 'hello') return null
    const entry = [...this.registrations.values()].find((candidate) =>
      tokensMatch(candidate.token, message.token)
    )
    if (!entry) return null

    this.pending.delete(socket)
    if (entry.socket && entry.socket !== socket) entry.socket.destroy()
    entry.socket = socket
    entry.mod = message.mod
    entry.host = ''
    entry.toasts = ''
    entry.avatars = new Set()
    entry.protocol = Math.min(message.protocol, COMPANION_WIRE_PROTOCOL)
    const self = this.self
    this.write(
      entry,
      JSON.stringify(
        self
          ? { t: 'welcome', protocol: entry.protocol, selfId: self.id, selfName: self.name }
          : { t: 'welcome', protocol: entry.protocol }
      )
    )
    if (entry.protocol >= 2) {
      for (const id of this.avatarData.keys()) this.sendAvatar(entry, id)
      this.write(entry, this.friendsLine)
      this.write(entry, this.voiceLine)
    }
    this.writeToasts(entry)
    const session = this.sessionOf(entry)
    this.emit('connected', session)
    this.emitStatus()
    return entry
  }

  private dispatch(entry: Registration, message: CompanionInbound): void {
    if (message.t === 'hello') return
    const session = this.sessionOf(entry)
    if (message.t === 'accept') {
      entry.extraToasts = entry.extraToasts.filter((toast) => toast.id !== message.id)
      this.emit('accept', message.id, session)
    } else if (message.t === 'kick') {
      this.emit('kick', message.key, session)
    } else {
      this.emit('message', message, session)
    }
  }

  private sessionOf(entry: Registration): CompanionSession {
    return { versionName: entry.versionName, instance: entry.instance, mod: entry.mod }
  }

  private write(entry: Registration, line: string): boolean {
    const socket = entry.socket
    if (!socket || socket.destroyed) return false
    try {
      socket.write(`${line}\n`)
      return true
    } catch {
      return false
    }
  }

  private emitStatus(): void {
    this.emit('status', this.sessions())
  }
}
