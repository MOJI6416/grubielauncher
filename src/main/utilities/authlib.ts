import { IAuthlib } from '@/types/IAuthlib'
import { IVersionManifest } from '@/types/IVersionManifest'
import { Backend } from '../services/Backend'
import fs from 'fs-extra'
import path from 'path'
import { getDataRoot } from './dataRoot'

const OWN_CDN_HOST = 'cdn.grubielauncher.com'
const FRESH_WAIT_MS = 3000

let inMemoryAuthlib: IAuthlib | null = null
let refreshPromise: Promise<IAuthlib | null> | null = null

function getCachePath(): string {
  return path.join(getDataRoot(), 'cache', 'authlib.json')
}

function isValidAuthlib(value: unknown): value is IAuthlib {
  const candidate = value as Partial<IAuthlib> | null
  return (
    !!candidate &&
    typeof candidate.name === 'string' &&
    typeof candidate.url === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.sha1 === 'string'
  )
}

function isOwnCdn(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === OWN_CDN_HOST
  } catch {
    return false
  }
}

async function readCachedAuthlib(): Promise<IAuthlib | null> {
  try {
    const cached = await fs.readJSON(getCachePath())
    return isValidAuthlib(cached) ? cached : null
  } catch {
    return null
  }
}

async function fetchAndCacheAuthlib(): Promise<IAuthlib | null> {
  const backend = new Backend()
  const fresh = await backend.getAuthlib()
  if (!isValidAuthlib(fresh)) return null

  inMemoryAuthlib = fresh
  try {
    await fs.ensureDir(path.dirname(getCachePath()))
    await fs.writeJSON(getCachePath(), fresh, { spaces: 2 })
  } catch {}

  return fresh
}

function refreshAuthlibInBackground(): Promise<IAuthlib | null> {
  if (!refreshPromise) {
    refreshPromise = fetchAndCacheAuthlib()
      .catch(() => null)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export async function getAuthlibCached(): Promise<IAuthlib | null> {
  if (inMemoryAuthlib) return inMemoryAuthlib

  const cached = await readCachedAuthlib()
  if (cached) {
    const refresh = refreshAuthlibInBackground()
    if (!isOwnCdn(cached.url)) {
      const fresh = await Promise.race([
        refresh,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FRESH_WAIT_MS))
      ])
      if (fresh) return fresh
    }
    inMemoryAuthlib ??= cached
    return inMemoryAuthlib
  }

  return await fetchAndCacheAuthlib()
}

export function syncAuthlibLibrary(manifest: Pick<IVersionManifest, 'libraries'>, authlib: IAuthlib): boolean {
  const artifact = {
    url: authlib.url,
    path: authlib.path,
    size: authlib.size,
    sha1: authlib.sha1
  }
  const existing = manifest.libraries.find((lib) => lib.name === authlib.name)
  if (!existing) {
    manifest.libraries.push({ name: authlib.name, downloads: { artifact } })
    return true
  }
  const current = existing.downloads?.artifact
  if (
    current?.url === artifact.url &&
    current.path === artifact.path &&
    current.sha1 === artifact.sha1 &&
    current.size === artifact.size
  ) {
    return false
  }
  existing.downloads = { ...existing.downloads, artifact }
  return true
}
