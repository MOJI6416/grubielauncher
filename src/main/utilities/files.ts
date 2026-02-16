import fs from 'fs-extra'
import path from 'path'
import crypto from 'crypto'

export async function getDirectories(source: string) {
  const entries = await fs.readdir(source)

  const stats = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(source, entry)
      try {
        const st = await fs.lstat(fullPath)
        return { entry, isDir: st.isDirectory() }
      } catch {
        return { entry, isDir: false }
      }
    })
  )

  return stats.filter((x) => x.isDir).map((x) => x.entry)
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

    let st: fs.Stats
    try {
      st = await fs.lstat(filePath)
    } catch {
      continue
    }

    if (st.isDirectory()) {
      if (targetDirs.length > 0 && !targetDirs.includes(file)) continue
      results = results.concat(await getFilesRecursively(filePath, rootDirectory, targetDirs))
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

    let st: fs.Stats
    try {
      st = await fs.lstat(filePath)
    } catch {
      continue
    }

    if (st.isDirectory()) {
      totalSize += await getDirectorySize(filePath)
    } else {
      totalSize += st.size
    }
  }

  return totalSize
}

export async function getTotalSizes(paths: string[]): Promise<number> {
  let totalSize = 0

  for (const p of paths) {
    try {
      const st = await fs.lstat(p)

      if (st.isDirectory()) {
        totalSize += await getDirectorySize(p)
      } else {
        totalSize += st.size
      }
    } catch {
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
