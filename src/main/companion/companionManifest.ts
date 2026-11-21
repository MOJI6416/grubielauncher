import { type KeyObject, verify } from 'crypto'
import { COMPANION_PROTOCOL, isCompanionModFile } from '@/shared/companion'
import { compareLoaderVersions } from '@/shared/loaderCompat'
import { updateSigningKeys } from '../utilities/updateSignature'

export const COMPANION_CDN_HOST = 'cdn.grubielauncher.com'
export const COMPANION_MANIFEST_URL = `https://${COMPANION_CDN_HOST}/companion/manifest.json`
export const COMPANION_MANIFEST_FORMAT = 1

const SIGNATURE_CONTEXT = 'grubie-companion-manifest\n'
const MOD_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const JAR_NAME = /^[0-9A-Za-z._+-]+$/
const SHA256 = /^[0-9a-f]{64}$/i

export interface CompanionJar {
  file: string
  url: string
  sha256: string
  size: number
}

export interface CompanionModRelease {
  protocol: number
  minecraft: Record<string, Record<string, CompanionJar>>
}

export interface CompanionManifest {
  format: number
  sequence: number
  published: string
  mods: Record<string, CompanionModRelease>
}

export interface CompanionEnvelope {
  keyId: string
  signature: string
  signed: string
}

export interface CompanionPick extends CompanionJar {
  version: string
  protocol: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCount(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

function own<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
}

export function companionManifestMessage(signed: string): Buffer {
  return Buffer.from(`${SIGNATURE_CONTEXT}${signed}`, 'utf8')
}

export function isCompanionCdnUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      url.host === COMPANION_CDN_HOST &&
      url.username === '' &&
      url.password === ''
    )
  } catch {
    return false
  }
}

function parseJar(value: unknown): CompanionJar | null {
  if (!isRecord(value)) return null
  const { file, url, sha256, size } = value
  if (
    typeof file !== 'string' ||
    !JAR_NAME.test(file) ||
    !isCompanionModFile(file) ||
    !file.toLowerCase().endsWith('.jar') ||
    typeof url !== 'string' ||
    !isCompanionCdnUrl(url) ||
    typeof sha256 !== 'string' ||
    !SHA256.test(sha256) ||
    !isCount(size, 1)
  ) {
    return null
  }
  return { file, url, sha256: sha256.toLowerCase(), size }
}

function parseRelease(value: unknown): CompanionModRelease | null {
  if (!isRecord(value) || !isCount(value.protocol, 1) || !isRecord(value.minecraft)) return null
  const minecraft: [string, Record<string, CompanionJar>][] = []
  for (const [id, loaders] of Object.entries(value.minecraft)) {
    if (!isRecord(loaders)) return null
    const jars: [string, CompanionJar][] = []
    for (const [loader, entry] of Object.entries(loaders)) {
      const jar = parseJar(entry)
      if (!jar) return null
      jars.push([loader, jar])
    }
    minecraft.push([id, Object.fromEntries(jars)])
  }
  return { protocol: value.protocol, minecraft: Object.fromEntries(minecraft) }
}

export function parseCompanionManifest(value: unknown): CompanionManifest | null {
  if (!isRecord(value) || value.format !== COMPANION_MANIFEST_FORMAT) return null
  const { sequence, published, mods } = value
  if (!isCount(sequence, 0) || typeof published !== 'string' || !isRecord(mods)) return null
  const releases: [string, CompanionModRelease][] = []
  for (const [version, entry] of Object.entries(mods)) {
    if (!MOD_VERSION.test(version)) return null
    const release = parseRelease(entry)
    if (!release) return null
    releases.push([version, release])
  }
  return {
    format: COMPANION_MANIFEST_FORMAT,
    sequence,
    published,
    mods: Object.fromEntries(releases)
  }
}

export function parseCompanionEnvelope(value: unknown): CompanionEnvelope | null {
  if (!isRecord(value) || typeof value.signature !== 'string' || typeof value.signed !== 'string') {
    return null
  }
  return {
    keyId: typeof value.keyId === 'string' ? value.keyId : '',
    signature: value.signature,
    signed: value.signed
  }
}

export function verifyCompanionEnvelope(
  envelope: CompanionEnvelope,
  keys: { id: string; key: KeyObject }[] = updateSigningKeys()
): CompanionManifest | null {
  const signature = Buffer.from(envelope.signature, 'base64')
  if (signature.length !== 64) return null
  const message = companionManifestMessage(envelope.signed)
  if (!keys.some(({ key }) => verify(null, message, key, signature))) return null
  try {
    return parseCompanionManifest(JSON.parse(envelope.signed))
  } catch {
    return null
  }
}

export function companionLoaderOf(loader: string): string {
  return loader === 'quilt' ? 'fabric' : loader
}

export function pickCompanionJar(
  manifest: CompanionManifest | null,
  minecraft: string,
  loader: string
): CompanionPick | null {
  if (!manifest) return null
  const wanted = companionLoaderOf(loader)
  let best: CompanionPick | null = null
  for (const [version, release] of Object.entries(manifest.mods)) {
    if (release.protocol > COMPANION_PROTOCOL) continue
    const loaders = own(release.minecraft, minecraft)
    const jar = loaders ? own(loaders, wanted) : undefined
    if (!jar) continue
    if (best && compareLoaderVersions(version, best.version) <= 0) continue
    best = { ...jar, version, protocol: release.protocol }
  }
  return best
}
