import fs from 'fs-extra'
import path from 'path'
import type {
  ServerAdminBan,
  ServerAdminGameRule,
  ServerAdminOperator,
  ServerAdminPlayer,
} from '@/types/ServerAdmin'

const PLAYER_NAME = /^[A-Za-z0-9_.]{1,16}$/

export const STDIN_GAMERULES: { key: string; type: 'boolean' | 'integer' }[] = [
  { key: 'keepInventory', type: 'boolean' },
  { key: 'doDaylightCycle', type: 'boolean' },
  { key: 'doWeatherCycle', type: 'boolean' },
  { key: 'doMobSpawning', type: 'boolean' },
  { key: 'mobGriefing', type: 'boolean' },
  { key: 'doFireTick', type: 'boolean' },
  { key: 'naturalRegeneration', type: 'boolean' },
  { key: 'doInsomnia', type: 'boolean' },
  { key: 'doImmediateRespawn', type: 'boolean' },
  { key: 'announceAdvancements', type: 'boolean' },
  { key: 'showDeathMessages', type: 'boolean' },
  { key: 'playersSleepingPercentage', type: 'integer' },
  { key: 'spawnRadius', type: 'integer' },
  { key: 'randomTickSpeed', type: 'integer' },
]

export function isPlayerName(value: string): boolean {
  return PLAYER_NAME.test(value)
}

export function logMessage(line: string): string {
  const match = /^(?:\[[^\]]*\]\s*)+:\s?/.exec(line)
  return match ? line.slice(match[0].length) : line
}

export function parseJoinLeave(
  message: string,
): { name: string; event: 'joined' | 'left' } | null {
  const match = /^([A-Za-z0-9_.]{1,16}) (joined|left) the game$/.exec(message.trim())
  if (!match) return null
  return { name: match[1], event: match[2] as 'joined' | 'left' }
}

export function splitNames(value: string): string[] {
  return value
    .split(',')
    .map((name) => name.trim().replace(/\s*\(.*\)$/, ''))
    .filter((name) => isPlayerName(name))
}

export function parseListHeader(
  message: string,
): { online: number; names: string[] | null } | null {
  const modern = /^There are (\d+) of a max(?: of)? (\d+) players online:\s*(.*)$/.exec(message)
  const legacy = /^There are (\d+)\/(\d+) players online:\s*(.*)$/.exec(message)
  const match = modern ?? legacy
  if (!match) return null
  const online = Number(match[1])
  const tail = match[3].trim()
  if (online === 0) return { online, names: [] }
  return { online, names: tail ? splitNames(tail) : null }
}

export function parseGameruleAnswer(
  message: string,
): { key: string; value: string } | null {
  const match = /^Gamerule (\S+) is currently set to: (\S+)$/.exec(message.trim())
  return match ? { key: match[1], value: match[2] } : null
}

export function toGameruleValue(
  type: 'boolean' | 'integer',
  raw: string | number | boolean,
): boolean | number | null {
  if (type === 'boolean') {
    if (raw === true || raw === 'true') return true
    if (raw === false || raw === 'false') return false
    return null
  }
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? Math.trunc(value) : null
}

async function readJsonList(file: string): Promise<Record<string, unknown>[] | null> {
  const raw = await fs.readJSON(file).catch(() => null)
  return Array.isArray(raw) ? raw.filter((entry) => entry && typeof entry === 'object') : null
}

async function readTextNames(file: string): Promise<string[]> {
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  return text
    .split(/\r?\n/)
    .map((line) => line.split('|')[0].trim())
    .filter((name) => name && !name.startsWith('#') && isPlayerName(name))
}

function toPlayer(entry: Record<string, unknown>): ServerAdminPlayer | null {
  const name = typeof entry.name === 'string' ? entry.name : ''
  if (!name) return null
  return {
    name,
    id: typeof entry.uuid === 'string' ? entry.uuid : undefined,
  }
}

export async function readOperators(serverPath: string): Promise<ServerAdminOperator[]> {
  const list = await readJsonList(path.join(serverPath, 'ops.json'))
  if (list) {
    return list.flatMap((entry) => {
      const player = toPlayer(entry)
      if (!player) return []
      return [{
        ...player,
        permissionLevel: typeof entry.level === 'number' ? entry.level : undefined,
        bypassesPlayerLimit:
          typeof entry.bypassesPlayerLimit === 'boolean' ? entry.bypassesPlayerLimit : undefined,
      }]
    })
  }
  return (await readTextNames(path.join(serverPath, 'ops.txt'))).map((name) => ({ name }))
}

export async function readAllowlist(serverPath: string): Promise<ServerAdminPlayer[]> {
  const list = await readJsonList(path.join(serverPath, 'whitelist.json'))
  if (list) return list.flatMap((entry) => toPlayer(entry) ?? [])
  return (await readTextNames(path.join(serverPath, 'white-list.txt'))).map((name) => ({ name }))
}

export async function readBans(serverPath: string): Promise<ServerAdminBan[]> {
  const list = await readJsonList(path.join(serverPath, 'banned-players.json'))
  if (list) {
    return list.flatMap((entry) => {
      const player = toPlayer(entry)
      if (!player) return []
      return [{
        ...player,
        reason: typeof entry.reason === 'string' ? entry.reason : undefined,
        source: typeof entry.source === 'string' ? entry.source : undefined,
        expires:
          typeof entry.expires === 'string' && entry.expires !== 'forever'
            ? entry.expires
            : undefined,
      }]
    })
  }
  return (await readTextNames(path.join(serverPath, 'banned-players.txt'))).map((name) => ({ name }))
}

export async function readAllowlistEnabled(serverPath: string): Promise<boolean | null> {
  const text = await fs.readFile(path.join(serverPath, 'server.properties'), 'utf8').catch(() => null)
  if (text === null) return null
  const match = /^white-list\s*=\s*(\S+)/m.exec(text)
  return match ? match[1] === 'true' : false
}

export function stdinCommand(
  action:
    | { type: 'kick'; name: string; message?: string }
    | { type: 'ban'; name: string; reason?: string }
    | { type: 'pardon' | 'op' | 'deop' | 'allowlistAdd' | 'allowlistRemove'; name: string }
    | { type: 'allowlistEnabled'; enabled: boolean }
    | { type: 'gamerule'; key: string; value: boolean | number },
): string | null {
  const clean = (value: string | undefined) =>
    (value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)

  switch (action.type) {
    case 'kick':
      if (!isPlayerName(action.name)) return null
      return `kick ${action.name}${clean(action.message) ? ` ${clean(action.message)}` : ''}`
    case 'ban':
      if (!isPlayerName(action.name)) return null
      return `ban ${action.name}${clean(action.reason) ? ` ${clean(action.reason)}` : ''}`
    case 'pardon':
      return isPlayerName(action.name) ? `pardon ${action.name}` : null
    case 'op':
      return isPlayerName(action.name) ? `op ${action.name}` : null
    case 'deop':
      return isPlayerName(action.name) ? `deop ${action.name}` : null
    case 'allowlistAdd':
      return isPlayerName(action.name) ? `whitelist add ${action.name}` : null
    case 'allowlistRemove':
      return isPlayerName(action.name) ? `whitelist remove ${action.name}` : null
    case 'allowlistEnabled':
      return `whitelist ${action.enabled ? 'on' : 'off'}`
    case 'gamerule': {
      if (!/^[A-Za-z0-9_:.]{1,64}$/.test(action.key)) return null
      const value =
        typeof action.value === 'boolean'
          ? String(action.value)
          : Number.isFinite(action.value)
            ? String(Math.trunc(action.value))
            : null
      return value === null ? null : `gamerule ${action.key} ${value}`
    }
    default:
      return null
  }
}

export function sortRules(rules: ServerAdminGameRule[]): ServerAdminGameRule[] {
  return [...rules].sort((a, b) => a.key.localeCompare(b.key))
}
