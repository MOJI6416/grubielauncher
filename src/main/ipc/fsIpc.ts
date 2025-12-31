import { ipcMain } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { rimraf } from 'rimraf'
import { getDirectories, getSha1, getTotalSizes } from '../utilities/files'
import { createZipArchive, extractZip } from '../utilities/archiver'

export function registerFsIpc() {
  ipcMain.handle('fs:readdirWithTypes', async (_, folderPath: string) => {
    try {
      const entries = await fs.readdir(folderPath)
      const result = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(folderPath, entry)
          const stats = await fs.stat(fullPath)
          return {
            path: entry,
            type: stats.isDirectory() ? 'folder' : ('file' as 'folder' | 'file')
          }
        })
      )

      result.sort((a, b) => {
        if (a.type === 'folder' && b.type === 'file') return -1
        if (a.type === 'file' && b.type === 'folder') return 1
        return a.path.localeCompare(b.path)
      })

      return result
    } catch (error) {
      console.error('Error reading directory:', error)
      throw new Error('Failed to read directory')
    }
  })

  ipcMain.handle('fs:getDirectories', async (_, source: string) => {
    return await getDirectories(source)
  })

  ipcMain.handle('path:join', (_, ...args) => {
    return path.join(...args)
  })

  ipcMain.handle('path:basename', (_, filePath: string, suffix?: string) => {
    return path.basename(filePath, suffix)
  })

  ipcMain.handle('path:extname', (_, filePath: string) => {
    return path.extname(filePath)
  })

  ipcMain.handle('fs:readFile', async (_, filePath, encoding = 'utf-8') => {
    try {
      const data = await fs.readFile(filePath, encoding)
      return data
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error)
      throw new Error(`Failed to read file: ${error}`)
    }
  })

  ipcMain.handle('fs:rimraf', async (_, targetPath) => {
    try {
      await rimraf(targetPath)
      return true
    } catch (error) {
      console.error(`Error deleting ${targetPath}:`, error)
      throw new Error(`Failed to delete path: ${error}`)
    }
  })

  ipcMain.handle('file:archiveFiles', async (_, filesToArchive, zipPath) => {
    try {
      await createZipArchive(filesToArchive, zipPath)
      return true
    } catch (error) {
      console.error('Error archiving files:', error)
      throw new Error(`Failed to archive files: ${error}`)
    }
  })

  ipcMain.handle('file:getTotalSizes', async (_, filePaths) => {
    try {
      const totalSize = await getTotalSizes(filePaths)
      return totalSize
    } catch (error) {
      console.error('Error calculating total sizes:', error)
      throw new Error(`Failed to calculate total sizes: ${error}`)
    }
  })

  ipcMain.handle('fs:ensure', async (_, dirPath) => {
    try {
      await fs.ensureDir(dirPath)
      return true
    } catch (error) {
      console.error(`Error ensuring directory ${dirPath}:`, error)
      throw new Error(`Failed to ensure directory: ${error}`)
    }
  })

  ipcMain.handle('fs:copy', async (_, srcPath, destPath) => {
    try {
      await fs.copy(srcPath, destPath, { overwrite: true })
      return true
    } catch (error) {
      console.error(`Error copying file from ${srcPath} to ${destPath}:`, error)
      throw new Error(`Failed to copy file: ${error}`)
    }
  })

  ipcMain.handle('fs:writeFile', async (_, filePath, data, encoding = 'utf-8') => {
    try {
      await fs.writeFile(filePath, data, { encoding })
      return true
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error)
      throw new Error(`Failed to write file: ${error}`)
    }
  })

  ipcMain.handle('file:fromBuffer', (_, data) => {
    const buffer = Buffer.from(data)
    return buffer.toString('binary')
  })

  ipcMain.handle('fs:pathExists', async (_, targetPath: string) => {
    return await fs.pathExists(targetPath)
  })

  ipcMain.handle('fs:sha1', async (_, filePath: string) => {
    return await getSha1(filePath)
  })

  ipcMain.handle('fs:move', async (_, srcPath: string, destPath: string) => {
    try {
      await fs.move(srcPath, destPath, { overwrite: true })
      return true
    } catch (error) {
      console.error(`Error moving file from ${srcPath} to ${destPath}:`, error)
      throw new Error(`Failed to move file: ${error}`)
    }
  })

  ipcMain.handle('fs:readdir', async (_, dirPath: string) => {
    try {
      const files = await fs.readdir(dirPath)
      return files
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error)
      throw new Error(`Failed to read directory: ${error}`)
    }
  })

  ipcMain.handle('fs:extractZip', async (_, zipPath: string, destination: string) => {
    return await extractZip(zipPath, destination)
  })

  ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath)
      return true
    } catch (error) {
      console.error(`Error renaming from ${oldPath} to ${newPath}:`, error)
      throw new Error(`Failed to rename: ${error}`)
    }
  })

  ipcMain.handle('fs:writeJSON', async (_, filePath: string, data: any) => {
    try {
      await fs.writeJSON(filePath, data, {
        encoding: 'utf-8',
        spaces: 2
      })
      return true
    } catch (error) {
      console.error(`Error writing JSON file ${filePath}:`, error)
      throw new Error(`Failed to write JSON file: ${error}`)
    }
  })

  ipcMain.handle('fs:readJSON', async (_, filePath: string, encoding?: BufferEncoding) => {
    try {
      const data = await fs.readJSON(filePath, { encoding })
      return data
    } catch (error) {
      console.error(`Error reading JSON file ${filePath}:`, error)
      throw new Error(`Failed to read JSON file: ${error}`)
    }
  })

  ipcMain.handle('fs:isDirectory', async (_, targetPath: string) => {
    try {
      const stats = await fs.stat(targetPath)
      return stats.isDirectory()
    } catch (error) {
      console.error(`Error checking if directory ${targetPath}:`, error)
      throw new Error(`Failed to check if directory: ${error}`)
    }
  })
}
