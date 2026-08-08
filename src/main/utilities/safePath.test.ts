import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import path from 'path'
import { vi } from 'vitest'
import fs from 'fs-extra'

const fakePaths: Record<string, string> = {
  appData: path.resolve('/fake/appdata'),
  userData: path.resolve('/fake/userdata'),
  temp: path.resolve('/fake/tmp'),
  home: path.resolve('/fake/home'),
  downloads: path.resolve('/fake/home/Downloads'),
}

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => fakePaths[key] ?? path.resolve('/fake/other'),
    getAppPath: () => path.resolve('/fake/app'),
  },
}))

import {
  assertReadablePath,
  assertWritablePath,
  blessUserSelectedPath,
  isExtractablePath,
  isOpenableFileExtension,
  isOpenablePath,
  isReadablePath,
  isWritablePath,
  listBlessedPaths,
  revokeBlessedPath,
} from './safePath'

const launcherRoot = path.resolve('/fake/appdata/.grubielauncher')
const persistedRootsPath = path.resolve('/fake/userdata/allowed-paths.json')

beforeAll(() => {
  fs.removeSync(persistedRootsPath)
})

afterAll(() => {
  fs.removeSync(persistedRootsPath)
})

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

  it('rejects writes inside an installed java runtime', () => {
    const javaRoot = path.join(launcherRoot, 'java')

    expect(isWritablePath(path.join(javaRoot, 'jdk-21.0.5+11', 'bin', 'javaw.exe'))).toBe(
      false,
    )
    expect(
      isWritablePath(
        path.join(
          launcherRoot,
          'minecraft',
          'versions',
          'pack',
          'mods',
          '..',
          '..',
          '..',
          '..',
          'java',
          'jdk-21.0.5+11',
          'bin',
          'javaw.exe',
        ),
      ),
    ).toBe(false)
    expect(isWritablePath(path.join(javaRoot, 'cache', '21-windows-x64.json'))).toBe(false)
  })

  it('still allows the downloaded java archive itself', () => {
    expect(
      isWritablePath(path.join(launcherRoot, 'java', 'OpenJDK21U-jre_x64_windows.zip')),
    ).toBe(true)
    expect(
      isWritablePath(path.join(launcherRoot, 'java', 'OpenJDK21U-jre_x64_linux.tar.gz')),
    ).toBe(true)
  })

  it('rejects a java-named payload dropped straight into the java folder', () => {
    const javaRoot = path.join(launcherRoot, 'java')

    expect(isWritablePath(path.join(javaRoot, 'java.exe'))).toBe(false)
    expect(isWritablePath(path.join(javaRoot, 'javaw.exe'))).toBe(false)
    expect(isWritablePath(path.join(javaRoot, 'java'))).toBe(false)
  })

  it('rejects writes to the path policy file', () => {
    expect(isWritablePath(persistedRootsPath)).toBe(false)
  })
})

describe('safePath.blessUserSelectedPath', () => {
  it('blesses a user-selected folder and its descendants', () => {
    const picked = path.resolve('/fake/exports')
    expect(isWritablePath(path.join(picked, 'pack.zip'))).toBe(false)

    blessUserSelectedPath(picked, 'folder')

    expect(isWritablePath(path.join(picked, 'pack.zip'))).toBe(true)
    expect(isWritablePath(path.join(picked, 'sub', 'deep.json'))).toBe(true)
  })

  it('blesses only the selected file itself, not its folder', () => {
    const file = path.resolve('/fake/picked-files/mod.jar')
    blessUserSelectedPath(file, 'file')

    expect(isReadablePath(file)).toBe(true)
    expect(isWritablePath(file)).toBe(true)
    expect(isWritablePath(path.resolve('/fake/picked-files/other.jar'))).toBe(false)
    expect(isReadablePath(path.resolve('/fake/picked-files/other.jar'))).toBe(false)
    expect(isWritablePath(path.resolve('/fake/elsewhere.txt'))).toBe(false)
  })

  it('refuses to bless drive roots and the home folder', () => {
    blessUserSelectedPath(path.parse(process.cwd()).root, 'folder')
    blessUserSelectedPath(fakePaths.home, 'folder')

    expect(isWritablePath(path.resolve('/fake/home/secret.txt'))).toBe(false)
    expect(isWritablePath(path.resolve('/etc/passwd'))).toBe(false)
  })

  it('grants read-only access for dropped files, never write', () => {
    const dropped = path.resolve('/fake/dropped/mod.jar')
    blessUserSelectedPath(dropped, 'file', 'read')

    expect(isReadablePath(dropped)).toBe(true)
    expect(isWritablePath(dropped)).toBe(false)
  })

  it('keeps read-only blessings out of the persisted file', () => {
    fs.removeSync(persistedRootsPath)
    blessUserSelectedPath(path.resolve('/fake/session-only/mod.jar'), 'file', 'read')

    const stored = fs.existsSync(persistedRootsPath)
      ? (fs.readJsonSync(persistedRootsPath) as { path: string }[])
      : []

    expect(
      stored.some((entry) => entry.path.includes('session-only')),
    ).toBe(false)
  })

  it('refuses to bless system roots', () => {
    const systemRoot =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc')
        : path.resolve('/etc/systemd')

    blessUserSelectedPath(systemRoot, 'folder')

    expect(isReadablePath(path.join(systemRoot, 'hosts'))).toBe(false)
    expect(isWritablePath(path.join(systemRoot, 'hosts'))).toBe(false)
  })

  it('keeps the blessed list bounded', () => {
    const survivor = path.resolve('/fake/bounded/keep-me')
    blessUserSelectedPath(survivor, 'folder')

    for (let index = 0; index < 80; index++) {
      blessUserSelectedPath(path.resolve(`/fake/bounded/folder-${index}`), 'folder')
    }

    expect(isWritablePath(path.join(survivor, 'file.txt'))).toBe(false)
    expect(isWritablePath(path.resolve('/fake/bounded/folder-79/file.txt'))).toBe(true)
  })
})

describe('safePath.listBlessedPaths / revokeBlessedPath', () => {
  it('lists a blessed path and takes access away when it is revoked', () => {
    const picked = path.resolve('/fake/revocable')
    blessUserSelectedPath(picked, 'folder')

    expect(isWritablePath(path.join(picked, 'file.txt'))).toBe(true)
    expect(listBlessedPaths().some((entry) => entry.path === picked)).toBe(true)

    expect(revokeBlessedPath(picked)).toBe(true)

    expect(isWritablePath(path.join(picked, 'file.txt'))).toBe(false)
    expect(listBlessedPaths().some((entry) => entry.path === picked)).toBe(false)
    expect(revokeBlessedPath(picked)).toBe(false)
  })

  it('ignores unusable revoke arguments', () => {
    expect(revokeBlessedPath('')).toBe(false)
    expect(revokeBlessedPath(undefined)).toBe(false)
    expect(revokeBlessedPath(String.fromCharCode(0))).toBe(false)
  })
})

describe('safePath blessing renewal', () => {
  const DAY_MS = 24 * 60 * 60 * 1000

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a blessed folder alive while it is still being read', () => {
    const watched = path.resolve('/fake/renewal/watched')
    const forgotten = path.resolve('/fake/renewal/forgotten')

    blessUserSelectedPath(watched, 'folder')
    blessUserSelectedPath(forgotten, 'folder')

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 2 * DAY_MS)
    expect(isReadablePath(path.join(watched, 'mod.jar'))).toBe(true)

    vi.setSystemTime(Date.now() + 29 * DAY_MS)
    expect(isReadablePath(path.join(watched, 'mod.jar'))).toBe(true)
    expect(isReadablePath(path.join(forgotten, 'mod.jar'))).toBe(false)
  })

  it('expires a blessed folder that is never read again', () => {
    const stale = path.resolve('/fake/renewal/stale')
    blessUserSelectedPath(stale, 'folder')

    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 31 * DAY_MS)
    expect(isReadablePath(path.join(stale, 'mod.jar'))).toBe(false)
  })
})

describe('safePath.isExtractablePath', () => {
  const javaRoot = path.join(launcherRoot, 'java')

  it('allows the java root the runtime archive unpacks into', () => {
    expect(isExtractablePath(javaRoot)).toBe(true)
  })

  it('refuses to unpack over an installed runtime or outside the launcher', () => {
    expect(isExtractablePath(path.join(javaRoot, 'jdk-21.0.5+11'))).toBe(false)
    expect(isExtractablePath(path.join(javaRoot, 'jdk-21.0.5+11', 'bin'))).toBe(false)
    expect(isExtractablePath(path.resolve('/etc'))).toBe(false)
    expect(isExtractablePath('')).toBe(false)
  })

  it('still allows ordinary launcher folders', () => {
    expect(
      isExtractablePath(path.join(launcherRoot, 'minecraft', 'versions', 'pack')),
    ).toBe(true)
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

describe('safePath.isReadablePath', () => {
  it('allows paths inside the launcher directory', () => {
    expect(
      isReadablePath(path.join(launcherRoot, 'minecraft', 'versions', 'x', 'x.json')),
    ).toBe(true)
  })

  it('allows the app resources directory (bundled wasm/worklet)', () => {
    expect(
      isReadablePath(path.resolve('/fake/app/out/renderer/rnnoise.wasm')),
    ).toBe(true)
  })

  it('rejects arbitrary system paths', () => {
    expect(isReadablePath(path.resolve('/etc/passwd'))).toBe(false)
    expect(isReadablePath(path.resolve('/fake/home/.ssh/id_rsa'))).toBe(false)
  })

  it('rejects traversal and null-byte paths', () => {
    expect(isReadablePath(path.join(launcherRoot, '..', '..', 'secret'))).toBe(false)
    expect(isReadablePath(path.join(launcherRoot, 'a\0b'))).toBe(false)
  })

  it('honors blessed user-selected paths', () => {
    const picked = path.resolve('/fake/dropzone')
    expect(isReadablePath(path.join(picked, 'pack.mrpack'))).toBe(false)
    blessUserSelectedPath(picked, 'folder')
    expect(isReadablePath(path.join(picked, 'pack.mrpack'))).toBe(true)
  })
})

describe('safePath downloads narrowing', () => {
  const downloads = fakePaths.downloads

  it('allows listing the downloads folder itself', () => {
    expect(isReadablePath(downloads)).toBe(true)
  })

  it('allows manually downloaded mod archives at the top level', () => {
    expect(isReadablePath(path.join(downloads, 'jei-1.20.jar'))).toBe(true)
    expect(isReadablePath(path.join(downloads, 'pack.zip'))).toBe(true)
    expect(isReadablePath(path.join(downloads, 'pack.mrpack'))).toBe(true)
  })

  it('rejects unrelated files and nested folders in downloads', () => {
    expect(isReadablePath(path.join(downloads, 'passwords.txt'))).toBe(false)
    expect(isReadablePath(path.join(downloads, 'id_rsa'))).toBe(false)
    expect(isReadablePath(path.join(downloads, 'nested', 'mod.jar'))).toBe(false)
  })

  it('never makes downloads writable', () => {
    expect(isWritablePath(path.join(downloads, 'mod.jar'))).toBe(false)
    expect(isWritablePath(downloads)).toBe(false)
  })
})

describe('safePath.isOpenablePath', () => {
  it('allows launcher-owned folders', () => {
    expect(isOpenablePath(launcherRoot)).toBe(true)
    expect(
      isOpenablePath(path.join(launcherRoot, 'minecraft', 'versions', 'x')),
    ).toBe(true)
  })

  it('excludes the OS temp directory', () => {
    expect(isWritablePath(path.resolve('/fake/tmp/payload.bat'))).toBe(true)
    expect(isOpenablePath(path.resolve('/fake/tmp/payload.bat'))).toBe(false)
  })

  it('rejects arbitrary system paths', () => {
    expect(isOpenablePath(path.resolve('/etc/passwd'))).toBe(false)
    expect(isOpenablePath('')).toBe(false)
  })
})

describe('safePath.isOpenableFileExtension', () => {
  it('allows report-like files only', () => {
    expect(isOpenableFileExtension('crash-2026-07-24.txt')).toBe(true)
    expect(isOpenableFileExtension('latest.LOG')).toBe(true)
    expect(isOpenableFileExtension('conf.json')).toBe(true)
  })

  it('rejects executable and script extensions', () => {
    expect(isOpenableFileExtension('payload.bat')).toBe(false)
    expect(isOpenableFileExtension('payload.exe')).toBe(false)
    expect(isOpenableFileExtension('payload.ps1')).toBe(false)
    expect(isOpenableFileExtension('payload')).toBe(false)
  })
})

describe('safePath.assertReadablePath', () => {
  it('throws for paths outside the allowed roots', () => {
    expect(() => assertReadablePath(path.resolve('/etc/shadow'), 'fs:readFile')).toThrow()
  })

  it('returns the path when it is allowed', () => {
    const ok = path.join(launcherRoot, 'settings.json')
    expect(assertReadablePath(ok)).toBe(ok)
  })
})
