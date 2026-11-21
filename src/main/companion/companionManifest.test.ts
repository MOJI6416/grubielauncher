import { describe, expect, it } from 'vitest'
import { generateKeyPairSync, sign, type KeyObject } from 'crypto'
import { COMPANION_PROTOCOL } from '@/shared/companion'
import { parseSigningKeys } from '../utilities/updateSignature'
import {
  type CompanionEnvelope,
  companionManifestMessage,
  parseCompanionEnvelope,
  parseCompanionManifest,
  pickCompanionJar,
  verifyCompanionEnvelope
} from './companionManifest'

function keyPair(id: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  return { id, privateKey, entry: { id, spki } }
}

const primary = keyPair('primary')
const reserve = keyPair('reserve')
const stranger = keyPair('stranger')
const keys = parseSigningKeys([primary.entry, reserve.entry])

function jar(version: string, loader: string, minecraft: string) {
  const file = `grubie-companion-${version}+${loader}-${minecraft}.jar`
  return {
    file,
    url: `https://cdn.grubielauncher.com/companion/${version}/${encodeURIComponent(file)}`,
    sha256: 'ab'.repeat(32),
    size: 81018
  }
}

function manifest(extra: Record<string, unknown> = {}) {
  return {
    format: 1,
    sequence: 7,
    published: '2026-11-21T12:00:00Z',
    mods: {
      '2.0.0': {
        protocol: 2,
        minecraft: {
          '1.20.1': { fabric: jar('2.0.0', 'fabric', '1.20.1'), forge: jar('2.0.0', 'forge', '1.20.1') }
        }
      }
    },
    ...extra
  }
}

function envelope(value: unknown, privateKey: KeyObject = primary.privateKey, keyId = 'primary'): CompanionEnvelope {
  const signed = JSON.stringify(value)
  return {
    keyId,
    signature: sign(null, companionManifestMessage(signed), privateKey).toString('base64'),
    signed
  }
}

function withJar(patch: Record<string, unknown>) {
  return manifest({
    mods: { '2.0.0': { protocol: 2, minecraft: { '1.20.1': { fabric: { ...jar('2.0.0', 'fabric', '1.20.1'), ...patch } } } } }
  })
}

describe('companion manifest signature', () => {
  it('accepts either launcher key whatever the key id says', () => {
    expect(verifyCompanionEnvelope(envelope(manifest()), keys)?.sequence).toBe(7)
    expect(verifyCompanionEnvelope(envelope(manifest(), reserve.privateKey, 'reserve'), keys)?.sequence).toBe(7)
    expect(verifyCompanionEnvelope(envelope(manifest(), reserve.privateKey, 'primary'), keys)?.sequence).toBe(7)
  })

  it('signs the context line together with the manifest text', () => {
    expect(companionManifestMessage('{"a":1}').toString('utf8')).toBe('grubie-companion-manifest\n{"a":1}')
  })

  it('rejects a foreign key, an edited manifest and a broken signature', () => {
    expect(verifyCompanionEnvelope(envelope(manifest(), stranger.privateKey), keys)).toBeNull()

    const signed = envelope(manifest())
    expect(verifyCompanionEnvelope({ ...signed, signed: signed.signed.replace('"sequence":7', '"sequence":8') }, keys)).toBeNull()
    expect(verifyCompanionEnvelope({ ...signed, signature: signed.signature.slice(0, 40) }, keys)).toBeNull()
    expect(verifyCompanionEnvelope({ ...signed, signature: '' }, keys)).toBeNull()
  })

  it('rejects a signed text that is not a manifest', () => {
    expect(verifyCompanionEnvelope(envelope('not a manifest'), keys)).toBeNull()
    const garbage = 'not json'
    expect(
      verifyCompanionEnvelope(
        {
          keyId: 'primary',
          signature: sign(null, companionManifestMessage(garbage), primary.privateKey).toString('base64'),
          signed: garbage
        },
        keys
      )
    ).toBeNull()
  })

  it('reads only well-formed envelopes', () => {
    expect(parseCompanionEnvelope(null)).toBeNull()
    expect(parseCompanionEnvelope([])).toBeNull()
    expect(parseCompanionEnvelope({ signature: 'x' })).toBeNull()
    expect(parseCompanionEnvelope({ signature: 'x', signed: {} })).toBeNull()
    expect(parseCompanionEnvelope({ signature: 'x', signed: 'y' })).toEqual({ keyId: '', signature: 'x', signed: 'y' })
  })
})

describe('companion manifest contents', () => {
  it('parses the published shape', () => {
    const parsed = parseCompanionManifest(manifest())
    expect(parsed?.mods['2.0.0'].minecraft['1.20.1'].forge.file).toBe('grubie-companion-2.0.0+forge-1.20.1.jar')
  })

  it('rejects an unknown format and a bad sequence', () => {
    expect(parseCompanionManifest(manifest({ format: 2 }))).toBeNull()
    expect(parseCompanionManifest(manifest({ format: '1' }))).toBeNull()
    expect(parseCompanionManifest(manifest({ sequence: -1 }))).toBeNull()
    expect(parseCompanionManifest(manifest({ sequence: 1.5 }))).toBeNull()
    expect(parseCompanionManifest(manifest({ published: 5 }))).toBeNull()
    expect(parseCompanionManifest(manifest({ mods: { latest: manifest().mods['2.0.0'] } }))).toBeNull()
  })

  it.each([
    ['http', { url: 'http://cdn.grubielauncher.com/companion/2.0.0/grubie-companion-2.0.0+fabric-1.20.1.jar' }],
    ['another host', { url: 'https://evil.example/companion/2.0.0/grubie-companion-2.0.0+fabric-1.20.1.jar' }],
    ['a look-alike host', { url: 'https://cdn.grubielauncher.com.evil.example/x.jar' }],
    ['a port', { url: 'https://cdn.grubielauncher.com:8443/companion/x.jar' }],
    ['credentials', { url: 'https://user@cdn.grubielauncher.com/companion/x.jar' }],
    ['a foreign file name', { file: 'sodium-0.5.jar' }],
    ['a disabled file name', { file: 'grubie-companion-2.0.0+fabric-1.20.1.jar.disabled' }],
    ['a forward slash', { file: 'grubie-companion-2.0.0/../../evil.jar' }],
    ['a backslash', { file: 'grubie-companion-2.0.0\\..\\evil.jar' }],
    ['a drive stream', { file: 'grubie-companion-2.0.0:evil.jar' }],
    ['a non-hex sha256', { sha256: 'zz'.repeat(32) }],
    ['a short sha256', { sha256: 'ab'.repeat(20) }],
    ['a zero size', { size: 0 }]
  ])('rejects a jar with %s', (_, patch) => {
    expect(parseCompanionManifest(withJar(patch))).toBeNull()
    expect(verifyCompanionEnvelope(envelope(withJar(patch)), keys)).toBeNull()
  })

  it('keeps an upper-case hash as lower case', () => {
    const parsed = parseCompanionManifest(withJar({ sha256: 'AB'.repeat(32) }))
    expect(parsed?.mods['2.0.0'].minecraft['1.20.1'].fabric.sha256).toBe('ab'.repeat(32))
  })
})

describe('companion jar selection', () => {
  const catalog = parseCompanionManifest({
    format: 1,
    sequence: 9,
    published: '2026-11-21T12:00:00Z',
    mods: {
      '1.0.0': {
        protocol: 1,
        minecraft: {
          '1.20': { fabric: jar('1.0.0', 'fabric', '1.20') },
          '1.20.1': { fabric: jar('1.0.0', 'fabric', '1.20.1'), neoforge: jar('1.0.0', 'neoforge', '1.20.1') }
        }
      },
      '10.0.0': {
        protocol: COMPANION_PROTOCOL + 1,
        minecraft: { '1.20.1': { fabric: jar('10.0.0', 'fabric', '1.20.1') } }
      },
      '2.0.0': {
        protocol: COMPANION_PROTOCOL,
        minecraft: { '1.20.1': { fabric: jar('2.0.0', 'fabric', '1.20.1') } }
      },
      '2.1.0-beta.1': {
        protocol: COMPANION_PROTOCOL,
        minecraft: { '1.20.1': { fabric: jar('2.1.0-beta.1', 'fabric', '1.20.1') } }
      },
      '1.10.0': {
        protocol: 1,
        minecraft: { '1.20.1': { forge: jar('1.10.0', 'forge', '1.20.1') } }
      },
      '1.9.0': {
        protocol: 1,
        minecraft: { '1.20.1': { forge: jar('1.9.0', 'forge', '1.20.1') } }
      }
    }
  })

  it('picks the newest version the launcher speaks', () => {
    expect(pickCompanionJar(catalog, '1.20.1', 'fabric')?.version).toBe('2.1.0-beta.1')
    expect(pickCompanionJar(catalog, '1.20.1', 'forge')?.version).toBe('1.10.0')
    expect(pickCompanionJar(catalog, '1.20.1', 'neoforge')).toMatchObject({
      version: '1.0.0',
      protocol: 1,
      file: 'grubie-companion-1.0.0+neoforge-1.20.1.jar'
    })
  })

  it('runs the fabric jar on quilt', () => {
    expect(pickCompanionJar(catalog, '1.20.1', 'quilt')?.file).toBe('grubie-companion-2.1.0-beta.1+fabric-1.20.1.jar')
    expect(pickCompanionJar(catalog, '1.20', 'quilt')?.version).toBe('1.0.0')
  })

  it('matches the exact Minecraft id and loader only', () => {
    expect(pickCompanionJar(catalog, '1.20', 'fabric')?.version).toBe('1.0.0')
    expect(pickCompanionJar(catalog, '1.20.2', 'fabric')).toBeNull()
    expect(pickCompanionJar(catalog, '1.20.1', 'vanilla')).toBeNull()
    expect(pickCompanionJar(catalog, 'constructor', 'fabric')).toBeNull()
    expect(pickCompanionJar(catalog, '1.20.1', '__proto__')).toBeNull()
    expect(pickCompanionJar(null, '1.20.1', 'fabric')).toBeNull()
  })

  it('compares release versions numerically', () => {
    const plain = parseCompanionManifest({
      format: 1,
      sequence: 1,
      published: '2026-11-21T12:00:00Z',
      mods: {
        '2.1.0-beta.1': { protocol: 1, minecraft: { '1.21.1': { fabric: jar('2.1.0-beta.1', 'fabric', '1.21.1') } } },
        '2.1.0': { protocol: 1, minecraft: { '1.21.1': { fabric: jar('2.1.0', 'fabric', '1.21.1') } } },
        '2.10.0': { protocol: 1, minecraft: { '1.21.1': { fabric: jar('2.10.0', 'fabric', '1.21.1') } } },
        '2.9.0': { protocol: 1, minecraft: { '1.21.1': { fabric: jar('2.9.0', 'fabric', '1.21.1') } } }
      }
    })
    expect(pickCompanionJar(plain, '1.21.1', 'fabric')?.version).toBe('2.10.0')
  })
})
