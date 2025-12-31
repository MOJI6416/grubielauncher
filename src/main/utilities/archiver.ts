import zip from 'adm-zip'
import archiver from 'archiver'
import fs from 'fs-extra'
import path from 'path'

export async function readJSONFromArchive<T>(zipPath: string, fileName: string) {
  const archive = new zip(zipPath)
  const text = archive.readAsText(fileName)
  return JSON.parse(text) as T
}

export async function createZipArchive(files: string[], outputPath: string): Promise<void> {
  await fs.ensureDir(path.dirname(outputPath))
  const output = fs.createWriteStream(outputPath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  return new Promise(async (resolve, reject) => {
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)

    for (const file of files) {
      if (await fs.pathExists(file)) {
        archive.file(file, { name: path.basename(file) })
      }
    }

    archive.finalize()
  })
}

export async function extractZip(zipPath: string, destination: string): Promise<void> {
  const zipFile = new zip(zipPath)

  try {
    zipFile.extractAllTo(destination, true)
  } catch (error) {
    throw error
  }
}
