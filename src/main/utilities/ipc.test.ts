import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, InvokeHandler>()

vi.mock('electron', () => ({
  app: {
    getPath: () => path.resolve('/fake/other'),
    getAppPath: () => path.resolve('/fake/app')
  },
  ipcMain: {
    removeHandler: (channel: string) => handlers.delete(channel),
    handle: (channel: string, handler: InvokeHandler) => handlers.set(channel, handler)
  }
}))

import { check, handleSafe } from './ipc'

const sender = { isDestroyed: () => false, send: vi.fn() }
const event = { sender } as unknown as Electron.IpcMainInvokeEvent

function invoke(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return handler(event, ...args)
}

beforeEach(() => {
  handlers.clear()
  sender.send.mockClear()
})

describe('handleSafe argument checks', () => {
  it('runs the handler when every argument passes', async () => {
    const handler = vi.fn(() => 'ok')
    handleSafe<string, [string, string]>(
      'test:enum',
      'fallback',
      [check.nonEmptyString(16), check.oneOf('a', 'b')],
      handler
    )

    await expect(invoke('test:enum', 'name', 'b')).resolves.toBe('ok')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns the fallback and never calls the handler on a bad argument', async () => {
    const handler = vi.fn(() => 'ok')
    handleSafe<string, [string, string]>(
      'test:enum',
      'fallback',
      [check.nonEmptyString(16), check.oneOf('a', 'b')],
      handler
    )

    await expect(invoke('test:enum', 'name', 'c')).resolves.toBe('fallback')
    await expect(invoke('test:enum', '', 'a')).resolves.toBe('fallback')
    await expect(invoke('test:enum', 'x'.repeat(17), 'a')).resolves.toBe('fallback')
    await expect(invoke('test:enum', String.fromCharCode(0), 'a')).resolves.toBe('fallback')
    await expect(invoke('test:enum', 42, 'a')).resolves.toBe('fallback')
    expect(handler).not.toHaveBeenCalled()
  })

  it('accepts optional and array checks', async () => {
    handleSafe<boolean, [string[], string?]>(
      'test:list',
      false,
      [check.arrayOf(check.string(), 2), check.optional(check.string())],
      () => true
    )

    await expect(invoke('test:list', ['a', 'b'])).resolves.toBe(true)
    await expect(invoke('test:list', ['a'], 'x')).resolves.toBe(true)
    await expect(invoke('test:list', ['a', 'b', 'c'])).resolves.toBe(false)
    await expect(invoke('test:list', 'a')).resolves.toBe(false)
    await expect(invoke('test:list', ['a'], 5)).resolves.toBe(false)
  })

  it('keeps the two- and three-argument forms working', async () => {
    handleSafe<string>('test:plain', () => 'plain')
    handleSafe<string, [number]>('test:fallback', 'fb', () => {
      throw new Error('boom')
    })

    await expect(invoke('test:plain')).resolves.toBe('plain')
    await expect(invoke('test:fallback', 1)).resolves.toBe('fb')
  })

  it('does not raise a user notification for a refused argument', async () => {
    handleSafe<boolean, [string]>(
      'fs:writeFile',
      false,
      [check.nonEmptyString(16)],
      () => true
    )

    await invoke('fs:writeFile', '')

    expect(sender.send).toHaveBeenCalledTimes(1)
    expect(sender.send.mock.calls[0][1]).toMatchObject({ notify: false })
  })
})
