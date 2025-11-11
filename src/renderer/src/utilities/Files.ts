const api = window.api
const fs = api.fs
const path = api.path
const isDirectory = api.isDirectory

export async function getDirectories(source: string) {
  const entries = await fs.readdir(source)

  const directories = entries.filter(async (entry) => {
    const fullPath = path.join(source, entry)
    return isDirectory(fullPath)
  })

  return directories
}

export async function getFilesRecursively(
  directory: string,
  rootDirectory: string | null = null,
  targetDirs: string[] = []
) {
  if (!rootDirectory) rootDirectory = directory
  let results: string[] = []

  const list = await fs.readdir(directory)
  for (const file of list) {
    const filePath = path.join(directory, file)

    if (isDirectory(filePath)) {
      if (targetDirs.length > 0 && !targetDirs.includes(file)) continue
      results = results.concat(await getFilesRecursively(filePath, rootDirectory))
    } else {
      const relativePath = path.relative(rootDirectory, filePath)
      results.push(relativePath)
    }
  }

  return results
}

export async function getFile(filePath: string): Promise<File> {
  const absolutePath = path.resolve(filePath)

  const fileBuffer = await fs.readFile(absolutePath)
  const blob = new Blob([fileBuffer])
  const file = new File([blob], path.basename(filePath), {
    type: 'application/octet-stream'
  })

  return file
}

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

async function getDirectorySize(directoryPath: string): Promise<number> {
  let totalSize = 0

  const files = await fs.readdir(directoryPath)

  for (const file of files) {
    const filePath = path.join(directoryPath, file)
    const fileStats = await fs.stat(filePath)
    if (isDirectory(filePath)) {
      totalSize += await getDirectorySize(filePath)
    } else {
      totalSize += fileStats.size
    }
  }

  return totalSize
}

export async function getTotalSizes(paths: string[]): Promise<number> {
  let totalSize = 0

  for (const p of paths) {
    try {
      if (isDirectory(p)) {
        const size = await getDirectorySize(p)
        totalSize += size
      } else {
        const stats = await fs.stat(p)
        totalSize += stats.size
      }
    } catch (err) {
      continue
    }
  }

  return totalSize
}

export function base64ToUrl(base64String: string): string {
  const base64 = base64String.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')

  const binaryData = atob(base64)
  const len = binaryData.length
  const bytes = new Uint8Array(len)

  for (let i = 0; i < len; i++) {
    bytes[i] = binaryData.charCodeAt(i)
  }

  const blob = new Blob([bytes], { type: 'image/png' })

  return URL.createObjectURL(blob)
}

export function formatBytes(bytes: number, sizes: string[], decimals = 2): string {
  if (bytes === 0) return '0 Б'

  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const formatted = parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))

  return `${formatted} ${sizes[i]}`
}
