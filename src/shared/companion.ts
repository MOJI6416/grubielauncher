export const COMPANION_FILE_PREFIX = 'grubie-companion-'
export const COMPANION_STATS_DIR = 'server-stats'
export const COMPANION_ENV_ADDRESS = 'GRUBIE_COMPANION_ADDRESS'
export const COMPANION_ENV_TOKEN = 'GRUBIE_COMPANION_TOKEN'
export const COMPANION_ENV_STATS_DIR = 'GRUBIE_COMPANION_STATS_DIR'

const SHARE_JOIN_SUFFIX = '.join.grubielauncher.com'

export interface CompanionManifestFile {
  file: string
  loader: string
  minecraft: string[]
  sha1: string
  size: number
}

export interface CompanionManifest {
  version: string
  files: CompanionManifestFile[]
}

export interface CompanionSupport {
  supported: boolean
  version: string | null
}

export interface CompanionSession {
  versionName: string
  instance: number
  mod: string
}

export type CompanionToastKind = 'message' | 'invite' | 'call'

export interface CompanionToast {
  id: string
  kind: CompanionToastKind
  title: string
  body: string
  count: number
  actionable: boolean
}

export function isCompanionModFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.startsWith(COMPANION_FILE_PREFIX) &&
    (lower.endsWith('.jar') || lower.endsWith('.jar.disabled'))
  )
}

export function pickCompanionFile(
  manifest: CompanionManifest | null,
  minecraft: string,
  loader: string
): CompanionManifestFile | null {
  if (!manifest) return null
  return (
    manifest.files.find(
      (file) => file.loader === loader && file.minecraft.includes(minecraft)
    ) ?? null
  )
}

export function normalizeServerAddress(address: string): string {
  let value = address.trim().toLowerCase()
  if (value.endsWith(':25565')) value = value.slice(0, -6)
  while (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

function hostOf(address: string): string {
  if (address.startsWith('[')) {
    const end = address.indexOf(']')
    return end > 0 ? address.slice(1, end) : address
  }
  const colons = address.split(':').length - 1
  if (colons > 1) return address
  return address.split(':')[0]
}

export function isTrackedServerAddress(address: string): boolean {
  const host = hostOf(normalizeServerAddress(address))
  if (!host) return false
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return false
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return false
  if (host === 'join.grubielauncher.com' || host.endsWith(SHARE_JOIN_SUFFIX)) return false
  return true
}
