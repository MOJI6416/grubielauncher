import path from 'path'
import { app } from 'electron'
import fs from 'fs-extra'

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathPolicyError'
  }
}

type BlessedKind = 'file' | 'folder'

interface BlessedEntry {
  path: string
  kind: BlessedKind
  addedAt: number
}

const BLESSED_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_BLESSED_ENTRIES = 64
const DOWNLOADS_READABLE_EXTENSIONS = new Set(['.jar', '.zip', '.mrpack', '.litemod'])
const OPENABLE_FILE_EXTENSIONS = new Set(['.txt', '.log', '.json'])

const blessedEntries = new Map<string, BlessedEntry>()
let persistedRootsLoaded = false

function getPersistedRootsPath(): string {
  return path.join(app.getPath('userData'), 'allowed-paths.json')
}

function normalizeStoredEntry(value: unknown, now: number): BlessedEntry | null {
  if (typeof value === 'string') {
    if (!value || value.includes('\0')) return null
    return { path: path.resolve(value), kind: 'folder', addedAt: now }
  }

  if (!value || typeof value !== 'object') return null

  const stored = value as Partial<BlessedEntry>
  if (typeof stored.path !== 'string' || !stored.path || stored.path.includes('\0')) {
    return null
  }

  return {
    path: path.resolve(stored.path),
    kind: stored.kind === 'file' ? 'file' : 'folder',
    addedAt:
      typeof stored.addedAt === 'number' && Number.isFinite(stored.addedAt)
        ? stored.addedAt
        : now
  }
}

function pruneBlessedEntries(): void {
  const now = Date.now()

  for (const [key, entry] of blessedEntries) {
    if (now - entry.addedAt > BLESSED_TTL_MS) blessedEntries.delete(key)
  }

  if (blessedEntries.size <= MAX_BLESSED_ENTRIES) return

  const oldestFirst = [...blessedEntries.values()].sort((a, b) => a.addedAt - b.addedAt)
  for (const entry of oldestFirst.slice(0, blessedEntries.size - MAX_BLESSED_ENTRIES)) {
    blessedEntries.delete(entry.path)
  }
}

function loadPersistedRoots(): void {
  if (persistedRootsLoaded) return
  persistedRootsLoaded = true

  try {
    const stored = fs.readJsonSync(getPersistedRootsPath())
    if (!Array.isArray(stored)) return

    const now = Date.now()
    for (const value of stored) {
      const entry = normalizeStoredEntry(value, now)
      if (entry) blessedEntries.set(entry.path, entry)
    }

    pruneBlessedEntries()
  } catch {}
}

function persistBlessedRoots(): void {
  try {
    const target = getPersistedRootsPath()
    fs.ensureDirSync(path.dirname(target))
    fs.writeJsonSync(target, [...blessedEntries.values()], { spaces: 2, mode: 0o600 })
  } catch {}
}

function getLauncherDataRoot(): string {
  return path.join(app.getPath('appData'), '.grubielauncher')
}

function getLauncherRoots(): string[] {
  return [getLauncherDataRoot(), app.getPath('temp')]
}

function isInside(child: string, root: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isBlessableTarget(resolved: string): boolean {
  if (!path.parse(resolved).base) return false

  try {
    return !isInside(path.resolve(app.getPath('home')), resolved)
  } catch {
    return true
  }
}

export function blessUserSelectedPath(target: string, kind: BlessedKind): void {
  if (!target || typeof target !== 'string' || target.includes('\0')) return

  try {
    const resolved = path.resolve(target)
    if (!isBlessableTarget(resolved)) return

    loadPersistedRoots()
    blessedEntries.set(resolved, { path: resolved, kind, addedAt: Date.now() })
    pruneBlessedEntries()
    persistBlessedRoots()
  } catch {}
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

function matchesBlessedEntry(canonicalTarget: string, entry: BlessedEntry): boolean {
  const canonicalEntry = canonicalize(entry.path)
  if (!canonicalEntry) return false

  return entry.kind === 'file'
    ? canonicalTarget === canonicalEntry
    : isInside(canonicalTarget, canonicalEntry)
}

function isAllowedPath(target: string, roots: string[]): boolean {
  loadPersistedRoots()
  pruneBlessedEntries()

  const canonicalTarget = canonicalize(target)
  if (!canonicalTarget) return false

  const insideRoot = roots.some((root) => {
    const canonicalRoot = canonicalize(root)
    return canonicalRoot ? isInside(canonicalTarget, canonicalRoot) : false
  })
  if (insideRoot) return true

  return [...blessedEntries.values()].some((entry) =>
    matchesBlessedEntry(canonicalTarget, entry)
  )
}

function isUsablePathString(target: unknown): target is string {
  return typeof target === 'string' && target !== '' && !target.includes('\0')
}

function resolveOrNull(target: string): string | null {
  try {
    return path.resolve(target)
  } catch {
    return null
  }
}

export function isWritablePath(target: unknown): target is string {
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false

  return isAllowedPath(resolved, getLauncherRoots())
}

export function assertWritablePath(target: string, label = 'path'): string {
  if (!isWritablePath(target)) {
    throw new PathPolicyError(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}

function getReadableRoots(): string[] {
  const roots = [...getLauncherRoots(), app.getAppPath()]
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    roots.push(process.resourcesPath)
  }
  return roots
}

function isReadableDownloadsPath(resolved: string): boolean {
  let downloadsRoot: string | null
  try {
    downloadsRoot = canonicalize(app.getPath('downloads'))
  } catch {
    return false
  }
  if (!downloadsRoot) return false

  const canonicalTarget = canonicalize(resolved)
  if (!canonicalTarget) return false

  if (canonicalTarget === downloadsRoot) return true
  if (path.dirname(canonicalTarget) !== downloadsRoot) return false

  return DOWNLOADS_READABLE_EXTENSIONS.has(path.extname(canonicalTarget).toLowerCase())
}

export function isReadablePath(target: unknown): target is string {
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false

  return isAllowedPath(resolved, getReadableRoots()) || isReadableDownloadsPath(resolved)
}

export function assertReadablePath(target: string, label = 'path'): string {
  if (!isReadablePath(target)) {
    throw new PathPolicyError(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}

export function isOpenableFileExtension(target: string): boolean {
  return OPENABLE_FILE_EXTENSIONS.has(path.extname(target).toLowerCase())
}

export function isOpenablePath(target: unknown): target is string {
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false

  return isAllowedPath(resolved, [getLauncherDataRoot()])
}

export function assertOpenablePath(target: string, label = 'path'): string {
  if (!isOpenablePath(target)) {
    throw new PathPolicyError(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}
