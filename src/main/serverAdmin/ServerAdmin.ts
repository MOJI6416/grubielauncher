import { EventEmitter } from 'events'
import type {
  ServerAdminAction,
  ServerAdminBan,
  ServerAdminEvent,
  ServerAdminFallback,
  ServerAdminGameRule,
  ServerAdminOperator,
  ServerAdminPlayer,
  ServerAdminResult,
  ServerAdminSnapshot,
} from '@/types/ServerAdmin'
import { emptyServerAdminSnapshot } from '@/types/ServerAdmin'
import { MsmpClient, MSMP_NOTIFICATION_PREFIX } from './msmpClient'
import type { MsmpPlan } from './msmpSetup'
import {
  isPlayerName,
  logMessage,
  parseGameruleAnswer,
  parseJoinLeave,
  parseListHeader,
  readAllowlist,
  readAllowlistEnabled,
  readBans,
  readOperators,
  sortRules,
  splitNames,
  stdinCommand,
  STDIN_GAMERULES,
  toGameruleValue,
} from './stdinParse'

export interface ServerAdminIo {
  send: (line: string, echo: boolean) => boolean
}

type MsmpList = 'players' | 'operators' | 'allowlist' | 'bans' | 'allowlistEnabled' | 'gamerules'

const CONNECT_ATTEMPTS = 8
const CONNECT_RETRY_MS = 1000
const STDIN_RELOAD_MS = 500
const GAMERULE_ANSWER_MS = 3000
const BAN_SOURCE = 'Grubie Launcher'
const LIST_CHANGE_PATTERN = /operator|whitelist|allowlist|banned|unbanned|pardon|opped|de-opped/i

function asArray(value: unknown, key?: string): unknown[] {
  if (Array.isArray(value)) return value
  if (key && value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[key])) {
    return (value as Record<string, unknown[]>)[key]
  }
  return []
}

function toPlayer(value: unknown): ServerAdminPlayer | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { name?: unknown; id?: unknown }
  const name = typeof record.name === 'string' ? record.name : ''
  const id = typeof record.id === 'string' ? record.id : undefined
  if (!name && !id) return null
  return { name: name || id || '', id }
}

function firstParam(params: unknown): unknown {
  if (Array.isArray(params)) return params[0]
  if (params && typeof params === 'object') return Object.values(params)[0]
  return undefined
}

function samePlayer(a: ServerAdminPlayer, b: ServerAdminPlayer): boolean {
  if (a.id && b.id) return a.id.toLowerCase() === b.id.toLowerCase()
  return a.name.toLowerCase() === b.name.toLowerCase()
}

export function toGameRule(value: unknown): ServerAdminGameRule | null {
  if (!value || typeof value !== 'object') return null
  const record = value as { key?: unknown; type?: unknown; value?: unknown }
  if (typeof record.key !== 'string') return null
  const raw = record.value
  const type: 'boolean' | 'integer' =
    record.type === 'integer' || record.type === 'int'
      ? 'integer'
      : record.type === 'boolean' || record.type === 'bool'
        ? 'boolean'
        : typeof raw === 'number' || (typeof raw === 'string' && /^-?\d+$/.test(raw))
          ? 'integer'
          : 'boolean'
  return {
    key: record.key,
    type,
    value: toGameruleValue(type, raw as string | number | boolean),
  }
}

export class ServerAdmin extends EventEmitter {
  private state: ServerAdminSnapshot
  private client: MsmpClient | null = null
  private protocolMajor = 0
  private awaitingListNames = false
  private reloadTimer: NodeJS.Timeout | null = null
  private gameruleWaiters = new Map<string, (value: string) => void>()
  private disposed = false

  constructor(
    private readonly serverPath: string,
    private readonly io: ServerAdminIo,
    private readonly plan: MsmpPlan | null,
    fallback: ServerAdminFallback,
  ) {
    super()
    this.state = {
      ...emptyServerAdminSnapshot(serverPath),
      mode: plan ? 'msmp' : 'stdin',
      connecting: !!plan,
      secure: !!plan?.tls,
      fallback: plan ? null : fallback,
    }
  }

  snapshot(): ServerAdminSnapshot {
    return {
      ...this.state,
      players: [...this.state.players],
      operators: [...this.state.operators],
      allowlist: [...this.state.allowlist],
      bans: [...this.state.bans],
      gamerules: [...this.state.gamerules],
    }
  }

  async start(): Promise<void> {
    if (this.plan) {
      const connected = await this.connectMsmp(this.plan)
      if (connected || this.disposed) return
      this.state = {
        ...this.state,
        mode: 'stdin',
        connecting: false,
        secure: false,
        fallback: 'connect_failed',
      }
    }
    await this.initStdin()
  }

  handleOutput(line: string): void {
    if (this.disposed) return
    const message = logMessage(line)

    if (this.awaitingListNames) {
      this.awaitingListNames = false
      this.setPlayers(splitNames(message).map((name) => ({ name })), 'changed')
      return
    }

    const gamerule = parseGameruleAnswer(message)
    if (gamerule) {
      const waiter = this.gameruleWaiters.get(gamerule.key)
      if (waiter) {
        this.gameruleWaiters.delete(gamerule.key)
        waiter(gamerule.value)
      }
      return
    }

    if (this.state.mode !== 'stdin') return

    const joinLeave = parseJoinLeave(message)
    if (joinLeave) {
      const player = { name: joinLeave.name }
      const others = this.state.players.filter((entry) => !samePlayer(entry, player))
      this.setPlayers(
        joinLeave.event === 'joined' ? [...others, player] : others,
        joinLeave.event,
        player,
      )
      return
    }

    const list = parseListHeader(message)
    if (list) {
      if (list.names) this.setPlayers(list.names.map((name) => ({ name })), 'changed')
      else this.awaitingListNames = true
      return
    }

    if (LIST_CHANGE_PATTERN.test(message)) this.scheduleStdinReload()
  }

  async perform(action: ServerAdminAction): Promise<ServerAdminResult> {
    if (this.disposed) return { ok: false, error: 'server_not_running' }
    if ('name' in action && !isPlayerName(action.name)) {
      return { ok: false, error: 'invalid_player' }
    }

    try {
      if (this.state.mode === 'msmp' && this.client?.isOpen) {
        await this.performMsmp(action)
      } else {
        const command = stdinCommand(action)
        if (!command) return { ok: false, error: 'invalid_action' }
        if (!this.io.send(command, true)) return { ok: false, error: 'server_not_running' }
        if (action.type === 'gamerule') this.updateRule(action.key, action.value)
        if (action.type === 'allowlistEnabled') {
          this.state = { ...this.state, allowlistEnabled: action.enabled }
        }
        this.scheduleStdinReload()
      }
      this.emitChanged()
      return { ok: true, snapshot: this.snapshot() }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        snapshot: this.snapshot(),
      }
    }
  }

  async refreshGamerules(): Promise<ServerAdminSnapshot> {
    if (this.disposed) return this.snapshot()

    if (this.state.mode === 'msmp' && this.client?.isOpen) {
      await this.reloadMsmp(['gamerules']).catch(() => undefined)
      return this.snapshot()
    }

    const answers = await Promise.all(
      STDIN_GAMERULES.map((rule) => this.askGamerule(rule.key)),
    )
    const rules: ServerAdminGameRule[] = []
    STDIN_GAMERULES.forEach((rule, index) => {
      const answer = answers[index]
      if (answer === null) return
      rules.push({ key: rule.key, type: rule.type, value: toGameruleValue(rule.type, answer) })
    })
    this.state = { ...this.state, gamerules: sortRules(rules), gamerulesLoaded: true }
    this.emitChanged()
    return this.snapshot()
  }

  async refresh(): Promise<ServerAdminSnapshot> {
    if (this.state.mode === 'msmp' && this.client?.isOpen) {
      await this.reloadMsmp(['players', 'operators', 'allowlist', 'bans', 'allowlistEnabled']).catch(
        () => undefined,
      )
    } else if (this.state.mode === 'stdin') {
      await this.reloadStdinLists()
      this.io.send('list', false)
    }
    this.emitChanged()
    return this.snapshot()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    for (const waiter of this.gameruleWaiters.values()) waiter('')
    this.gameruleWaiters.clear()
    this.client?.removeAllListeners()
    this.client?.close()
    this.client = null
    this.removeAllListeners()
  }

  private async connectMsmp(plan: MsmpPlan): Promise<boolean> {
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS && !this.disposed; attempt++) {
      try {
        const client = await MsmpClient.connect({
          host: plan.host,
          port: plan.port,
          secret: plan.secret,
          tls: plan.tls,
          fingerprint256: plan.fingerprint256,
        })
        if (this.disposed) {
          client.close()
          return false
        }
        this.client = client
        client.on('notification', (method: string, params: unknown) =>
          this.handleNotification(method, params),
        )
        client.on('error', () => undefined)
        client.on('close', () => {
          if (this.client === client) this.client = null
        })

        const discovered = await client
          .call<{ info?: { version?: string } }>('rpc.discover')
          .catch(() => null)
        this.protocolMajor = Number(/^(\d+)/.exec(discovered?.info?.version ?? '')?.[1] ?? 0)

        this.state = { ...this.state, mode: 'msmp', connecting: false, fallback: null }
        await this.reloadMsmp([
          'players',
          'operators',
          'allowlist',
          'bans',
          'allowlistEnabled',
          'gamerules',
        ])
        this.emitChanged()
        return true
      } catch (error) {
        if (attempt === CONNECT_ATTEMPTS - 1) {
          console.warn('[server:msmp] management server is not reachable:', error)
        }
        await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS))
      }
    }
    return false
  }

  private async reloadMsmp(lists: MsmpList[]): Promise<void> {
    const client = this.client
    if (!client) return

    const results = await Promise.allSettled(
      lists.map(async (list) => {
        switch (list) {
          case 'players': {
            const players = asArray(await client.call('minecraft:players'), 'players')
            this.state = {
              ...this.state,
              players: players.flatMap((entry) => toPlayer(entry) ?? []),
            }
            break
          }
          case 'operators': {
            const operators = asArray(await client.call('minecraft:operators'), 'operators')
            this.state = {
              ...this.state,
              operators: operators.flatMap((entry): ServerAdminOperator[] => {
                const record = entry as Record<string, unknown>
                const player = toPlayer(record?.player)
                if (!player) return []
                return [{
                  ...player,
                  permissionLevel:
                    typeof record.permissionLevel === 'number' ? record.permissionLevel : undefined,
                  bypassesPlayerLimit:
                    typeof record.bypassesPlayerLimit === 'boolean'
                      ? record.bypassesPlayerLimit
                      : undefined,
                }]
              }),
            }
            break
          }
          case 'allowlist': {
            const allowlist = asArray(await client.call('minecraft:allowlist'), 'allowlist')
            this.state = {
              ...this.state,
              allowlist: allowlist.flatMap((entry) => toPlayer(entry) ?? []),
            }
            break
          }
          case 'bans': {
            const bans = asArray(await client.call('minecraft:bans'), 'banlist')
            this.state = {
              ...this.state,
              bans: bans.flatMap((entry): ServerAdminBan[] => {
                const record = entry as Record<string, unknown>
                const player = toPlayer(record?.player)
                if (!player) return []
                return [{
                  ...player,
                  reason: typeof record.reason === 'string' ? record.reason : undefined,
                  source: typeof record.source === 'string' ? record.source : undefined,
                  expires: typeof record.expires === 'string' ? record.expires : undefined,
                }]
              }),
            }
            break
          }
          case 'allowlistEnabled': {
            const value = await client.call<unknown>('minecraft:serversettings/use_allowlist')
            const enabled =
              typeof value === 'boolean'
                ? value
                : typeof (value as { used?: unknown })?.used === 'boolean'
                  ? (value as { used: boolean }).used
                  : null
            this.state = { ...this.state, allowlistEnabled: enabled }
            break
          }
          case 'gamerules': {
            const rules = asArray(await client.call('minecraft:gamerules'), 'gamerules')
            this.state = {
              ...this.state,
              gamerules: sortRules(rules.flatMap((entry) => toGameRule(entry) ?? [])),
              gamerulesLoaded: true,
            }
            break
          }
        }
      }),
    )

    const failed = results.find((result) => result.status === 'rejected')
    if (failed && failed.status === 'rejected' && results.every((r) => r.status === 'rejected')) {
      throw failed.reason
    }
  }

  private async performMsmp(action: ServerAdminAction): Promise<void> {
    const client = this.client
    if (!client) throw new Error('server_not_running')

    switch (action.type) {
      case 'kick':
        await client.call('minecraft:players/kick', [[{
          player: { name: action.name },
          ...(action.message ? { message: { literal: action.message } } : {}),
        }]])
        await this.reloadMsmp(['players'])
        return
      case 'ban':
        await client.call('minecraft:bans/add', [[{
          player: { name: action.name },
          source: BAN_SOURCE,
          ...(action.reason ? { reason: action.reason } : {}),
        }]])
        await this.reloadMsmp(['bans', 'players'])
        return
      case 'pardon':
        await client.call('minecraft:bans/remove', [[{ name: action.name }]])
        await this.reloadMsmp(['bans'])
        return
      case 'op':
        await client.call('minecraft:operators/add', [[{ player: { name: action.name } }]])
        await this.reloadMsmp(['operators'])
        return
      case 'deop':
        await client.call('minecraft:operators/remove', [[{ name: action.name }]])
        await this.reloadMsmp(['operators'])
        return
      case 'allowlistAdd':
        await client.call('minecraft:allowlist/add', [[{ name: action.name }]])
        await this.reloadMsmp(['allowlist'])
        return
      case 'allowlistRemove':
        await client.call('minecraft:allowlist/remove', [[{ name: action.name }]])
        await this.reloadMsmp(['allowlist'])
        return
      case 'allowlistEnabled':
        await client.call('minecraft:serversettings/use_allowlist/set', [action.enabled])
        await this.reloadMsmp(['allowlistEnabled'])
        return
      case 'gamerule': {
        const value =
          this.protocolMajor > 0 && this.protocolMajor < 2 ? String(action.value) : action.value
        const updated = toGameRule(
          await client.call('minecraft:gamerules/update', [{ key: action.key, value }]),
        )
        if (updated) this.updateRule(updated.key, updated.value)
        else this.updateRule(action.key, action.value)
        return
      }
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (!method.startsWith(MSMP_NOTIFICATION_PREFIX)) return
    const event = method.slice(MSMP_NOTIFICATION_PREFIX.length)
    const payload = firstParam(params)

    switch (event) {
      case 'players/joined':
      case 'players/left': {
        const player = toPlayer(payload)
        if (!player) return
        const others = this.state.players.filter((entry) => !samePlayer(entry, player))
        const joined = event === 'players/joined'
        this.setPlayers(joined ? [...others, player] : others, joined ? 'joined' : 'left', player)
        return
      }
      case 'server/status': {
        const players = asArray((payload as { players?: unknown })?.players)
        this.setPlayers(players.flatMap((entry) => toPlayer(entry) ?? []), 'changed')
        return
      }
      case 'operators/added':
      case 'operators/removed':
        void this.reloadMsmp(['operators']).then(() => this.emitChanged(), () => undefined)
        return
      case 'allowlist/added':
      case 'allowlist/removed':
        void this.reloadMsmp(['allowlist']).then(() => this.emitChanged(), () => undefined)
        return
      case 'bans/added':
      case 'bans/removed':
        void this.reloadMsmp(['bans']).then(() => this.emitChanged(), () => undefined)
        return
      case 'gamerules/updated': {
        const rule = toGameRule(payload)
        if (rule) {
          this.updateRule(rule.key, rule.value)
          this.emitChanged()
        }
        return
      }
      default:
        return
    }
  }

  private async initStdin(): Promise<void> {
    await this.reloadStdinLists()
    this.emitChanged()
    this.io.send('list', false)
  }

  private async reloadStdinLists(): Promise<void> {
    const [operators, allowlist, bans, allowlistEnabled] = await Promise.all([
      readOperators(this.serverPath),
      readAllowlist(this.serverPath),
      readBans(this.serverPath),
      readAllowlistEnabled(this.serverPath),
    ])
    if (this.disposed) return
    this.state = {
      ...this.state,
      operators,
      allowlist,
      bans,
      allowlistEnabled: allowlistEnabled ?? this.state.allowlistEnabled,
    }
  }

  private scheduleStdinReload(): void {
    if (this.state.mode !== 'stdin') return
    if (this.reloadTimer) clearTimeout(this.reloadTimer)
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      void this.reloadStdinLists().then(() => this.emitChanged())
    }, STDIN_RELOAD_MS)
  }

  private askGamerule(key: string): Promise<string | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.gameruleWaiters.delete(key)
        resolve(null)
      }, GAMERULE_ANSWER_MS)
      this.gameruleWaiters.set(key, (value) => {
        clearTimeout(timer)
        resolve(value || null)
      })
      if (!this.io.send(`gamerule ${key}`, false)) {
        clearTimeout(timer)
        this.gameruleWaiters.delete(key)
        resolve(null)
      }
    })
  }

  private updateRule(key: string, value: boolean | number | null): void {
    const exists = this.state.gamerules.some((rule) => rule.key === key)
    if (!exists) return
    this.state = {
      ...this.state,
      gamerules: this.state.gamerules.map((rule) =>
        rule.key === key
          ? { ...rule, value: value === null ? null : toGameruleValue(rule.type, value) }
          : rule,
      ),
    }
  }

  private setPlayers(
    players: ServerAdminPlayer[],
    kind: ServerAdminEvent['kind'],
    player?: ServerAdminPlayer,
  ): void {
    this.state = { ...this.state, players }
    this.emit('event', { serverPath: this.serverPath, kind, player, snapshot: this.snapshot() })
  }

  private emitChanged(): void {
    if (this.disposed) return
    this.emit('event', {
      serverPath: this.serverPath,
      kind: 'changed',
      snapshot: this.snapshot(),
    } satisfies ServerAdminEvent)
  }
}
