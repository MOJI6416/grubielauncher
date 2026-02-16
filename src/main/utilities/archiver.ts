import zip from 'adm-zip'
import archiver from 'archiver'
import fs from 'fs-extra'
import path from 'path'

function getSafeExtractPath(destinationRoot: string, entryName: string): string {
  const name = (entryName || '').replace(/\\/g, '/')

  if (!name || name === '.' || name === '/') {
    throw new Error(`Invalid zip entry name: "${entryName}"`)
  }

  if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) {
    throw new Error(`Unsafe zip entry path (absolute): "${entryName}"`)
  }

  const normalized = path.posix.normalize(name)

  if (normalized.startsWith('..') || normalized.includes('/..')) {
    throw new Error(`Unsafe zip entry path (traversal): "${entryName}"`)
  }

  const root = path.resolve(destinationRoot)
  const target = path.resolve(root, normalized)

  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error(`Unsafe zip entry path (escape): "${entryName}"`)
  }

  return target
}

export async function readJSONFromArchive<T>(zipPath: string, fileName: string) {
  const archive = new zip(zipPath)
  const entry = archive.getEntry(fileName)
  if (!entry) return null

  const text = entry.getData().toString('utf-8')
  return JSON.parse(text) as T
}

export async function extractFileFromArchive(
  zipPath: string,
  fileName: string,
  destinationPath: string
) {
  const archive = new zip(zipPath)
  const entry = archive.getEntry(fileName)
  if (!entry) return null

  await fs.ensureDir(destinationPath)

  const outFilePath = path.join(destinationPath, path.basename(entry.entryName || fileName))
  await fs.writeFile(outFilePath, entry.getData())

  return path.join(destinationPath)
}

export async function createZipArchive(files: string[], outputPath: string): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath))
  const output = fs.createWriteStream(outputPath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  return new Promise((resolve, reject) => {
    let settled = false

    const safeResolve = () => {
      if (settled) return
      settled = true
      resolve()
    }

    const safeReject = (err: unknown) => {
      if (settled) return
      settled = true
      reject(err)
    }

    output.on('close', safeResolve)
    output.on('error', safeReject)

    archive.on('error', safeReject)
    archive.on('warning', (err: any) => {
      if (err?.code === 'ENOENT') return
      safeReject(err)
    })

    archive.pipe(output)

    ;(async () => {
      for (const file of files) {
        if (await fs.pathExists(file)) {
          archive.file(file, { name: path.basename(file) })
        }
      }

      await archive.finalize()
    })().catch(safeReject)
  })
}

export async function extractZip(zipPath: string, destination: string): Promise<void> {
  const zipFile = new zip(zipPath)

  await fs.ensureDir(destination)

  const entries = zipFile.getEntries()

  for (const entry of entries) {
    const entryName = entry.entryName

    const targetPath = getSafeExtractPath(destination, entryName)

    if (entry.isDirectory) {
      await fs.ensureDir(targetPath)
      continue
    }

    await fs.ensureDir(path.dirname(targetPath))
    await fs.writeFile(targetPath, entry.getData())
  }
}
