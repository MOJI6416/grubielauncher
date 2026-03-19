import en from '@/renderer/locales/en.json'
import ru from '@/renderer/locales/ru.json'
import uk from '@/renderer/locales/uk.json'
import { DISCORD_CLIENT_ID } from '@/shared/config'
import { RpcAccountContext, RpcRendererContext } from '@/types/Rpc'
import { ShareState } from '@/types/Share'
import * as DiscordRPC from 'discord-rpc'
import { gameRuntime } from './runtime'

type SupportedRpcLanguage = 'en' | 'ru' | 'uk'

type RpcLocale = {
  buttons: {
    download: string
    discord: string
  }
  details: {
    launcher: string
  }
  states: {
    idle: string
    launching: string
    playing: string
    playingServer: string
  }
}

type LaunchActivity = {
  key: string
  versionName: string
  instance: number
  serverAddress?: string
  startedAt: Date
}

type GameActivity = {
  key: string
  versionName: string
  instance: number
  serverAddress?: string
  startedAt: Date
}

type PublicShareActivity = {
  key: string
  publicAddress: string
}

const rpcLocales: Record<SupportedRpcLanguage, RpcLocale> = {
  en: en.rpc,
  ru: ru.rpc,
  uk: uk.rpc
}

const MAX_ACTIVITY_TEXT_LENGTH = 128
const MAX_RECONNECT_DELAY = 30000

function normalizeLanguage(lang?: string): SupportedRpcLanguage {
  const normalized = (lang || 'en').toLowerCase().split('-')[0]
  if (normalized === 'ru' || normalized === 'uk') return normalized
  return 'en'
}

function truncateText(value?: string, maxLength = MAX_ACTIVITY_TEXT_LENGTH): string | undefined {
  if (!value) return undefined

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined

  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
    : normalized
}

function formatTemplate(
  template: string,
  values: Record<string, string | number | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''))
}

function toPresenceSignature(activity: DiscordRPC.Presence): string {
  return JSON.stringify({
    ...activity,
    startTimestamp:
      activity.startTimestamp instanceof Date
        ? activity.startTimestamp.getTime()
        : activity.startTimestamp
  })
}

export class RPC {
  private client: DiscordRPC.Client | null = null
  private isReady = false
  private isConnecting = false
  private isDisposed = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private syncQueue: Promise<void> = Promise.resolve()
  private lastPresenceSignature = ''
  private lang: SupportedRpcLanguage = 'en'
  private account: RpcAccountContext | null = null
  private launchingGame: LaunchActivity | null = null
  private runningGames = new Map<string, GameActivity>()
  private publicShare: PublicShareActivity | null = null

  async login() {
    this.isDisposed = false
    this.clearReconnectTimer()

    try {
      DiscordRPC.register(DISCORD_CLIENT_ID)
    } catch {}

    if (!this.client) {
      this.client = this.createClient()
    }

    await this.connect()
  }

  async dispose() {
    this.isDisposed = true
    this.isReady = false
    this.isConnecting = false
    this.clearReconnectTimer()
    this.lastPresenceSignature = ''

    if (this.client) {
      const client = this.client
      this.client = null

      try {
        await client.clearActivity()
      } catch {}

      try {
        client.removeAllListeners()
      } catch {}

      try {
        await client.destroy()
      } catch {}
    }
  }

  async syncContext(context: RpcRendererContext) {
    this.lang = normalizeLanguage(context.lang)
    this.account = context.account
    await this.queuePresenceSync()
  }

  setShareState(state: ShareState) {
    if (
      state.visibility === 'public' &&
      state.publicAddress &&
      state.target &&
      ['online', 'reconnecting'].includes(state.phase)
    ) {
      this.publicShare = {
        key: state.target.key,
        publicAddress: state.publicAddress,
      }
    } else {
      this.publicShare = null
    }

    void this.queuePresenceSync()
  }

  setGameLaunching({
    versionName,
    instance,
    serverAddress
  }: {
    versionName: string
    instance: number
    serverAddress?: string
  }) {
    this.launchingGame = {
      key: this.getGameKey(versionName, instance),
      versionName,
      instance,
      serverAddress,
      startedAt: new Date()
    }
    void this.queuePresenceSync()
  }

  setGamePlaying({
    versionName,
    instance,
    serverAddress
  }: {
    versionName: string
    instance: number
    serverAddress?: string
  }) {
    const key = this.getGameKey(versionName, instance)
    this.runningGames.set(key, {
      key,
      versionName,
      instance,
      serverAddress,
      startedAt: new Date()
    })

    if (this.launchingGame?.key === key) {
      this.launchingGame = null
    }

    void this.queuePresenceSync()
  }

  updateGameServer(versionName: string, instance: number, serverAddress?: string) {
    const key = this.getGameKey(versionName, instance)
    const activeGame = this.runningGames.get(key)

    if (activeGame) {
      this.runningGames.set(key, {
        ...activeGame,
        serverAddress
      })
    }

    if (this.launchingGame?.key === key) {
      this.launchingGame = {
        ...this.launchingGame,
        serverAddress
      }
    }

    void this.queuePresenceSync()
  }

  clearGameContext(versionName: string, instance: number) {
    const key = this.getGameKey(versionName, instance)
    this.runningGames.delete(key)

    if (this.launchingGame?.key === key) {
      this.launchingGame = null
    }

    void this.queuePresenceSync()
  }

  private getGameKey(versionName: string, instance: number): string {
    return gameRuntime.makeKey(versionName, instance)
  }

  private createClient(): DiscordRPC.Client {
    const client = new DiscordRPC.Client({ transport: 'ipc' })

    client.on('ready', () => {
      this.isReady = true
      this.reconnectAttempts = 0
      this.lastPresenceSignature = ''
      void this.queuePresenceSync()
    })

    client.on('disconnected', () => {
      this.isReady = false
      this.lastPresenceSignature = ''

      if (!this.isDisposed) {
        console.warn('Discord RPC disconnected')
        this.scheduleReconnect()
      }
    })

    client.on('error', (error) => {
      this.isReady = false
      this.lastPresenceSignature = ''

      if (!this.isDisposed) {
        console.warn('Discord RPC error', error)
        this.scheduleReconnect()
      }
    })

    return client
  }

  private async connect() {
    if (this.isDisposed || this.isReady || this.isConnecting) return

    if (!this.client) {
      this.client = this.createClient()
    }

    this.isConnecting = true

    try {
      await this.client.login({ clientId: DISCORD_CLIENT_ID })
    } catch (error) {
      if (!this.isDisposed) {
        console.warn('Failed to connect to Discord RPC', error)
        this.scheduleReconnect()
      }
    } finally {
      this.isConnecting = false
    }
  }

  private scheduleReconnect() {
    if (this.isDisposed || this.reconnectTimer) return

    const delay = Math.min(MAX_RECONNECT_DELAY, 1000 * 2 ** this.reconnectAttempts)
    this.reconnectAttempts += 1

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.reconnect()
    }, delay)
  }

  private async reconnect() {
    if (this.isDisposed) return

    await this.destroyClient()
    this.client = this.createClient()
    await this.connect()
  }

  private async destroyClient() {
    if (!this.client) return

    const client = this.client
    this.client = null
    this.isReady = false

    try {
      client.removeAllListeners()
    } catch {}

    try {
      await client.destroy()
    } catch {}
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private queuePresenceSync() {
    this.syncQueue = this.syncQueue
      .catch(() => {})
      .then(async () => {
        await this.applyPresence()
      })

    return this.syncQueue
  }

  private async applyPresence() {
    if (this.isDisposed || !this.isReady || !this.client) return

    const activity = this.buildActivity()
    const signature = toPresenceSignature(activity)

    if (signature === this.lastPresenceSignature) return

    try {
      await this.client.setActivity(activity)
      this.lastPresenceSignature = signature
    } catch (error) {
      this.lastPresenceSignature = ''

      if (!this.isDisposed) {
        console.warn('Failed to update Discord RPC activity', error)
        this.scheduleReconnect()
      }
    }
  }

  private buildActivity(): DiscordRPC.Presence {
    const locale = rpcLocales[this.lang]
    const activity: DiscordRPC.Presence = {
      details: locale.details.launcher,
      state: locale.states.idle,
      largeImageKey: 'icon',
      largeImageText: locale.details.launcher,
      instance: false,
      buttons: [
        {
          label: locale.buttons.download,
          url: 'https://api.grubielauncher.com/download'
        },
        {
          label: locale.buttons.discord,
          url: 'https://discord.gg/URrKha9hk7'
        }
      ]
    }

    const smallImageText = truncateText(this.account?.nickname)
    if (smallImageText) {
      activity.smallImageKey = 'steve'
      activity.smallImageText = smallImageText
    }

    const runningGame = this.getMostRecentRunningGame()
    if (runningGame) {
      const publicAddress =
        this.publicShare?.key === runningGame.key ? this.publicShare.publicAddress : undefined
      const serverAddress = publicAddress || runningGame.serverAddress

      activity.details = truncateText(runningGame.versionName) || locale.details.launcher
      activity.state = truncateText(
        serverAddress
          ? formatTemplate(locale.states.playingServer, {
              server: serverAddress
            })
          : locale.states.playing
      )
      activity.startTimestamp = runningGame.startedAt
      return activity
    }

    if (this.launchingGame) {
      activity.details = truncateText(this.launchingGame.versionName) || locale.details.launcher
      activity.state = locale.states.launching
      activity.startTimestamp = this.launchingGame.startedAt
      return activity
    }

    return activity
  }

  private getMostRecentRunningGame(): GameActivity | null {
    let latestGame: GameActivity | null = null

    for (const game of this.runningGames.values()) {
      if (!latestGame || latestGame.startedAt.getTime() < game.startedAt.getTime()) {
        latestGame = game
      }
    }

    return latestGame
  }
}
