import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { createHash } from 'crypto'
import { COMPANION_PROTOCOL } from '@/shared/companion'
import type { CompanionJar, CompanionManifest } from './companionManifest'

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')

const cdn = vi.hoisted(() => ({
  root: '',
  manifest: null as unknown,
  refreshed: 0,
  downloads: 0,
  offline: false
}))

vi.mock('./companionCdn', () => ({
  loadCompanionManifest: async () => cdn.manifest,
  refreshCompanionManifest: async () => {
    cdn.refreshed++
    return cdn.manifest
  },
  sha256Of: async (file: string) => {
    try {
      return createHash('sha256').update(await fs.readFile(file)).digest('hex')
    } catch {
      return null
    }
  },
  companionJarFile: async (jar: CompanionJar) => {
    if (cdn.offline) throw new Error('offline')
    cdn.downloads++
    return path.join(cdn.root, 'cache', `${jar.sha256}.jar`)
  }
}))

const NEW_FILE = 'grubie-companion-2.0.0+fabric-1.21.1.jar'

function jar(file: string, content: string): CompanionJar {
  return {
    file,
    url: `https://cdn.grubielauncher.com/companion/2.0.0/${encodeURIComponent(file)}`,
    sha256: sha256(content),
    size: content.length
  }
}

function manifest(): CompanionManifest {
  return {
    format: 1,
    sequence: 3,
    published: '2026-11-21T12:00:00Z',
    mods: {
      '2.0.0': {
        protocol: COMPANION_PROTOCOL,
        minecraft: {
          '1.21': { fabric: jar(NEW_FILE, 'new jar') },
          '1.21.1': { fabric: jar(NEW_FILE, 'new jar') }
        }
      }
    }
  }
}

describe('companion mod files', () => {
  let versionPath: string
  let mods: string

  beforeEach(async () => {
    cdn.root = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-'))
    cdn.manifest = manifest()
    cdn.refreshed = 0
    cdn.downloads = 0
    cdn.offline = false
    versionPath = path.join(cdn.root, 'instance')
    mods = path.join(versionPath, 'mods')
    await fs.outputFile(path.join(cdn.root, 'cache', `${sha256('new jar')}.jar`), 'new jar')
  })

  afterEach(async () => {
    await fs.remove(cdn.root)
  })

  const conf = (companionMod: boolean, id = '1.21.1', loader = 'fabric') => ({
    companionMod,
    version: { id },
    loader: { name: loader }
  })

  it('installs, updates and removes only its own jar', async () => {
    const { syncCompanionMod, companionSupport } = await import('./companionMod')
    await fs.ensureDir(mods)
    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.0+fabric-1.21.1.jar'), 'old jar')
    await fs.writeFile(path.join(mods, 'sodium.jar'), 'sodium')

    expect(await companionSupport('1.21.1', 'fabric')).toEqual({ supported: true, version: '2.0.0' })
    expect(await companionSupport('1.21.1', 'quilt')).toEqual({ supported: true, version: '2.0.0' })
    expect(await companionSupport('1.20.1', 'fabric')).toEqual({ supported: false, version: null })

    expect(await syncCompanionMod(versionPath, conf(true), { refresh: true })).toBe(NEW_FILE)
    expect(cdn.refreshed).toBe(1)
    expect((await fs.readdir(mods)).sort()).toEqual([NEW_FILE, 'sodium.jar'])

    await syncCompanionMod(versionPath, conf(true))
    expect(cdn.downloads).toBe(1)

    await fs.writeFile(path.join(mods, NEW_FILE), 'broken')
    await syncCompanionMod(versionPath, conf(true))
    expect(await fs.readFile(path.join(mods, NEW_FILE), 'utf8')).toBe('new jar')

    expect(await syncCompanionMod(versionPath, conf(false))).toBeNull()
    expect(await fs.readdir(mods)).toEqual(['sodium.jar'])

    expect(await syncCompanionMod(versionPath, conf(true, '1.20.1'))).toBeNull()
    expect(await fs.readdir(mods)).toEqual(['sodium.jar'])
  })

  it('puts the fabric jar into a quilt instance', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    expect(await syncCompanionMod(versionPath, conf(true, '1.21', 'quilt'))).toBe(NEW_FILE)
  })

  it('keeps the jar switched off when the player or the culprit search turned it off', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    await fs.ensureDir(mods)
    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.0+fabric-1.21.1.jar.disabled'), 'old jar')

    expect(await syncCompanionMod(versionPath, conf(true))).toBeNull()
    expect(await fs.readdir(mods)).toEqual([`${NEW_FILE}.disabled`])
    expect(await fs.readFile(path.join(mods, `${NEW_FILE}.disabled`), 'utf8')).toBe('new jar')
    expect(await syncCompanionMod(versionPath, conf(true))).toBeNull()
    expect(cdn.downloads).toBe(1)
  })

  it('creates the mods folder for a fresh instance', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    expect(await syncCompanionMod(versionPath, conf(true))).toBe(NEW_FILE)
    expect(await fs.readdir(mods)).toEqual([NEW_FILE])
  })

  it('leaves the mods folder alone when the jar or the manifest cannot be had', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    await fs.ensureDir(mods)
    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.0+fabric-1.21.1.jar'), 'old jar')

    cdn.offline = true
    await expect(syncCompanionMod(versionPath, conf(true))).rejects.toThrow('offline')
    expect(await fs.readdir(mods)).toEqual(['grubie-companion-1.0.0+fabric-1.21.1.jar'])

    cdn.manifest = null
    await expect(syncCompanionMod(versionPath, conf(true))).rejects.toThrow('manifest')
    expect(await fs.readdir(mods)).toEqual(['grubie-companion-1.0.0+fabric-1.21.1.jar'])
  })

  it('refuses a cached jar that does not match the manifest', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    await fs.outputFile(path.join(cdn.root, 'cache', `${sha256('new jar')}.jar`), 'tampered')
    await expect(syncCompanionMod(versionPath, conf(true))).rejects.toThrow('changed on disk')
    expect(await fs.readdir(mods)).toEqual([])
  })

  it('does not ask the network for vanilla or switched-off instances', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    cdn.manifest = null
    expect(await syncCompanionMod(versionPath, conf(true, '1.21.1', 'vanilla'), { refresh: true })).toBeNull()
    expect(await syncCompanionMod(versionPath, conf(false), { refresh: true })).toBeNull()
    expect(cdn.refreshed).toBe(0)
  })
})
