import { EXCLUDED_INSTANCE_PATHS } from '@/shared/instancePrivacy'

export const notSupportedPaths = [
  ...EXCLUDED_INSTANCE_PATHS,
  'mods',
  'resourcepacks',
  'screenshots',
  'shaderpacks',
  'server',
  'modpacks',
  '${loader}.jar',
  '${loader}.json',
  '${version}.jar',
  '${version}.json',
  'icon.png',
  'logo.png',
  'logo.jpg',
  'logo.jpeg',
  'logo.webp',
  'servers.dat',
  'options.txt',
  'version.json',
  'storage',
  'saves'
]

export function formatBytes(bytes: number, sizes: string[], decimals = 2): string {
  if (bytes === 0) return `0 ${sizes[0]}`

  const k = 1024
  const raw = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
  const i = Math.max(0, Math.min(sizes.length - 1, Number.isFinite(raw) ? raw : 0))
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

  return `${formatted} ${sizes[i]}`
}

export function revokePreviousBlobUrl(
  previous: string | null | undefined,
  next: string | null,
): string | null {
  if (previous && previous !== next && previous.startsWith("blob:")) {
    try {
      URL.revokeObjectURL(previous)
    } catch {}
  }

  return next
}
