export const notSupportedPaths = [
  'crash-reports',
  'logs',
  'mods',
  'resourcepacks',
  'screenshots',
  'shaderpacks',
  'natives',
  'server',
  'temp',
  'modpacks',
  '${loader}.jar',
  '${loader}.json',
  '${version}.jar',
  '${version}.json',
  'icon.png',
  'logo.png',
  'options.txt',
  'version.json',
  'statistics.json',
  'storage'
]

export function formatBytes(bytes: number, sizes: string[], decimals = 2): string {
  if (bytes === 0) return '0 B'

  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

  return `${formatted} ${sizes[i]}`
}
