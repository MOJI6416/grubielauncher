import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import { createHash } from 'crypto'
import { journal } from '../journal/journal'
import { getLauncherPaths } from '../utilities/other'
import { writeJsonAtomic } from '../utilities/atomicJson'
import { Downloader } from '../utilities/downloader'
import { resolveDownloadCandidates } from '../utilities/mirrors'
import { getDownloadSource, getMojangReachable, isMirrorDisabled } from '../utilities/mirrorState'
import {
  COMPANION_MANIFEST_URL,
  type CompanionEnvelope,
  type CompanionJar,
  type CompanionManifest,
  parseCompanionEnvelope,
  verifyCompanionEnvelope
} from './companionManifest'

const MANIFEST_TIMEOUT_MS = 4000
const MANIFEST_DEADLINE_MS = 8000
const MAX_ENVELOPE_BYTES = 1024 * 1024
const BACKGROUND_REFRESH_DELAY_MS = 20000
const JAR_DEADLINE_MS = 60000

let current: CompanionManifest | null | undefined
let cacheLoad: Promise<CompanionManifest | null> | null = null
let refreshing: Promise<CompanionManifest | null> | null = null
const pendingJars = new Map<string, Promise<string>>()

function companionDir(): string {
  return path.join(getLauncherPaths().launcher, 'companion')
}

function envelopePath(): string {
  return path.join(companionDir(), 'manifest.json')
}

function statePath(): string {
  return path.join(companionDir(), 'state.json')
}

export function companionJarsDir(): string {
  return path.join(companionDir(), 'jars')
}

export async function sha256Of(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(file)).digest('hex')
  } catch {
    return null
  }
}

async function readCachedManifest(): Promise<CompanionManifest | null> {
  const envelope = parseCompanionEnvelope(await fs.readJson(envelopePath()).catch(() => null))
  return envelope ? verifyCompanionEnvelope(envelope) : null
}

function cachedManifest(): Promise<CompanionManifest | null> {
  if (current !== undefined) return Promise.resolve(current)
  cacheLoad ??= readCachedManifest().then((manifest) => {
    if (current === undefined) current = manifest
    return current
  })
  return cacheLoad
}

async function acceptedSequence(cached: CompanionManifest | null): Promise<number> {
  const state = await fs.readJson(statePath()).catch(() => null)
  const stored = Number.isSafeInteger(state?.sequence) ? (state.sequence as number) : 0
  return Math.max(stored, cached?.sequence ?? 0)
}

export function companionManifestCandidates(): string[] {
  const mirrored = resolveDownloadCandidates(
    COMPANION_MANIFEST_URL,
    getDownloadSource(),
    getMojangReachable(),
    isMirrorDisabled()
  )
  return [COMPANION_MANIFEST_URL, ...mirrored.filter((url) => url !== COMPANION_MANIFEST_URL)]
}

async function fetchManifest(
  floor: number
): Promise<{ envelope: CompanionEnvelope; manifest: CompanionManifest } | null> {
  const deadline = AbortSignal.timeout(MANIFEST_DEADLINE_MS)
  const failures: string[] = []
  for (const url of companionManifestCandidates()) {
    if (deadline.aborted) break
    let body: unknown
    try {
      const response = await axios.get<string>(url, {
        responseType: 'text',
        transformResponse: (data) => data,
        timeout: MANIFEST_TIMEOUT_MS,
        maxContentLength: MAX_ENVELOPE_BYTES,
        signal: deadline
      })
      body = JSON.parse(response.data)
    } catch (error) {
      failures.push(`${url}: ${String(error)}`)
      continue
    }
    const envelope = parseCompanionEnvelope(body)
    const manifest = envelope ? verifyCompanionEnvelope(envelope) : null
    if (!envelope || !manifest) {
      failures.push(`${url}: invalid or unsigned`)
      continue
    }
    if (manifest.sequence < floor) {
      failures.push(`${url}: sequence ${manifest.sequence} is older than ${floor}`)
      continue
    }
    return { envelope, manifest }
  }
  journal.warn('companion', 'manifest not refreshed', { failures })
  return null
}

async function storeManifest(envelope: CompanionEnvelope, manifest: CompanionManifest): Promise<void> {
  await fs.ensureDir(companionDir())
  await writeJsonAtomic(envelopePath(), envelope)
  await writeJsonAtomic(statePath(), { sequence: manifest.sequence })
}

export function refreshCompanionManifest(): Promise<CompanionManifest | null> {
  refreshing ??= (async () => {
    const cached = await cachedManifest()
    const fetched = await fetchManifest(await acceptedSequence(cached))
    if (!fetched) return cached
    current = fetched.manifest
    if (fetched.manifest.sequence !== cached?.sequence) {
      journal.info('companion', 'manifest updated', {
        sequence: fetched.manifest.sequence,
        previous: cached?.sequence ?? null
      })
    }
    await storeManifest(fetched.envelope, fetched.manifest).catch((error) =>
      journal.failure('companion', 'manifest cache not written', error)
    )
    return fetched.manifest
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export async function loadCompanionManifest(): Promise<CompanionManifest | null> {
  if (refreshing) return refreshing
  return (await cachedManifest()) ?? refreshCompanionManifest()
}

export function scheduleCompanionManifestRefresh(): void {
  const timer = setTimeout(() => {
    void refreshCompanionManifest().catch((error) =>
      journal.failure('companion', 'manifest refresh failed', error)
    )
  }, BACKGROUND_REFRESH_DELAY_MS)
  timer.unref?.()
}

async function downloadCompanionJar(jar: CompanionJar): Promise<string> {
  const cached = path.join(companionJarsDir(), `${jar.sha256}.jar`)
  if ((await sha256Of(cached)) === jar.sha256) return cached
  await fs.remove(cached)
  await new Downloader(1).downloadFiles(
    [
      {
        url: jar.url,
        destination: cached,
        group: 'mods',
        checksum: jar.sha256,
        checksumType: 'sha256',
        size: jar.size,
        options: { silent: true }
      }
    ],
    AbortSignal.timeout(JAR_DEADLINE_MS)
  )
  if ((await sha256Of(cached)) !== jar.sha256) {
    await fs.remove(cached)
    throw new Error(`Companion mod ${jar.file} failed the sha256 check after download`)
  }
  return cached
}

export function companionJarFile(jar: CompanionJar): Promise<string> {
  let pending = pendingJars.get(jar.sha256)
  if (!pending) {
    pending = downloadCompanionJar(jar).finally(() => pendingJars.delete(jar.sha256))
    pendingJars.set(jar.sha256, pending)
  }
  return pending
}
