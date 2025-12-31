import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'

export async function getDirectories(source: string) {
  const entries = await fs.readdir(source)

  const directories = entries.filter(async (entry) => {
    const fullPath = path.join(source, entry)
    return (await fs.stat(fullPath)).isDirectory()
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

    if ((await fs.stat(filePath)).isDirectory()) {
      if (targetDirs.length > 0 && !targetDirs.includes(file)) continue
      results = results.concat(await getFilesRecursively(filePath, rootDirectory))
    } else {
      const relativePath = path.relative(rootDirectory, filePath)
      results.push(relativePath)
    }
  }

  return results
}

async function getDirectorySize(directoryPath: string): Promise<number> {
  let totalSize = 0

  const files = await fs.readdir(directoryPath)

  for (const file of files) {
    const filePath = path.join(directoryPath, file)
    const fileStats = await fs.stat(filePath)
    if ((await fs.stat(filePath)).isDirectory()) {
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
      if ((await fs.stat(p)).isDirectory()) {
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

export async function getSha1(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const stream = fs.createReadStream(filePath)

    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', (err) => {
      stream.destroy()
      reject(err)
    })
  })
}
