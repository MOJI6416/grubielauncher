import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { createHash, generateKeyPairSync, sign } from 'crypto'
import type { DownloadItem } from '@/types/Downloader'
import { parseSigningKeys } from '../utilities/updateSignature'
import { COMPANION_MANIFEST_URL, companionManifestMessage } from './companionManifest'

const state = vi.hoisted(() => ({
  root: '',
  keys: [] as unknown[],
  responses: new Map<string, () => unknown>(),
  requested: [] as string[],
  files: new Map<string, string>(),
  downloads: [] as DownloadItem[]
}))

vi.mock('../utilities/other', () => ({
  getLauncherPaths: () => ({ launcher: state.root })
}))

vi.mock('../journal/journal', () => ({
  journal: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), failure: vi.fn() }
}))

vi.mock('../utilities/mirrorState', () => ({
  getDownloadSource: () => 'auto',
  getMojangReachable: () => null,
  isMirrorDisabled: () => false
}))

vi.mock('../utilities/updateSignature', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utilities/updateSignature')>()),
  updateSigningKeys: () => state.keys
}))

vi.mock('axios', () => ({
  default: {
    get: async (url: string) => {
      state.requested.push(url)
      const respond = state.responses.get(url)
      if (!respond) throw new Error(`ENOTFOUND ${url}`)
      return { data: respond() }
    }
  }
}))

vi.mock('../utilities/downloader', () => ({
  Downloader: class {
    async downloadFiles(items: DownloadItem[]) {
      for (const item of items) {
        state.downloads.push(item)
        const content = state.files.get(item.url)
        if (content === undefined) throw new Error(`Download failed: ${item.url}`)
        await fs.outputFile(item.destination, content)
      }
      return null
    }
  }
}))

const MIRROR_URL = 'https://mirror.grubielauncher.com/storage/companion/manifest.json'
const primary = generateKeyPairSync('ed25519')
const stranger = generateKeyPairSync('ed25519')
state.keys = parseSigningKeys([
  { id: 'primary', spki: primary.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }
])

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')
const FILE = 'grubie-companion-2.0.0+fabric-1.21.1.jar'
const JAR_URL = `https://cdn.grubielauncher.com/companion/2.0.0/${encodeURIComponent(FILE)}`

function envelopeText(sequence: number, content = 'jar bytes', key = primary.privateKey): string {
  const signed = JSON.stringify({
    format: 1,
    sequence,
    published: '2026-11-21T12:00:00Z',
    mods: {
      '2.0.0': {
        protocol: 2,
        minecraft: {
          '1.21.1': { fabric: { file: FILE, url: JAR_URL, sha256: sha256(content), size: content.length } }
        }
      }
    }
  })
  return JSON.stringify({
    keyId: 'primary',
    signature: sign(null, companionManifestMessage(signed), key).toString('base64'),
    signed
  })
}

function serve(url: string, body: string) {
  state.responses.set(url, () => body)
}

const companionDir = () => path.join(state.root, 'companion')

async function freshModule() {
  vi.resetModules()
  return import('./companionCdn')
}

describe('companion manifest from the CDN', () => {
  beforeEach(async () => {
    state.root = await fs.mkdtemp(path.join(os.tmpdir(), 'companion-cdn-'))
    state.responses.clear()
    state.requested = []
    state.files.clear()
    state.downloads = []
  })

  afterEach(async () => {
    await fs.remove(state.root)
  })

  it('asks the CDN first and the mirrors after it', async () => {
    const { companionManifestCandidates } = await freshModule()
    const candidates = companionManifestCandidates()
    expect(candidates[0]).toBe(COMPANION_MANIFEST_URL)
    expect(candidates).toContain(MIRROR_URL)
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('keeps the verified envelope and its sequence', async () => {
    const { refreshCompanionManifest } = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(7))

    expect((await refreshCompanionManifest())?.sequence).toBe(7)
    expect(state.requested).toEqual([COMPANION_MANIFEST_URL])
    expect(await fs.readJson(path.join(companionDir(), 'state.json'))).toEqual({ sequence: 7 })
    expect(await fs.readJson(path.join(companionDir(), 'manifest.json'))).toEqual(JSON.parse(envelopeText(7)))
  })

  it('falls back to the mirror when the CDN is unreachable or serves a bad signature', async () => {
    const { refreshCompanionManifest } = await freshModule()
    serve(MIRROR_URL, envelopeText(3))
    expect((await refreshCompanionManifest())?.sequence).toBe(3)
    expect(state.requested.slice(0, 2)).toEqual([COMPANION_MANIFEST_URL, MIRROR_URL])

    serve(COMPANION_MANIFEST_URL, envelopeText(9, 'jar bytes', stranger.privateKey))
    serve(MIRROR_URL, envelopeText(4))
    expect((await refreshCompanionManifest())?.sequence).toBe(4)
  })

  it('refuses an older sequence and keeps the newer one, also after a restart', async () => {
    let cdn = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(7))
    await cdn.refreshCompanionManifest()

    serve(COMPANION_MANIFEST_URL, envelopeText(6))
    expect((await cdn.refreshCompanionManifest())?.sequence).toBe(7)

    cdn = await freshModule()
    expect((await cdn.refreshCompanionManifest())?.sequence).toBe(7)
    expect(await fs.readJson(path.join(companionDir(), 'state.json'))).toEqual({ sequence: 7 })

    serve(COMPANION_MANIFEST_URL, envelopeText(7, 'other bytes'))
    const same = await cdn.refreshCompanionManifest()
    expect(same?.mods['2.0.0'].minecraft['1.21.1'].fabric.sha256).toBe(sha256('other bytes'))
  })

  it('remembers the accepted sequence even without the cached envelope', async () => {
    await fs.outputJson(path.join(companionDir(), 'state.json'), { sequence: 9 })
    const cdn = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(8))
    serve(MIRROR_URL, envelopeText(8))
    expect(await cdn.refreshCompanionManifest()).toBeNull()
    expect(await fs.pathExists(path.join(companionDir(), 'manifest.json'))).toBe(false)
  })

  it('uses the last verified manifest and jar offline', async () => {
    let cdn = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(5))
    state.files.set(JAR_URL, 'jar bytes')
    const manifest = await cdn.refreshCompanionManifest()
    const jar = manifest!.mods['2.0.0'].minecraft['1.21.1'].fabric
    const cached = await cdn.companionJarFile(jar)
    expect(cached).toBe(path.join(companionDir(), 'jars', `${sha256('jar bytes')}.jar`))
    expect(state.downloads[0]).toMatchObject({ url: JAR_URL, checksum: sha256('jar bytes'), checksumType: 'sha256' })

    state.responses.clear()
    state.files.clear()
    state.downloads = []
    cdn = await freshModule()
    expect((await cdn.refreshCompanionManifest())?.sequence).toBe(5)
    expect((await cdn.loadCompanionManifest())?.sequence).toBe(5)
    expect(await cdn.companionJarFile(jar)).toBe(cached)
    expect(state.downloads).toEqual([])
  })

  it('loads the cache without the network and fetches only when there is none', async () => {
    let cdn = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(2))
    expect((await cdn.loadCompanionManifest())?.sequence).toBe(2)
    expect(state.requested).toHaveLength(1)

    cdn = await freshModule()
    expect((await cdn.loadCompanionManifest())?.sequence).toBe(2)
    expect(state.requested).toHaveLength(1)
  })

  it('ignores a cached envelope that no longer verifies', async () => {
    await fs.outputFile(
      path.join(companionDir(), 'manifest.json'),
      envelopeText(4, 'jar bytes', stranger.privateKey)
    )
    const cdn = await freshModule()
    expect(await cdn.loadCompanionManifest()).toBeNull()
  })

  it('downloads again when the cached jar is damaged and refuses a wrong download', async () => {
    const cdn = await freshModule()
    serve(COMPANION_MANIFEST_URL, envelopeText(1))
    const manifest = await cdn.refreshCompanionManifest()
    const jar = manifest!.mods['2.0.0'].minecraft['1.21.1'].fabric
    const cachedPath = path.join(companionDir(), 'jars', `${jar.sha256}.jar`)

    await fs.outputFile(cachedPath, 'damaged')
    state.files.set(JAR_URL, 'jar bytes')
    expect(await cdn.companionJarFile(jar)).toBe(cachedPath)
    expect(await fs.readFile(cachedPath, 'utf8')).toBe('jar bytes')

    await fs.outputFile(cachedPath, 'damaged')
    state.files.set(JAR_URL, 'something else')
    await expect(cdn.companionJarFile(jar)).rejects.toThrow('sha256')
    expect(await fs.pathExists(cachedPath)).toBe(false)
  })
})
