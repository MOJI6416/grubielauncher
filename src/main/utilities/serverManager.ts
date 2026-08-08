import { IServerSettings, ServerSyncNotice } from '@/types/Server'
import path from 'path'
import fs from 'fs-extra'
import { BrowserWindow } from 'electron'
import { IVersionConf } from '@/types/IVersion'
import { getLauncherPaths } from './other'
import { readNBT } from './nbt'

export const AIKAR_FLAGS =
  '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 ' +
  '-XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch ' +
  '-XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M ' +
  '-XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 ' +
  '-XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 ' +
  '-XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 ' +
  '-XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 ' +
  '-Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true'

export async function setServerAikarFlags(serverPath: string, enabled: boolean) {
  for (const name of ['run.bat', 'run.sh', 'user_jvm_args.txt']) {
    const filePath = path.join(serverPath, name)
    if (!(await fs.pathExists(filePath))) continue

    let data = await fs.readFile(filePath, 'utf-8')
    const hasAikar = data.includes(AIKAR_FLAGS)

    if (enabled && !hasAikar) {
      data = data.replace(
        /-Xmx(\d+)([MG])/,
        (match, size, unit) => `-Xms${size}${unit} ${match} ${AIKAR_FLAGS}`
      )
    } else if (!enabled && hasAikar) {
      data = data.split(` ${AIKAR_FLAGS}`).join('').split(AIKAR_FLAGS).join('')
      data = data.replace(/-Xms\d+[MG]\s+(?=-Xmx)/, '')
    } else {
      continue
    }

    await fs.writeFile(filePath, data, 'utf-8')
  }
}

export const SERVER_LAUNCH_ENTRIES = [
  'run.bat',
  'run.sh',
  'user_jvm_args.txt',
  'libraries'
]

export const SERVER_PROTECTED_ENTRIES = [
  'server.properties',
  'eula.txt',
  'ops.json',
  'whitelist.json',
  'banned-players.json',
  'banned-ips.json',
  'usercache.json',
  'world',
  'world_nether',
  'world_the_end',
  'logs',
  'crash-reports',
  ...SERVER_LAUNCH_ENTRIES
]

const SERVER_SYNC_BACKUP_DIR = 'storage/sync-backups'
const SERVER_SYNC_BACKUP_TTL_MS = 14 * 24 * 60 * 60 * 1000

function isProtectedServerEntry(entry: string): boolean {
  return SERVER_PROTECTED_ENTRIES.includes(entry.toLowerCase())
}

function isLaunchServerEntry(entry: string): boolean {
  return SERVER_LAUNCH_ENTRIES.includes(entry.toLowerCase())
}

async function backupBeforeOverwrite(serverPath: string, entry: string) {
  const destination = path.join(serverPath, entry)
  if (!(await fs.pathExists(destination))) return

  const backupRoot = path.join(serverPath, ...SERVER_SYNC_BACKUP_DIR.split('/'))
  await fs.ensureDir(backupRoot)
  await pruneSyncBackups(backupRoot)

  const target = path.join(backupRoot, `${Date.now()}-${entry}`)
  await fs.copy(destination, target, { overwrite: true })
}

async function pruneSyncBackups(backupRoot: string) {
  const entries = await fs.readdir(backupRoot).catch(() => [] as string[])
  const cutoff = Date.now() - SERVER_SYNC_BACKUP_TTL_MS

  for (const entry of entries) {
    const match = /^(\d{13})-/.exec(entry)
    if (!match) continue
    if (Number(match[1]) >= cutoff) continue

    await fs.remove(path.join(backupRoot, entry)).catch(() => {})
  }
}

const runningServers = new Set<string>()

export function setServerRunning(serverPath: string, running: boolean) {
  const key = path.resolve(serverPath)
  if (running) runningServers.add(key)
  else runningServers.delete(key)
}

async function isWorldSessionLocked(serverPath: string): Promise<boolean> {
  const lockPath = path.join(serverPath, 'world', 'session.lock')
  let descriptor: number | undefined

  try {
    descriptor = await fs.open(lockPath, 'r+')
    return false
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
  } finally {
    if (descriptor !== undefined) await fs.close(descriptor).catch(() => {})
  }
}

export async function isServerRunning(serverPath: string): Promise<boolean> {
  if (runningServers.has(path.resolve(serverPath))) return true
  return await isWorldSessionLocked(serverPath)
}

export interface ServerSyncResult {
  serverRunning: boolean
  copied: string[]
  errors: { entry: string; message: string }[]
}

function broadcastSyncNotice(notice: ServerSyncNotice) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue
    window.webContents.send('server:syncNotice', notice)
  }
}

export async function syncServerExtraFiles(
  versionPath: string,
  serverPath: string,
  syncDirs: string[]
): Promise<ServerSyncResult> {
  const result: ServerSyncResult = {
    serverRunning: false,
    copied: [],
    errors: []
  }

  if (!(await fs.pathExists(serverPath))) return result

  result.serverRunning = await isServerRunning(serverPath)

  const copyEntry = async (source: string, entry: string) => {
    try {
      await backupBeforeOverwrite(serverPath, entry)
      await fs.copy(source, path.join(serverPath, entry), { overwrite: true })
      result.copied.push(entry)
    } catch (error) {
      result.errors.push({
        entry,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  for (const dir of syncDirs) {
    if (isProtectedServerEntry(dir)) continue

    const source = path.join(versionPath, dir)
    if (!(await fs.pathExists(source))) continue

    await copyEntry(source, dir)
  }

  const serverOverrides = path.join(versionPath, 'storage', 'server-overrides')
  if (await fs.pathExists(serverOverrides)) {
    const entries = await fs.readdir(serverOverrides).catch(() => [] as string[])

    for (const entry of entries) {
      if (isLaunchServerEntry(entry)) continue

      if (
        isProtectedServerEntry(entry) &&
        (await fs.pathExists(path.join(serverPath, entry)))
      ) {
        continue
      }

      await copyEntry(path.join(serverOverrides, entry), entry)
    }
  }

  if (result.errors.length > 0) {
    console.error('[server:syncFiles] could not copy server files:', result.errors)
    broadcastSyncNotice({
      level: 'error',
      entries: result.errors.map((item) => item.entry),
      reason: result.errors[0].message
    })
  } else if (result.serverRunning && result.copied.length > 0) {
    broadcastSyncNotice({ level: 'info', entries: result.copied })
  }

  return result
}

export async function replaceXmxParameter(serverPath: string, memory: string) {
  function replace(data: string, memory: string): string {
    return data
      .replace(/-Xmx\d+[MG]/g, `-Xmx${memory}`)
      .replace(/-Xms\d+[MG]/g, `-Xms${memory}`)
  }

  async function edit(filePath: string, memory: string) {
    if (await fs.pathExists(filePath)) {
      let data = await fs.readFile(filePath, 'utf-8')
      if (data.includes('-Xmx') || data.includes('-Xms')) {
        data = replace(data, memory)
        await fs.writeFile(filePath, data, 'utf-8')
      }
    }
  }

  const batPath = path.join(serverPath, 'run.bat')
  const shPath = path.join(serverPath, 'run.sh')
  const jvmArgs = path.join(serverPath, 'user_jvm_args.txt')

  await edit(batPath, memory)
  await edit(shPath, memory)
  await edit(jvmArgs, memory)
}

function escapePropertyValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/[\r\n]+/g, ' ')
}

function unescapePropertyValue(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, sequence: string) => {
    if (sequence[0] === 'u') {
      return String.fromCharCode(Number.parseInt(sequence.slice(1), 16))
    }
    if (sequence === 'n') return '\n'
    if (sequence === 't') return '\t'
    if (sequence === 'r') return '\r'
    return sequence
  })
}

export async function updateServerProperty(
  filePath: string,
  settings: IServerSettings
): Promise<void> {
  let fileContent = ''
  let eol = '\n'

  try {
    fileContent = await fs.readFile(filePath, 'utf8')
    eol = fileContent.includes('\r\n') ? '\r\n' : '\n'
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
    fileContent = ''
  }

  const lines = fileContent ? fileContent.split(/\r?\n/) : []
  let updatedLines = [...lines]

  function update(property: string, value: string | number | boolean) {
    const safeValue =
      typeof value === 'string' ? escapePropertyValue(value) : value
    let updated = false

    updatedLines = updatedLines.map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed === '') {
        return line
      }

      const [key] = line.split('=')
      const currentKey = key.trim()

      if (currentKey === property) {
        updated = true
        return `${currentKey}=${safeValue}`
      }

      return line
    })

    if (!updated) {
      updatedLines.push(`${property}=${safeValue}`)
    }
  }

  update('max-players', settings.maxPlayers)
  update('gamemode', settings.gameMode)
  update('difficulty', settings.difficulty)
  update('white-list', settings.whitelist)
  update('online-mode', settings.onlineMode)
  update('pvp', settings.pvp)
  update('enable-command-block', settings.enableCommandBlock)
  update('allow-flight', settings.allowFlight)
  update('spawn-animals', settings.spawnAnimals)
  update('spawn-monsters', settings.spawnMonsters)
  update('spawn-npcs', settings.spawnNpcs)
  update('allow-nether', settings.allowNether)
  update('force-gamemode', settings.forceGamemode)
  update('spawn-protection', settings.spawnProtection)
  update('require-resource-pack', settings.requireResourcePack)
  update('resource-pack', settings.resourcePack)
  update('resource-pack-prompt', settings.resourcePackPrompt)
  update('motd', settings.motd)
  update('server-ip', settings.serverIp)
  update('server-port', settings.serverPort)

  await fs.writeFile(filePath, updatedLines.join(eol), 'utf8')
}

export async function getServerSettings(filePath: string): Promise<IServerSettings> {
  let fileContent = ''

  try {
    fileContent = await fs.readFile(filePath, 'utf8')
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err

    return {
      maxPlayers: 20,
      gameMode: 'survival',
      difficulty: 'normal',
      whitelist: false,
      onlineMode: true,
      pvp: true,
      enableCommandBlock: false,
      allowFlight: false,
      spawnAnimals: true,
      spawnMonsters: true,
      spawnNpcs: true,
      allowNether: true,
      forceGamemode: false,
      spawnProtection: 16,
      requireResourcePack: false,
      resourcePack: '',
      resourcePackPrompt: '',
      motd: '',
      serverIp: '',
      serverPort: 25565
    }
  }

  const lines = fileContent.split(/\r?\n/)

  function getServerProperty(property: string) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || trimmed === '') {
        continue
      }

      const [key, ...rest] = line.split('=')
      const currentKey = key.trim()
      const currentValue = rest.join('=').trim()

      if (currentKey === property) {
        return unescapePropertyValue(currentValue)
      }
    }

    return null
  }

  return {
    maxPlayers: Number(getServerProperty('max-players') || 20),
    gameMode: getServerProperty('gamemode') || 'survival',
    difficulty: getServerProperty('difficulty') || 'normal',
    whitelist: getServerProperty('white-list') === 'true',
    onlineMode: getServerProperty('online-mode') === 'true',
    pvp: getServerProperty('pvp') === 'true',
    enableCommandBlock: getServerProperty('enable-command-block') === 'true',
    allowFlight: getServerProperty('allow-flight') === 'true',
    spawnAnimals: getServerProperty('spawn-animals') === 'true',
    spawnMonsters: getServerProperty('spawn-monsters') === 'true',
    spawnNpcs: getServerProperty('spawn-npcs') === 'true',
    allowNether: getServerProperty('allow-nether') === 'true',
    forceGamemode: getServerProperty('force-gamemode') === 'true',
    spawnProtection: Number(getServerProperty('spawn-protection') || 16),
    requireResourcePack: getServerProperty('require-resource-pack') === 'true',
    resourcePack: getServerProperty('resource-pack') || '',
    resourcePackPrompt: getServerProperty('resource-pack-prompt') || '',
    motd: getServerProperty('motd') || '',
    serverIp: getServerProperty('server-ip') || '',
    serverPort: Number(getServerProperty('server-port') || 25565)
  }
}

export async function getServersOfVersions(versions: IVersionConf[]) {
  const servers: {
    version: string
    servers: any[]
    path: string
  }[] = []

  const paths = await getLauncherPaths()

  for (const version of versions) {
    const versionPath = path.join(paths.minecraft, 'versions', version.name)
    const serversPath = path.join(versionPath, 'servers.dat')
    const isExists = await fs.pathExists(serversPath)

    if (!isExists) {
      servers.push({ version: version.name, servers: [], path: serversPath })
      continue
    }

    const serversData = await readNBT(serversPath).catch((err) => {
      console.error(`[servers:versions] unreadable servers.dat ${serversPath}:`, err)
      return []
    })
    servers.push({ version: version.name, servers: serversData, path: serversPath })
  }

  return servers
}
