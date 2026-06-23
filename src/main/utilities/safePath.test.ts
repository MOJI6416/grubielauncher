import { describe, expect, it } from 'vitest'
import path from 'path'
import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) =>
      key === 'appData'
        ? path.resolve('/fake/appdata')
        : path.resolve('/fake/tmp'),
  },
}))

import {
  assertWritablePath,
  blessUserSelectedPath,
  isWritablePath,
} from './safePath'

const launcherRoot = path.resolve('/fake/appdata/.grubielauncher')

describe('safePath.isWritablePath', () => {
  it('allows paths inside the launcher directory', () => {
    expect(
      isWritablePath(path.join(launcherRoot, 'minecraft', 'versions', 'x', 'y.json')),
    ).toBe(true)
  })

  it('allows the OS temp directory', () => {
    expect(isWritablePath(path.resolve('/fake/tmp/some-import'))).toBe(true)
  })

  it('rejects arbitrary system paths', () => {
    expect(isWritablePath(path.resolve('/etc/passwd'))).toBe(false)
    expect(isWritablePath(path.resolve('/fake/unrelated/place'))).toBe(false)
  })

  it('rejects empty, non-string and null-byte paths', () => {
    expect(isWritablePath('')).toBe(false)
    expect(isWritablePath(undefined as unknown as string)).toBe(false)
    expect(isWritablePath(path.join(launcherRoot, 'a\0b'))).toBe(false)
  })

  it('rejects traversal that escapes the launcher root', () => {
    expect(isWritablePath(path.join(launcherRoot, '..', '..', 'escape'))).toBe(false)
  })
})

describe('safePath.blessUserSelectedPath', () => {
  it('blesses a user-selected folder and its descendants', () => {
    const picked = path.resolve('/fake/downloads/exports')
    expect(isWritablePath(path.join(picked, 'pack.zip'))).toBe(false)

    blessUserSelectedPath(picked, 'folder')

    expect(isWritablePath(path.join(picked, 'pack.zip'))).toBe(true)
    expect(isWritablePath(path.join(picked, 'sub', 'deep.json'))).toBe(true)
  })

  it('blesses only the containing folder of a user-selected file', () => {
    const file = path.resolve('/fake/picked-files/mod.jar')
    blessUserSelectedPath(file, 'file')

    expect(isWritablePath(path.resolve('/fake/picked-files/other.jar'))).toBe(true)
    expect(isWritablePath(path.resolve('/fake/elsewhere.txt'))).toBe(false)
  })
})

describe('safePath.assertWritablePath', () => {
  it('throws for paths outside the allowed roots', () => {
    expect(() => assertWritablePath(path.resolve('/etc/x'), 'fs:rimraf')).toThrow()
  })

  it('returns the path when it is allowed', () => {
    const ok = path.join(launcherRoot, 'minecraft', 'options.txt')
    expect(assertWritablePath(ok)).toBe(ok)
  })
})
