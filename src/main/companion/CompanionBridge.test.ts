import { afterEach, describe, expect, it } from 'vitest'
import net from 'net'
import { CompanionBridge, type CompanionMessage } from './CompanionBridge'

const bridges: CompanionBridge[] = []

function lines(socket: net.Socket) {
  const received: Record<string, unknown>[] = []
  const waiters: (() => void)[] = []
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    let index = buffer.indexOf('\n')
    while (index !== -1) {
      received.push(JSON.parse(buffer.slice(0, index)))
      buffer = buffer.slice(index + 1)
      index = buffer.indexOf('\n')
    }
    waiters.splice(0).forEach((resolve) => resolve())
  })
  return {
    received,
    async next(type: string) {
      for (;;) {
        const found = received.findIndex((message) => message.t === type)
        if (found !== -1) return received.splice(found, 1)[0]
        await new Promise<void>((resolve) => waiters.push(resolve))
      }
    }
  }
}

function open(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => resolve(socket))
    socket.once('error', reject)
  })
}

function closed(socket: net.Socket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.destroyed) resolve()
    else socket.once('close', () => resolve())
  })
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()))
})

describe('companion bridge', () => {
  it('lets in only a game that knows its token', async () => {
    const bridge = new CompanionBridge()
    bridges.push(bridge)
    const env = await bridge.register('Pack', 0, '/stats')
    expect(env.GRUBIE_COMPANION_ADDRESS).toMatch(/^127\.0\.0\.1:\d+$/)
    expect(env.GRUBIE_COMPANION_TOKEN).toMatch(/^[a-f0-9]{48}$/)
    expect(env.GRUBIE_COMPANION_STATS_DIR).toBe('/stats')
    const port = Number(env.GRUBIE_COMPANION_ADDRESS.split(':')[1])

    const stranger = await open(port)
    stranger.write(`${JSON.stringify({ t: 'hello', token: 'f'.repeat(48) })}\n`)
    await closed(stranger)
    expect(bridge.sessions()).toEqual([])

    const statuses: unknown[] = []
    bridge.on('status', (sessions) => statuses.push(sessions))
    bridge.setToasts([
      { id: 'gameInvite:1', kind: 'invite', title: 'Kituk', body: 'World', count: 1, actionable: true }
    ])

    const game = await open(port)
    const reader = lines(game)
    game.write(
      `${JSON.stringify({ t: 'hello', token: env.GRUBIE_COMPANION_TOKEN, mod: '1.0.0', loader: 'fabric' })}\n`
    )
    await reader.next('welcome')
    const toasts = await reader.next('toasts')
    expect(toasts.items).toHaveLength(1)
    expect(bridge.isConnected('Pack', 0)).toBe(true)
    expect(statuses.at(-1)).toEqual([{ versionName: 'Pack', instance: 0, mod: '1.0.0' }])

    const accepted = new Promise<string>((resolve) => bridge.on('accept', (id) => resolve(id)))
    game.write(`${JSON.stringify({ t: 'accept', id: 'gameInvite:1' })}\n`)
    expect(await accepted).toBe('gameInvite:1')

    bridge.setHost('Pack', 0, { t: 'host', active: true, kind: 'world', guests: [] })
    bridge.setHost('Pack', 0, { t: 'host', active: true, kind: 'world', guests: [] })
    await reader.next('host')
    expect(bridge.connect('Pack', 0, '127.0.0.1:40000', 'World')).toBe(true)
    const connect = await reader.next('connect')
    expect(connect).toEqual({ t: 'connect', address: '127.0.0.1:40000', name: 'World', kind: 'server' })
    expect(bridge.connect('Pack', 0, 'abcd.join.grubielauncher.com', "kit's world", 'world')).toBe(true)
    expect(await reader.next('connect')).toEqual({
      t: 'connect',
      address: 'abcd.join.grubielauncher.com',
      name: "kit's world",
      kind: 'world'
    })
    expect(reader.received.filter((message) => message.t === 'host')).toEqual([])

    bridge.unregister('Pack', 0)
    await closed(game)
    expect(bridge.connect('Pack', 0, '127.0.0.1:40000', 'World')).toBe(false)
    expect(statuses.at(-1)).toEqual([])
  })

  it('drops sockets that never say hello or send huge lines', async () => {
    const bridge = new CompanionBridge()
    bridges.push(bridge)
    const env = await bridge.register('Pack', 1, '/stats')
    const port = Number(env.GRUBIE_COMPANION_ADDRESS.split(':')[1])

    const flood = await open(port)
    flood.write('x'.repeat(1100 * 1024))
    await closed(flood)

    const second = await bridge.register('Pack', 1, '/stats')
    expect(second.GRUBIE_COMPANION_TOKEN).not.toBe(env.GRUBIE_COMPANION_TOKEN)
    const old = await open(port)
    old.write(`${JSON.stringify({ t: 'hello', token: env.GRUBIE_COMPANION_TOKEN })}\n`)
    await closed(old)
  })

  it('speaks protocol 2 with friends, voice, avatars, actions and results', async () => {
    const bridge = new CompanionBridge()
    bridges.push(bridge)
    bridge.setAvatarSource({ png: async (id) => (id === 'u1' ? 'iVBORw0KGgo=' : null) })
    bridge.setSelf({ id: 'me', name: 'Steve' })
    bridge.setFriends({
      online: [
        { id: 'u1', name: 'Kituk', status: 'playing', joinable: true, avatarUrl: 'https://cdn.example/u1.png' },
        { id: 'u2', name: 'Alex', status: 'online', joinable: false }
      ],
      offline: 4
    })
    bridge.setVoice({
      active: true,
      channel: 'Builders',
      muted: false,
      deafened: false,
      ptt: true,
      pttKey: 'V',
      pttCode: 86,
      members: [{ id: 'u1', name: 'Kituk', speaking: true, muted: false }]
    })
    bridge.expectPlace('Pack', { address: '127.0.0.1:41000', name: "kit's world", kind: 'world' })
    const env = await bridge.register('Pack', 2, '/stats')
    const port = Number(env.GRUBIE_COMPANION_ADDRESS.split(':')[1])
    const game = await open(port)
    const reader = lines(game)
    game.write(
      `${JSON.stringify({ t: 'hello', token: env.GRUBIE_COMPANION_TOKEN, mod: '2.0.0', loader: 'fabric', protocol: 2, features: ['panel'] })}\n`
    )
    const welcome = await reader.next('welcome')
    expect(welcome).toEqual({ t: 'welcome', protocol: 2, selfId: 'me', selfName: 'Steve' })
    expect(await reader.next('place')).toEqual({
      t: 'place',
      address: '127.0.0.1:41000',
      name: "kit's world",
      kind: 'world'
    })
    const friends = await reader.next('friends')
    expect(friends.offline).toBe(4)
    expect((friends.online as Record<string, unknown>[])[0]).toEqual({
      id: 'u1',
      name: 'Kituk',
      status: 'playing',
      joinable: true,
      avatar: 'u1'
    })
    const avatar = await reader.next('avatar')
    expect(avatar).toEqual({ t: 'avatar', id: 'u1', png: 'iVBORw0KGgo=' })
    const voice = await reader.next('voice')
    expect(voice.pttCode).toBe(86)

    const messages: CompanionMessage[] = []
    bridge.on('message', (message) => messages.push(message))
    game.write(`${JSON.stringify({ t: 'invite', req: 'invite-1', friend: 'u2', server: { address: 'mc.example.net', name: 'Example' } })}\n`)
    game.write(`${JSON.stringify({ t: 'ptt', down: true })}\n`)
    game.write(`${JSON.stringify({ t: 'stage', stage: 'world' })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(messages.map((message) => message.t)).toEqual(['invite', 'ptt', 'stage'])

    expect(bridge.result('Pack', 2, 'invite-1', false, 'friend_offline')).toBe(true)
    expect(await reader.next('result')).toEqual({ t: 'result', req: 'invite-1', ok: false, error: 'friend_offline' })

    bridge.pushToast('Pack', 2, { id: 'shot', kind: 'screenshot', title: 'Saved', body: '', count: 1, actionable: false })
    let toasts = await reader.next('toasts')
    while ((toasts.items as unknown[]).length === 0) toasts = await reader.next('toasts')
    expect((toasts.items as { id: string }[]).map((item) => item.id)).toEqual(['shot'])
  })

  it('keeps old mods on protocol 1', async () => {
    const bridge = new CompanionBridge()
    bridges.push(bridge)
    const env = await bridge.register('Pack', 3, '/stats')
    const port = Number(env.GRUBIE_COMPANION_ADDRESS.split(':')[1])
    const game = await open(port)
    const reader = lines(game)
    game.write(`${JSON.stringify({ t: 'hello', token: env.GRUBIE_COMPANION_TOKEN, mod: '1.0.0' })}\n`)
    expect(await reader.next('welcome')).toEqual({ t: 'welcome', protocol: 1 })
    bridge.setFriends({ online: [{ id: 'u1', name: 'A', status: 'online', joinable: false }], offline: 0 })
    expect(bridge.result('Pack', 3, 'r', true)).toBe(false)
    await reader.next('toasts')
    expect(reader.received.filter((message) => message.t === 'friends')).toEqual([])
  })
})
