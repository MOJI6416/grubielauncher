import * as fs from 'fs-extra'
import crypto from 'crypto'
import zip from 'adm-zip'
import path from 'path'

export async function getSha1(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha1')
    const input = fs.createReadStream(filePath)

    input.on('error', (error) => {
      reject(error)
    })

    hash.setEncoding('hex')

    input.on('end', () => {
      hash.end()
      resolve(hash.read())
    })

    input.pipe(hash)
  })
}

export async function getWorldName(zipPath: string) {
  const archive = new zip(zipPath)
  const entries = archive.getEntries()

  const rootFolders = new Set<string>()

  for (const entry of entries) {
    const parts = entry.entryName.split('/')
    if (parts.length > 1) {
      rootFolders.add(parts[0])
    }
  }

  return rootFolders.size === 1 ? [...rootFolders][0] : null
}

export async function extractAll(zipPath: string, destination: string): Promise<void> {
  const zipFile = new zip(zipPath)

  try {
    zipFile.extractAllTo(destination, true)
  } catch (error) {
    throw error
  }
}

export async function readJSONFromArchive<T>(zipPath: string, fileName: string) {
  const archive = new zip(zipPath)
  const text = archive.readAsText(fileName)
  return JSON.parse(text) as T
}

export async function archiveFiles(files: string[], outputZipPath: string) {
  try {
    const archive = new zip()

    for (const file of files) {
      try {
        await fs.access(file)
        if ((await fs.stat(file)).isDirectory()) archive.addLocalFolder(file, path.basename(file))
        else archive.addLocalFile(file)
      } catch {
        continue
      }
    }

    archive.writeZip(outputZipPath)
  } catch (err) {
    throw err
  }
}
