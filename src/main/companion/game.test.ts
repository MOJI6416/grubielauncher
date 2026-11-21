import { describe, expect, it, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'

vi.mock('../share', () => ({
  lanShareService: {
    getState: () => ({ sessionId: null, target: null, candidate: null }),
    startShare: vi.fn(),
    stopShare: vi.fn()
  }
}))

vi.mock('../journal/journal', () => ({
  journal: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), failure: vi.fn() }
}))

const processes = new Map<string, { versionPath: string }>()
vi.mock('../utilities/runtime', () => ({
  gameProcesses: processes,
  gameRuntime: { emitStdout: vi.fn() }
}))

vi.mock('../utilities/worlds', () => ({
  setLiveWorldStats: vi.fn(),
  clearLiveWorldStats: vi.fn()
}))

const { handleGameMessage, isInside, screenshotPathFor } = await import('./game')
const { setLiveWorldStats } = await import('../utilities/worlds')

function host() {
  return {
    result: vi.fn(),
    toRenderer: vi.fn(),
    pushScreenshot: vi.fn(),
    count: vi.fn(),
    pttFromGame: vi.fn()
  }
}

describe('companion game actions', () => {
  it('keeps screenshots inside the instance folder', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-game-'))
    const versionPath = path.join(root, 'Pack')
    const shots = path.join(versionPath, 'screenshots')
    await fs.ensureDir(shots)
    await fs.writeFile(path.join(shots, 'a.png'), 'png')
    await fs.writeFile(path.join(root, 'outside.png'), 'png')
    processes.set('Pack-0', { versionPath })
    const session = { versionName: 'Pack', instance: 0, mod: '2.0.0' }

    expect(isInside(shots, path.join(shots, 'a.png'))).toBe(true)
    expect(isInside(shots, shots)).toBe(false)
    expect(screenshotPathFor(session, path.join(shots, 'a.png'))).toBe(path.resolve(shots, 'a.png'))
    expect(screenshotPathFor(session, path.join(shots, '..', '..', 'outside.png'))).toBeNull()
    expect(screenshotPathFor(session, path.join(shots, 'missing.png'))).toBeNull()

    const h = host()
    handleGameMessage({ t: 'sendScreenshot', req: 'r1', path: path.join(root, 'outside.png'), friend: 'u1' }, session, h)
    expect(h.result).toHaveBeenCalledWith(session, 'r1', false, 'not_found')
    handleGameMessage({ t: 'sendScreenshot', req: 'r2', path: path.join(shots, 'a.png'), friend: 'u1' }, session, h)
    expect(h.count).toHaveBeenCalledWith('companion.screenshot')
    expect(h.toRenderer).toHaveBeenCalledWith('companion:action', {
      session,
      action: { kind: 'sendScreenshot', req: 'r2', path: path.resolve(shots, 'a.png'), friend: 'u1' }
    })
    await fs.remove(root)
  })

  it('routes actions, counts them once and stores live world stats', () => {
    processes.set('Pack-1', { versionPath: '/data/Pack' })
    const session = { versionName: 'Pack', instance: 1, mod: '2.0.0' }
    const h = host()
    handleGameMessage({ t: 'ptt', down: true }, session, h)
    handleGameMessage({ t: 'ptt', down: false }, session, h)
    handleGameMessage({ t: 'ptt', down: true }, session, h)
    expect(h.pttFromGame.mock.calls.map((call) => call[0])).toEqual([true, false, true])
    expect(h.count.mock.calls.filter((call) => call[0] === 'companion.ptt')).toHaveLength(1)

    handleGameMessage({ t: 'decline', id: 'gameInvite:1' }, session, h)
    expect(h.toRenderer).toHaveBeenCalledWith('companion:action', { session, action: { kind: 'decline', id: 'gameInvite:1' } })

    handleGameMessage({ t: 'stats', kind: 'world', key: 'Island', name: 'Island', snapshot: { stats: {} } }, session, h)
    expect(setLiveWorldStats).toHaveBeenCalledWith(path.join('/data/Pack', 'saves', 'Island'), { stats: {} })
    handleGameMessage({ t: 'stats', kind: 'world', key: '..', name: 'x', snapshot: { stats: {} } }, session, h)
    expect(setLiveWorldStats).toHaveBeenCalledTimes(1)

    handleGameMessage({ t: 'hang', seconds: 20, stage: 'world', thread: 'Render thread', frames: [], mods: ['x.jar'] }, session, h)
    expect(h.toRenderer).toHaveBeenCalledWith('companion:hang', expect.objectContaining({ seconds: 20, mods: ['x.jar'] }))
  })
})
