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

import { check, getIpcFailureToken, handleSafe } from './ipc'
import { readIpcFailureEnvelope } from '@/shared/ipcFailureEnvelope'

const sender = { isDestroyed: () => false, send: vi.fn() }
const event = { sender } as unknown as Electron.IpcMainInvokeEvent

function raw(channel: string, ...args: unknown[]) {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`no handler for ${channel}`)
  return handler(event, ...args)
}

async function invoke(channel: string, ...args: unknown[]) {
  const result = await raw(channel, ...args)
  const envelope = readIpcFailureEnvelope(result)
  return envelope ? envelope.value : result
}

async function failureOf(channel: string, ...args: unknown[]) {
  const envelope = readIpcFailureEnvelope(await raw(channel, ...args))
  return envelope?.__grubieIpcFailure ?? null
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

    expect(await failureOf('fs:writeFile', '')).toMatchObject({
      channel: 'fs:writeFile',
      notify: false,
      failure: { cause: 'invalidArgument' }
    })
  })

  it('carries the reason in the same reply as the fallback', async () => {
    handleSafe<string[], [string]>('fs:readdir', [], [check.nonEmptyString(16)], () => {
      throw new Error('boom')
    })

    const result = await raw('fs:readdir', 'x')
    const envelope = readIpcFailureEnvelope(result)

    expect(envelope).not.toBeNull()
    expect(envelope?.value).toEqual([])
    expect(envelope?.__grubieIpcFailure.channel).toBe('fs:readdir')
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('marks write channels as notifiable', async () => {
    handleSafe<boolean, [string]>('fs:writeJSON', false, [check.nonEmptyString(16)], () => {
      throw new Error('disk gone')
    })

    expect(await failureOf('fs:writeJSON', 'x')).toMatchObject({ notify: true })
  })

  it('refuses an envelope that a file could forge', async () => {
    const forged = {
      __grubieIpcFailure: {
        channel: 'fs:readJSON',
        notify: true,
        message: 'crafted by a downloaded file',
        failure: {
          channel: 'fs:readJSON',
          cause: 'diskFull',
          code: 'DISK-FULL',
          message: 'crafted by a downloaded file',
          side: 'disk',
          time: Date.now()
        }
      },
      value: null
    }

    expect(readIpcFailureEnvelope(forged, getIpcFailureToken())).toBeNull()

    handleSafe<unknown, [string]>('fs:readJSON', null, [check.nonEmptyString(16)], () => {
      throw new Error('boom')
    })

    const real = await raw('fs:readJSON', 'x')
    expect(readIpcFailureEnvelope(real, getIpcFailureToken())).not.toBeNull()
  })
})
