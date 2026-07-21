import path from 'path'
import { app } from 'electron'
import fs from 'fs-extra'

const blessedRoots = new Set<string>()
let persistedRootsLoaded = false

function getPersistedRootsPath(): string {
  // Keep this outside renderer-writable launcher roots; otherwise a compromised
  // renderer could edit the allow-list and grant itself arbitrary filesystem access.
  return path.join(app.getPath('userData'), 'allowed-paths.json')
}

function loadPersistedRoots(): void {
  if (persistedRootsLoaded) return
  persistedRootsLoaded = true

  try {
    const stored = fs.readJsonSync(getPersistedRootsPath())
    if (!Array.isArray(stored)) return
    for (const value of stored) {
      if (typeof value === 'string' && value && !value.includes('\0')) {
        blessedRoots.add(path.resolve(value))
      }
    }
  } catch {
    // The allow-list is optional and is created after the first user selection.
  }
}

function persistBlessedRoots(): void {
  try {
    const target = getPersistedRootsPath()
    fs.ensureDirSync(path.dirname(target))
    fs.writeJsonSync(target, [...blessedRoots], { spaces: 2, mode: 0o600 })
  } catch {
    // A failed persistence must not make the current user selection unusable.
  }
}

function getLauncherRoots(): string[] {
  return [
    path.join(app.getPath('appData'), '.grubielauncher'),
    app.getPath('temp'),
  ]
}

export function blessUserSelectedPath(target: string, kind: 'file' | 'folder'): void {
  if (!target || typeof target !== 'string') return
  try {
    const resolved = path.resolve(target)
    blessedRoots.add(kind === 'folder' ? resolved : path.dirname(resolved))
    persistBlessedRoots()
  } catch {
    // ignore malformed paths
  }
}

function isInside(child: string, root: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function canonicalize(target: string): string | null {
  const resolved = path.resolve(target)
  let existing = resolved

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) return null
    existing = parent
  }

  try {
    const realExisting = fs.realpathSync.native(existing)
    return path.resolve(realExisting, path.relative(existing, resolved))
  } catch {
    return null
  }
}

function isAllowedPath(target: string, roots: string[]): boolean {
  loadPersistedRoots()
  const canonicalTarget = canonicalize(target)
  if (!canonicalTarget) return false

  return [...roots, ...blessedRoots].some((root) => {
    const canonicalRoot = canonicalize(root)
    return canonicalRoot ? isInside(canonicalTarget, canonicalRoot) : false
  })
}

export function isWritablePath(target: unknown): target is string {
  if (typeof target !== 'string' || target === '' || target.includes('\0')) {
    return false
  }

  let resolved: string
  try {
    resolved = path.resolve(target)
  } catch {
    return false
  }

  return isAllowedPath(resolved, getLauncherRoots())
}

export function assertWritablePath(target: string, label = 'path'): string {
  if (!isWritablePath(target)) {
    throw new Error(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}

function getReadableRoots(): string[] {
  const roots = [...getLauncherRoots(), app.getPath('downloads'), app.getAppPath()]
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    roots.push(process.resourcesPath)
  }
  return roots
}

export function isReadablePath(target: unknown): target is string {
  if (typeof target !== 'string' || target === '' || target.includes('\0')) {
    return false
  }

  let resolved: string
  try {
    resolved = path.resolve(target)
  } catch {
    return false
  }

  return isAllowedPath(resolved, getReadableRoots())
}

export function assertReadablePath(target: string, label = 'path'): string {
  if (!isReadablePath(target)) {
    throw new Error(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}
