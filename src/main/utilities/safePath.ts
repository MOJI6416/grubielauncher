import path from 'path'
import { app } from 'electron'

const blessedRoots = new Set<string>()

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
  } catch {
    // ignore malformed paths
  }
}

function isInside(child: string, root: string): boolean {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
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

  const roots = [...getLauncherRoots(), ...blessedRoots]
  return roots.some((root) => isInside(resolved, root))
}

export function assertWritablePath(target: string, label = 'path'): string {
  if (!isWritablePath(target)) {
    throw new Error(`Refused ${label} outside allowed roots: ${String(target)}`)
  }
  return target
}

export function assertReadablePath(target: string, label = 'path'): string {
  if (typeof target !== 'string' || target === '' || target.includes('\0')) {
    throw new Error(`Invalid ${label}: ${String(target)}`)
  }
  return target
}
