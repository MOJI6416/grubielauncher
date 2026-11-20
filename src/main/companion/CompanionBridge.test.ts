import { afterEach, describe, expect, it } from 'vitest'
import net from 'net'
import { CompanionBridge } from './CompanionBridge'

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
    expect(connect).toEqual({ t: 'connect', address: '127.0.0.1:40000', name: 'World' })
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
    flood.write('x'.repeat(70 * 1024))
    await closed(flood)

    const second = await bridge.register('Pack', 1, '/stats')
    expect(second.GRUBIE_COMPANION_TOKEN).not.toBe(env.GRUBIE_COMPANION_TOKEN)
    const old = await open(port)
    old.write(`${JSON.stringify({ t: 'hello', token: env.GRUBIE_COMPANION_TOKEN })}\n`)
    await closed(old)
  })
})
