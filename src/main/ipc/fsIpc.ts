import fs from 'fs-extra'
import path from 'path'
import { rimraf } from 'rimraf'
import { getDirectories, getSha1, getTotalSizes } from '../utilities/files'
import { createZipArchive, extractZip } from '../utilities/archiver'
import { handleSafe } from '../utilities/ipc'

type DirEntry = { path: string; type: 'folder' | 'file' }


export function registerFsIpc() {
  handleSafe<DirEntry[]>('fs:readdirWithTypes', [], async (_, folderPath: string) => {
    const entries = await fs.readdir(folderPath, { withFileTypes: true })

    const result: DirEntry[] = await Promise.all(
      entries.map(async (dirent) => {
        const fullPath = path.join(folderPath, dirent.name)

        if (dirent.isDirectory()) {
          return { path: dirent.name, type: 'folder' }
        }

        if (dirent.isFile()) {
          return { path: dirent.name, type: 'file' }
        }

        const stats = await fs.stat(fullPath)
        return {
          path: dirent.name,
          type: stats.isDirectory() ? 'folder' : 'file'
        }
      })
    )

    result.sort((a, b) => {
      if (a.type === 'folder' && b.type === 'file') return -1
      if (a.type === 'file' && b.type === 'folder') return 1
      return a.path.localeCompare(b.path)
    })

    return result
  })

  handleSafe<string[]>('fs:getDirectories', [], async (_, source: string) => {
    return await getDirectories(source)
  })

  handleSafe<string>('path:join', '', async (_, ...args: string[]) => {
    return path.join(...args)
  })

  handleSafe<string>('path:basename', '', async (_, filePath: string, suffix?: string) => {
    return path.basename(filePath, suffix)
  })

  handleSafe<string>('path:extname', '', async (_, filePath: string) => {
    return path.extname(filePath)
  })

  handleSafe<string>('fs:readFile', '', async (_, filePath: string, encoding: BufferEncoding = 'utf-8') => {
    return await fs.readFile(filePath, encoding)
  })

  handleSafe<boolean>('fs:rimraf', false, async (_, targetPath: string | string[]) => {
    await rimraf(targetPath)
    return true
  })

  handleSafe<boolean>('file:archiveFiles', false, async (_, filesToArchive: string[], zipPath: string) => {
    await createZipArchive(filesToArchive, zipPath)
    return true
  })

  handleSafe<number>('file:getTotalSizes', 0, async (_, filePaths: string[]) => {
    return await getTotalSizes(filePaths)
  })

  handleSafe<boolean>('fs:ensure', false, async (_, dirPath: string) => {
    await fs.ensureDir(dirPath)
    return true
  })

  handleSafe<boolean>('fs:copy', false, async (_, srcPath: string, destPath: string) => {
    await fs.copy(srcPath, destPath, { overwrite: true })
    return true
  })

  handleSafe<boolean>('fs:writeFile', false, async (_, filePath: string, data: any, encoding: BufferEncoding = 'utf-8') => {
    await fs.writeFile(filePath, data, { encoding })
    return true
  })

  handleSafe<string>('file:fromBuffer', '', async (_, data: any) => {
    const buffer = Buffer.from(data)
    return buffer.toString('binary')
  })

  handleSafe<boolean>('fs:pathExists', false, async (_, targetPath: string) => {
    return await fs.pathExists(targetPath)
  })

  handleSafe<string>('fs:sha1', '', async (_, filePath: string) => {
    return await getSha1(filePath)
  })

  handleSafe<boolean>('fs:move', false, async (_, srcPath: string, destPath: string) => {
    await fs.move(srcPath, destPath, { overwrite: true })
    return true
  })

  handleSafe<string[]>('fs:readdir', [], async (_, dirPath: string) => {
    return await fs.readdir(dirPath)
  })

  handleSafe<boolean>('fs:extractZip', false, async (_, zipPath: string, destination: string) => {
    await extractZip(zipPath, destination)
    return true
  })

  handleSafe<boolean>('fs:rename', false, async (_, oldPath: string, newPath: string) => {
    await fs.rename(oldPath, newPath)
    return true
  })

  handleSafe<boolean>('fs:writeJSON', false, async (_, filePath: string, data: any) => {
    await fs.writeJSON(filePath, data, { encoding: 'utf-8', spaces: 2 })
    return true
  })

  handleSafe<any>('fs:readJSON', null, async (_, filePath: string, encoding?: BufferEncoding) => {
    return await fs.readJSON(filePath, { encoding })
  })

  handleSafe<boolean>('fs:isDirectory', false, async (_, targetPath: string) => {
    const stats = await fs.stat(targetPath)
    return stats.isDirectory()
  })
}
