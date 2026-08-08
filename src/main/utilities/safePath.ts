import path from 'path'
import { app } from 'electron'
import fs from 'fs-extra'
import { AllowedPathAccess, AllowedPathKind, BlessedPathInfo } from '@/types/AllowedPath'

export class PathPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathPolicyError'
  }
}

type BlessedKind = AllowedPathKind
type BlessedAccess = AllowedPathAccess

interface BlessedEntry {
  path: string
  kind: BlessedKind
  access: BlessedAccess
  addedAt: number
  persist: boolean
}

const BLESSED_TTL_MS = 30 * 24 * 60 * 60 * 1000
const BLESSED_RENEW_AFTER_MS = 24 * 60 * 60 * 1000
const MAX_BLESSED_ENTRIES = 64
const DOWNLOADS_READABLE_EXTENSIONS = new Set(['.jar', '.zip', '.mrpack', '.litemod'])
const JAVA_ARCHIVE_NAME = /\.(?:zip|tar|tgz|gz|xz|bz2)(?:\.part)?$/i
const OPENABLE_FILE_EXTENSIONS = new Set(['.txt', '.log', '.json'])

const blessedEntries = new Map<string, BlessedEntry>()
let persistedRootsLoaded = false

function getPersistedRootsPath(): string {
  return path.join(app.getPath('userData'), 'allowed-paths.json')
}

function normalizeStoredEntry(value: unknown, now: number): BlessedEntry | null {
  if (typeof value === 'string') {
    if (!value || value.includes('\0')) return null
    return {
      path: path.resolve(value),
      kind: 'folder',
      access: 'readwrite',
      addedAt: now,
      persist: true
    }
  }

  if (!value || typeof value !== 'object') return null

  const stored = value as Partial<BlessedEntry>
  if (typeof stored.path !== 'string' || !stored.path || stored.path.includes('\0')) {
    return null
  }

  return {
    path: path.resolve(stored.path),
    kind: stored.kind === 'file' ? 'file' : 'folder',
    access: stored.access === 'read' ? 'read' : 'readwrite',
    addedAt:
      typeof stored.addedAt === 'number' && Number.isFinite(stored.addedAt)
        ? stored.addedAt
        : now,
    persist: true
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
    const persistable = [...blessedEntries.values()].filter((entry) => entry.persist)
    fs.ensureDirSync(path.dirname(target))
    fs.writeJsonSync(target, persistable, { spaces: 2, mode: 0o600 })
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

function getSystemRoots(): string[] {
  if (process.platform === 'win32') {
    return [
      process.env.SystemRoot,
      process.env.windir,
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramData
    ]
      .filter((root): root is string => typeof root === 'string' && root !== '')
      .map((root) => path.resolve(root))
  }

  return [
    '/etc',
    '/usr',
    '/bin',
    '/sbin',
    '/boot',
    '/dev',
    '/proc',
    '/sys',
    '/var',
    '/lib',
    '/opt',
    '/System',
    '/Library'
  ].map((root) => path.resolve(root))
}

function isBlessableTarget(resolved: string): boolean {
  if (!path.parse(resolved).base) return false
  if (getSystemRoots().some((root) => isInside(resolved, root))) return false

  try {
    if (isInside(path.resolve(app.getPath('home')), resolved)) return false
    return !isInside(path.resolve(app.getPath('userData')), resolved)
  } catch {
    return true
  }
}

export function blessUserSelectedPath(
  target: string,
  kind: BlessedKind,
  access: BlessedAccess = 'readwrite'
): void {
  if (!target || typeof target !== 'string' || target.includes('\0')) return

  try {
    const resolved = path.resolve(target)
    if (!isBlessableTarget(resolved)) return

    loadPersistedRoots()
    blessedEntries.set(resolved, {
      path: resolved,
      kind,
      access,
      addedAt: Date.now(),
      persist: access === 'readwrite'
    })
    pruneBlessedEntries()
    persistBlessedRoots()
  } catch {}
}

export function listBlessedPaths(): BlessedPathInfo[] {
  loadPersistedRoots()
  pruneBlessedEntries()

  return [...blessedEntries.values()]
    .map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      access: entry.access,
      addedAt: entry.addedAt,
      expiresAt: entry.addedAt + BLESSED_TTL_MS
    }))
    .sort((a, b) => b.addedAt - a.addedAt)
}

export function revokeBlessedPath(target: unknown): boolean {
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false

  loadPersistedRoots()
  if (!blessedEntries.delete(resolved)) return false

  persistBlessedRoots()
  return true
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

const canonicalRootCache = new Map<string, string>()

function canonicalizeRoot(root: string): string | null {
  const cached = canonicalRootCache.get(root)
  if (cached) return cached

  const canonical = canonicalize(root)
  if (canonical && fs.existsSync(root)) canonicalRootCache.set(root, canonical)

  return canonical
}

function matchesBlessedEntry(canonicalTarget: string, entry: BlessedEntry): boolean {
  const canonicalEntry = canonicalizeRoot(entry.path)
  if (!canonicalEntry) return false

  return entry.kind === 'file'
    ? canonicalTarget === canonicalEntry
    : isInside(canonicalTarget, canonicalEntry)
}

function renewBlessedEntry(entry: BlessedEntry): void {
  const now = Date.now()
  if (now - entry.addedAt < BLESSED_RENEW_AFTER_MS) return

  entry.addedAt = now
  if (entry.persist) persistBlessedRoots()
}

function isAllowedPath(
  target: string,
  roots: string[],
  access: BlessedAccess = 'read'
): boolean {
  loadPersistedRoots()
  pruneBlessedEntries()

  const canonicalTarget = canonicalize(target)
  if (!canonicalTarget) return false

  const insideRoot = roots.some((root) => {
    const canonicalRoot = canonicalizeRoot(root)
    return canonicalRoot ? isInside(canonicalTarget, canonicalRoot) : false
  })
  if (insideRoot) return true

  for (const entry of blessedEntries.values()) {
    if (access !== 'read' && entry.access !== 'readwrite') continue
    if (!matchesBlessedEntry(canonicalTarget, entry)) continue

    renewBlessedEntry(entry)
    return true
  }

  return false
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

function isSamePath(left: string, right: string): boolean {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function isProtectedWritePath(resolved: string): boolean {
  const canonicalTarget = canonicalize(resolved)
  if (!canonicalTarget) return true

  const persistedRoots = canonicalizeRoot(getPersistedRootsPath())
  if (persistedRoots && isSamePath(canonicalTarget, persistedRoots)) return true

  const javaRoot = canonicalizeRoot(path.join(getLauncherDataRoot(), 'java'))
  if (!javaRoot) return false
  if (!isInside(canonicalTarget, javaRoot)) return false

  if (!isSamePath(path.dirname(canonicalTarget), javaRoot)) return true

  return !JAVA_ARCHIVE_NAME.test(path.basename(canonicalTarget))
}

export function isWritablePath(target: unknown): target is string {
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false
  if (isProtectedWritePath(resolved)) return false

  return isAllowedPath(resolved, getLauncherRoots(), 'readwrite')
}

export function assertWritablePath(target: string, label = 'path'): string {
  if (!isWritablePath(target)) {
    throw new PathPolicyError(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}

export function isExtractablePath(target: unknown): target is string {
  if (isWritablePath(target)) return true
  if (!isUsablePathString(target)) return false

  const resolved = resolveOrNull(target)
  if (!resolved) return false

  const canonicalTarget = canonicalize(resolved)
  if (!canonicalTarget) return false

  const javaRoot = canonicalizeRoot(path.join(getLauncherDataRoot(), 'java'))

  return Boolean(javaRoot && isSamePath(canonicalTarget, javaRoot))
}

export function assertExtractablePath(target: string, label = 'path'): string {
  if (!isExtractablePath(target)) {
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
