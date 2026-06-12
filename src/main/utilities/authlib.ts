import { IAuthlib } from '@/types/IAuthlib'
import { Backend } from '../services/Backend'
import { app } from 'electron'
import fs from 'fs-extra'
import path from 'path'

let inMemoryAuthlib: IAuthlib | null = null
let refreshPromise: Promise<IAuthlib | null> | null = null

function getCachePath(): string {
  return path.join(
    app.getPath('appData'),
    '.grubielauncher',
    'cache',
    'authlib.json'
  )
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

function refreshAuthlibInBackground(): void {
  if (refreshPromise) return

  refreshPromise = fetchAndCacheAuthlib()
    .catch(() => null)
    .finally(() => {
      refreshPromise = null
    })
}

export async function getAuthlibCached(): Promise<IAuthlib | null> {
  if (inMemoryAuthlib) return inMemoryAuthlib

  const cached = await readCachedAuthlib()
  if (cached) {
    inMemoryAuthlib = cached
    refreshAuthlibInBackground()
    return cached
  }

  return await fetchAndCacheAuthlib()
}
