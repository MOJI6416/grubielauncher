import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { ServerAdmin, toGameRule } from './ServerAdmin'
import type { ServerAdminEvent } from '@/types/ServerAdmin'
import { FakeMsmpServer, startFakeMsmp } from './fakeMsmp.testutil'
import {
  buildManagedProperties,
  fingerprintFromKeytool,
  generateMsmpSecret,
  isUserManagedMsmp,
  isValidMsmpSecret,
  prepareMsmp,
  readMsmpProperties,
  readProperty,
  supportsMsmpVersion,
  writeProperties,
} from './msmpSetup'
import {
  logMessage,
  parseGameruleAnswer,
  parseJoinLeave,
  parseListHeader,
  readBans,
  readOperators,
  stdinCommand,
} from './stdinParse'

const SECRET = generateMsmpSecret()

function waitFor<T>(check: () => T | undefined | false, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      const value = check()
      if (value) return resolve(value)
      if (Date.now() - started > timeoutMs) return reject(new Error('condition not met'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

describe('MSMP support and setup', () => {
  it('knows which versions ship the management protocol', () => {
    expect(supportsMsmpVersion('1.21.8')).toBe(false)
    expect(supportsMsmpVersion('1.21.9')).toBe(true)
    expect(supportsMsmpVersion('1.21.9-pre1')).toBe(true)
    expect(supportsMsmpVersion('1.21.11')).toBe(true)
    expect(supportsMsmpVersion('1.20.6')).toBe(false)
    expect(supportsMsmpVersion('1.12.2')).toBe(false)
    expect(supportsMsmpVersion('26.1')).toBe(true)
    expect(supportsMsmpVersion('26.3-snapshot-1')).toBe(true)
    expect(supportsMsmpVersion('25w34a')).toBe(false)
    expect(supportsMsmpVersion('25w35a')).toBe(true)
    expect(supportsMsmpVersion('b1.7.3')).toBe(false)
    expect(supportsMsmpVersion('')).toBe(false)
  })

  it('generates secrets the server accepts', () => {
    const secret = generateMsmpSecret()
    expect(secret).toHaveLength(40)
    expect(isValidMsmpSecret(secret)).toBe(true)
    expect(isValidMsmpSecret('short')).toBe(false)
  })

  it('rewrites only the management keys and keeps the rest of server.properties', () => {
    const before = '#Minecraft server properties\r\nmotd=Hi\\u0021\r\nmanagement-server-port=1\r\npvp=true\r\n'
    const after = writeProperties(
      before,
      buildManagedProperties({ port: 25601, secret: SECRET, tls: true }),
    )

    expect(after.startsWith('#Minecraft server properties\r\nmotd=Hi\\u0021\r\n')).toBe(true)
    expect(after).toContain('management-server-port=25601\r\n')
    expect(after).toContain('pvp=true\r\n')
    expect(after.match(/management-server-port/g)).toHaveLength(1)
    expect(readProperty(after, 'motd')).toBe('Hi!')
    expect(readMsmpProperties(after)).toEqual({
      enabled: true,
      host: '127.0.0.1',
      port: 25601,
      secret: SECRET,
      tlsEnabled: true,
      keystore: 'storage/management/management.p12',
    })
    expect(readProperty(after, 'management-server-allowed-origins')).toBe('grubie-launcher')
  })

  it('leaves a management server the owner configured by hand alone', () => {
    const own = readMsmpProperties('management-server-enabled=true\nmanagement-server-secret=xyz\n')
    expect(isUserManagedMsmp(own, null)).toBe(true)
    expect(isUserManagedMsmp(own, { secret: 'xyz', port: 1 })).toBe(false)
    expect(isUserManagedMsmp(readMsmpProperties(''), null)).toBe(false)
  })

  it('reads the certificate fingerprint keytool prints', () => {
    const fingerprint = Array.from({ length: 32 }, () => 'AB').join(':')
    expect(fingerprintFromKeytool(`Certificate fingerprints:\n\t SHA1: 00\n\t SHA256: ${fingerprint}\n`)).toBe(
      fingerprint,
    )
    expect(fingerprintFromKeytool('nothing')).toBeNull()
  })

  describe('prepareMsmp', () => {
    let dir: string

    beforeEach(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grubie-msmp-'))
    })

    afterEach(async () => {
      await fs.remove(dir)
    })

    it('turns the management server on for 127.0.0.1 and keeps the same secret next time', async () => {
      await fs.writeFile(path.join(dir, 'server.properties'), 'motd=Test\n')

      const first = await prepareMsmp(dir, null)
      expect(first.managed).toBe(true)
      expect(first.tls).toBe(false)
      expect(first.host).toBe('127.0.0.1')
      expect(first.port).toBeGreaterThan(0)

      const text = await fs.readFile(path.join(dir, 'server.properties'), 'utf8')
      expect(readMsmpProperties(text)).toMatchObject({
        enabled: true,
        port: first.port,
        secret: first.secret,
        tlsEnabled: false,
      })
      expect(readProperty(text, 'motd')).toBe('Test')

      const second = await prepareMsmp(dir, null)
      expect(second.secret).toBe(first.secret)
      expect(second.port).toBe(first.port)
    })

    it('uses the owner settings when the management server was set up by hand', async () => {
      await fs.writeFile(
        path.join(dir, 'server.properties'),
        `management-server-enabled=true\nmanagement-server-port=25999\nmanagement-server-secret=${SECRET}\nmanagement-server-tls-enabled=false\n`,
      )

      const plan = await prepareMsmp(dir, null)
      expect(plan).toMatchObject({ managed: false, port: 25999, secret: SECRET, tls: false })
      const text = await fs.readFile(path.join(dir, 'server.properties'), 'utf8')
      expect(text).not.toContain('allowed-origins')
    })
  })
})

describe('stdin fallback parsing', () => {
  it('strips the logger prefix of vanilla, Paper and Forge lines', () => {
    expect(logMessage('[12:00:01] [Server thread/INFO]: Steve joined the game')).toBe(
      'Steve joined the game',
    )
    expect(logMessage('[12:00:01 INFO]: Steve left the game')).toBe('Steve left the game')
    expect(
      logMessage('[12:00:01] [Server thread/INFO] [minecraft/MinecraftServer]: <Steve> hi ]: x'),
    ).toBe('<Steve> hi ]: x')
  })

  it('recognises joins, leaves, list answers and game rule answers', () => {
    expect(parseJoinLeave('Steve joined the game')).toEqual({ name: 'Steve', event: 'joined' })
    expect(parseJoinLeave('<Steve> Steve joined the game')).toBeNull()
    expect(parseListHeader('There are 2 of a max of 20 players online: Steve, Alex')).toEqual({
      online: 2,
      names: ['Steve', 'Alex'],
    })
    expect(parseListHeader('There are 1/20 players online:')).toEqual({ online: 1, names: null })
    expect(parseListHeader('There are 0 of a max 20 players online:')).toEqual({ online: 0, names: [] })
    expect(parseGameruleAnswer('Gamerule keepInventory is currently set to: true')).toEqual({
      key: 'keepInventory',
      value: 'true',
    })
  })

  it('builds console commands and refuses names that could smuggle a second command', () => {
    expect(stdinCommand({ type: 'kick', name: 'Steve', message: 'bye\nop Evil' })).toBe(
      'kick Steve bye op Evil',
    )
    expect(stdinCommand({ type: 'op', name: 'Ste ve' })).toBeNull()
    expect(stdinCommand({ type: 'allowlistEnabled', enabled: true })).toBe('whitelist on')
    expect(stdinCommand({ type: 'gamerule', key: 'keepInventory', value: true })).toBe(
      'gamerule keepInventory true',
    )
    expect(stdinCommand({ type: 'gamerule', key: 'bad key', value: 1 })).toBeNull()
  })

  it('reads operators and bans from the server files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grubie-lists-'))
    try {
      await fs.writeJSON(path.join(dir, 'ops.json'), [
        { uuid: 'u-1', name: 'Steve', level: 4, bypassesPlayerLimit: false },
      ])
      await fs.writeFile(path.join(dir, 'banned-players.txt'), '# list\nGriefer|2020|Server|Forever|x\n')

      expect(await readOperators(dir)).toEqual([
        { name: 'Steve', id: 'u-1', permissionLevel: 4, bypassesPlayerLimit: false },
      ])
      expect(await readBans(dir)).toEqual([{ name: 'Griefer' }])
    } finally {
      await fs.remove(dir)
    }
  })
})

describe('ServerAdmin over MSMP', () => {
  let server: FakeMsmpServer
  let admin: ServerAdmin
  let rules: Record<string, unknown>[]

  beforeEach(async () => {
    rules = [
      { key: 'minecraft:keep_inventory', type: 'boolean', value: false },
      { key: 'minecraft:spawn_radius', type: 'integer', value: 10 },
    ]
    server = await startFakeMsmp({
      secret: SECRET,
      origin: 'grubie-launcher',
      handle: (request) => {
        switch (request.method) {
          case 'rpc.discover':
            return { info: { version: '3.1.0' } }
          case 'minecraft:players':
            return [{ id: 'u-1', name: 'Steve' }]
          case 'minecraft:operators':
            return [{ player: { id: 'u-1', name: 'Steve' }, permissionLevel: 4 }]
          case 'minecraft:allowlist':
            return []
          case 'minecraft:bans':
            return [{ player: { name: 'Griefer' }, reason: 'tnt' }]
          case 'minecraft:serversettings/use_allowlist':
            return true
          case 'minecraft:gamerules':
            return rules
          case 'minecraft:gamerules/update': {
            const [rule] = request.params as [{ key: string; value: unknown }]
            return { ...rules.find((entry) => entry.key === rule.key), value: rule.value }
          }
          default:
            return []
        }
      },
    })
    admin = new ServerAdmin(
      'C:/server',
      { send: () => true },
      {
        host: '127.0.0.1',
        port: server.port,
        secret: SECRET,
        tls: false,
        env: {},
        managed: true,
      },
      null,
    )
  })

  afterEach(async () => {
    admin.dispose()
    await server.close()
  })

  it('loads every list once the management server answers', async () => {
    await admin.start()
    const snapshot = admin.snapshot()

    expect(snapshot.mode).toBe('msmp')
    expect(snapshot.connecting).toBe(false)
    expect(snapshot.players).toEqual([{ id: 'u-1', name: 'Steve' }])
    expect(snapshot.operators).toEqual([
      { id: 'u-1', name: 'Steve', permissionLevel: 4, bypassesPlayerLimit: undefined },
    ])
    expect(snapshot.bans[0]).toMatchObject({ name: 'Griefer', reason: 'tnt' })
    expect(snapshot.allowlistEnabled).toBe(true)
    expect(snapshot.gamerules).toEqual([
      { key: 'minecraft:keep_inventory', type: 'boolean', value: false },
      { key: 'minecraft:spawn_radius', type: 'integer', value: 10 },
    ])
  })

  it('sends kick, ban, op and allowlist actions in the protocol shape', async () => {
    await admin.start()

    await admin.perform({ type: 'kick', name: 'Steve', message: 'bye' })
    await admin.perform({ type: 'ban', name: 'Griefer', reason: 'tnt' })
    await admin.perform({ type: 'op', name: 'Alex' })
    await admin.perform({ type: 'allowlistAdd', name: 'Alex' })
    await admin.perform({ type: 'allowlistEnabled', enabled: false })

    const sent = (method: string) => server.requests.find((request) => request.method === method)?.params
    expect(sent('minecraft:players/kick')).toEqual([
      [{ player: { name: 'Steve' }, message: { literal: 'bye' } }],
    ])
    expect(sent('minecraft:bans/add')).toEqual([
      [{ player: { name: 'Griefer' }, source: 'Grubie Launcher', reason: 'tnt' }],
    ])
    expect(sent('minecraft:operators/add')).toEqual([[{ player: { name: 'Alex' } }]])
    expect(sent('minecraft:allowlist/add')).toEqual([[{ name: 'Alex' }]])
    expect(sent('minecraft:serversettings/use_allowlist/set')).toEqual([false])
  })

  it('updates a game rule with a typed value and keeps the answer', async () => {
    await admin.start()
    const result = await admin.perform({
      type: 'gamerule',
      key: 'minecraft:keep_inventory',
      value: true,
    })

    expect(result.ok).toBe(true)
    expect(server.requests.at(-1)?.params).toEqual([{ key: 'minecraft:keep_inventory', value: true }])
    expect(result.snapshot?.gamerules[0].value).toBe(true)
  })

  it('follows join and leave notifications', async () => {
    await admin.start()
    const events: ServerAdminEvent[] = []
    admin.on('event', (event: ServerAdminEvent) => events.push(event))

    server.notify('minecraft:notification/players/joined', [{ id: 'u-2', name: 'Alex' }])
    await waitFor(() => events.find((event) => event.kind === 'joined'))
    expect(admin.snapshot().players.map((player) => player.name)).toEqual(['Steve', 'Alex'])

    server.notify('minecraft:notification/players/left', [{ id: 'u-1', name: 'Steve' }])
    await waitFor(() => events.find((event) => event.kind === 'left'))
    expect(admin.snapshot().players.map((player) => player.name)).toEqual(['Alex'])
  })

  it('refuses a player name that is not a Minecraft name', async () => {
    await admin.start()
    await expect(admin.perform({ type: 'kick', name: 'a b' })).resolves.toMatchObject({
      ok: false,
      error: 'invalid_player',
    })
  })
})

describe('ServerAdmin over stdin', () => {
  let dir: string
  let sent: string[]
  let admin: ServerAdmin

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'grubie-stdin-'))
    await fs.writeFile(path.join(dir, 'server.properties'), 'white-list=false\n')
    await fs.writeJSON(path.join(dir, 'whitelist.json'), [{ uuid: 'u-9', name: 'Alex' }])
    sent = []
    admin = new ServerAdmin(
      dir,
      {
        send: (line) => {
          sent.push(line)
          if (line === 'gamerule keepInventory') {
            setTimeout(
              () => admin.handleOutput('[10:00:00] [Server thread/INFO]: Gamerule keepInventory is currently set to: true'),
              5,
            )
          }
          return true
        },
      },
      null,
      'old_version',
    )
  })

  afterEach(async () => {
    admin.dispose()
    await fs.remove(dir)
  })

  it('reads the lists from files, asks for players and tracks the console', async () => {
    await admin.start()
    expect(sent).toContain('list')
    expect(admin.snapshot()).toMatchObject({
      mode: 'stdin',
      fallback: 'old_version',
      allowlist: [{ name: 'Alex', id: 'u-9' }],
      allowlistEnabled: false,
    })

    admin.handleOutput('[10:00:00] [Server thread/INFO]: There are 1/20 players online:')
    admin.handleOutput('[10:00:00] [Server thread/INFO]: Steve')
    expect(admin.snapshot().players).toEqual([{ name: 'Steve' }])

    admin.handleOutput('[10:00:01] [Server thread/INFO]: Alex joined the game')
    admin.handleOutput('[10:00:02] [Server thread/INFO]: Steve left the game')
    expect(admin.snapshot().players).toEqual([{ name: 'Alex' }])
  })

  it('runs actions as console commands', async () => {
    await admin.start()
    await admin.perform({ type: 'ban', name: 'Steve', reason: 'grief' })
    await admin.perform({ type: 'allowlistEnabled', enabled: true })

    expect(sent).toContain('ban Steve grief')
    expect(sent).toContain('whitelist on')
    expect(admin.snapshot().allowlistEnabled).toBe(true)
  })

  it('learns the game rules the server answers for and skips the rest', async () => {
    await admin.start()
    const snapshot = await admin.refreshGamerules()

    expect(snapshot.gamerulesLoaded).toBe(true)
    expect(snapshot.gamerules).toEqual([{ key: 'keepInventory', type: 'boolean', value: true }])
  }, 30000)
})

describe('typed game rules', () => {
  it('reads both the typed and the older string form', () => {
    expect(toGameRule({ key: 'a', type: 'integer', value: '7' })).toEqual({
      key: 'a',
      type: 'integer',
      value: 7,
    })
    expect(toGameRule({ key: 'b', value: 'true' })).toEqual({ key: 'b', type: 'boolean', value: true })
    expect(toGameRule({ value: 1 })).toBeNull()
  })
})
