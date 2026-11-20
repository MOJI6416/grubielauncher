import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { createHash } from 'crypto'

const paths = vi.hoisted(() => ({ root: '' }))

vi.mock('../../../resources/icon.png?asset', () => ({
  get default() {
    return `${paths.root}/resources/icon.png`
  }
}))

const sha1 = (data: string) => createHash('sha1').update(data).digest('hex')

describe('companion mod files', () => {
  let versionPath: string

  beforeEach(async () => {
    paths.root = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-'))
    versionPath = path.join(paths.root, 'instance')
    const resources = path.join(paths.root, 'resources', 'companion')
    await fs.ensureDir(resources)
    await fs.writeFile(path.join(resources, 'grubie-companion-1.0.1+fabric-1.21.1.jar'), 'new jar')
    await fs.writeJson(path.join(resources, 'manifest.json'), {
      version: '1.0.1',
      files: [
        {
          file: 'grubie-companion-1.0.1+fabric-1.21.1.jar',
          loader: 'fabric',
          minecraft: ['1.21', '1.21.1'],
          sha1: sha1('new jar'),
          size: 7
        },
        { file: '../evil.jar', loader: 'fabric', minecraft: ['1.20.1'], sha1: 'x' }
      ]
    })
    vi.resetModules()
  })

  afterEach(async () => {
    await fs.remove(paths.root)
  })

  const conf = (companionMod: boolean, id = '1.21.1', loader = 'fabric') => ({
    companionMod,
    version: { id },
    loader: { name: loader }
  })

  it('installs, updates and removes only its own jar', async () => {
    const { syncCompanionMod, companionSupport } = await import('./companionMod')
    const mods = path.join(versionPath, 'mods')
    await fs.ensureDir(mods)
    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.0+fabric-1.21.1.jar'), 'old jar')
    await fs.writeFile(path.join(mods, 'sodium.jar'), 'sodium')

    expect(await companionSupport('1.21.1', 'fabric')).toEqual({ supported: true, version: '1.0.1' })
    expect(await companionSupport('1.20.1', 'fabric')).toEqual({ supported: false, version: null })

    const installed = await syncCompanionMod(versionPath, conf(true))
    expect(installed?.file).toBe('grubie-companion-1.0.1+fabric-1.21.1.jar')
    expect((await fs.readdir(mods)).sort()).toEqual([
      'grubie-companion-1.0.1+fabric-1.21.1.jar',
      'sodium.jar'
    ])

    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.1+fabric-1.21.1.jar'), 'broken')
    await syncCompanionMod(versionPath, conf(true))
    expect(await fs.readFile(path.join(mods, 'grubie-companion-1.0.1+fabric-1.21.1.jar'), 'utf8')).toBe('new jar')

    expect(await syncCompanionMod(versionPath, conf(false))).toBeNull()
    expect(await fs.readdir(mods)).toEqual(['sodium.jar'])

    expect(await syncCompanionMod(versionPath, conf(true, '1.20.1'))).toBeNull()
    expect(await fs.readdir(mods)).toEqual(['sodium.jar'])
  })

  it('keeps the jar switched off when the player or the culprit search turned it off', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    const mods = path.join(versionPath, 'mods')
    await fs.ensureDir(mods)
    await fs.writeFile(path.join(mods, 'grubie-companion-1.0.0+fabric-1.21.1.jar.disabled'), 'old jar')

    expect(await syncCompanionMod(versionPath, conf(true))).toBeNull()
    expect(await fs.readdir(mods)).toEqual(['grubie-companion-1.0.1+fabric-1.21.1.jar.disabled'])
    expect(await syncCompanionMod(versionPath, conf(true))).toBeNull()
  })

  it('creates the mods folder for a fresh instance', async () => {
    const { syncCompanionMod } = await import('./companionMod')
    expect((await syncCompanionMod(versionPath, conf(true)))?.loader).toBe('fabric')
    expect(await fs.readdir(path.join(versionPath, 'mods'))).toEqual([
      'grubie-companion-1.0.1+fabric-1.21.1.jar'
    ])
  })
})
