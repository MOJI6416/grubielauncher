import axios from 'axios'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import path from 'path'
import crypto from 'crypto'
import pLimit from 'p-limit'
import { DownloadItem } from '@/types/Downloader'
import * as tar from 'tar'
import { mainWindow } from '../windows/mainWindow'

export interface DownloaderInfo {
  totalItems: number
  completedItems: number
  failedItems: number
  progressPercent: number
  currentFileName?: string
  downloadSpeed?: number
  estimatedTimeRemaining?: number
  totalBytes: number
  downloadedBytes: number
}

export class Downloader {
  private limit = pLimit(6)
  private totalBytes = 0
  private downloadedBytes = 0
  private startTime = 0
  private speedSamples: number[] = []
  private lastSpeedUpdate = 0
  private lastSpeedBytes = 0
  private fileCompletionTimes: number[] = []
  private abortController: AbortController | null = null

  constructor(limit = 6) {
    this.limit = pLimit(limit)
  }

  cancelDownload = () => {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  downloadFiles = async (items: DownloadItem[]): Promise<void> => {
    if (items.length === 0) {
      this.sendInfo(null)
      return
    }

    this.abortController = new AbortController()
    this.startTime = Date.now()
    this.lastSpeedUpdate = this.startTime
    this.lastSpeedBytes = 0
    this.downloadedBytes = 0
    this.speedSamples = []
    this.fileCompletionTimes = []
    this.totalBytes = items.reduce((sum, item) => sum + (item.size || 0), 0)

    const totalItems = items.length
    let completedItems = 0
    let failedItems = 0

    const groups = this.sortByGroup(items)

    for (const group of groups) {
      const groupName = group[0].group

      const promises = group.map((item) => {
        const { destination, sha1, size = 0 } = item

        return this.limit(async () => {
          const fileStartTime = Date.now()

          try {
            if (!this.validateItem(item)) {
              console.error(`Invalid item:`, item)
              failedItems++
              this.sendInfo(this.createInfo(totalItems, completedItems, failedItems))
              return
            }

            const fileMatches = await this.fileExistsAndMatches(destination, sha1 || '', size)
            if (fileMatches) {
              completedItems++
              this.downloadedBytes += size

              const fileName = `[${groupName}] ${path.basename(destination)}`
              this.sendInfo(this.createInfo(totalItems, completedItems, failedItems, fileName))
              this.updateTaskbarProgress(completedItems, totalItems)
              return
            }

            this.ensureDirectoryExists(destination)

            const fileName = `[${groupName}] ${path.basename(destination)}`
            this.sendInfo(this.createInfo(totalItems, completedItems, failedItems, fileName))

            await this.downloadFile(item, 3, () => {
              this.sendInfo(this.createInfo(totalItems, completedItems, failedItems, fileName))
            })

            if (item.options?.extract) {
              await this.extractFile(
                destination,
                item.options.extractFolder || path.dirname(destination),
                item.options.extractDelete ?? true
              )
            }

            completedItems++

            const fileTime = Date.now() - fileStartTime
            this.fileCompletionTimes.push(fileTime)
            if (this.fileCompletionTimes.length > 10) {
              this.fileCompletionTimes.shift()
            }

            this.sendInfo(this.createInfo(totalItems, completedItems, failedItems))
            this.updateTaskbarProgress(completedItems, totalItems)
          } catch (err) {
            if (axios.isCancel(err) || (err as Error).name === 'AbortError') {
              console.log('Download cancelled by user')
              return
            }
            console.error(`Download error ${item.url}:`, err)
            failedItems++
            this.sendInfo(this.createInfo(totalItems, completedItems, failedItems))
          }
        })
      })

      await Promise.all(promises)
    }

    this.sendInfo(null)
    this.clearTaskbarProgress()
    this.abortController = null
  }

  private createInfo = (
    totalItems: number,
    completedItems: number,
    failedItems: number,
    currentFileName?: string
  ): DownloaderInfo => {
    const progressPercent =
      this.totalBytes > 0
        ? Math.floor((this.downloadedBytes / this.totalBytes) * 100)
        : Math.floor((completedItems / totalItems) * 100)

    const now = Date.now()
    const timeSinceLastUpdate = (now - this.lastSpeedUpdate) / 1000

    let downloadSpeed = 0
    let estimatedTimeRemaining = 0

    if (timeSinceLastUpdate >= 1) {
      const bytesSinceLastUpdate = this.downloadedBytes - this.lastSpeedBytes
      const currentSpeed = bytesSinceLastUpdate / timeSinceLastUpdate

      this.speedSamples.push(currentSpeed)
      if (this.speedSamples.length > 5) {
        this.speedSamples.shift()
      }

      downloadSpeed = this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length

      this.lastSpeedUpdate = now
      this.lastSpeedBytes = this.downloadedBytes
    } else if (this.speedSamples.length > 0) {
      downloadSpeed = this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length
    }

    if (downloadSpeed > 0 && this.totalBytes > 0) {
      const remainingBytes = this.totalBytes - this.downloadedBytes
      estimatedTimeRemaining = remainingBytes / downloadSpeed
    }

    return {
      totalItems,
      completedItems,
      failedItems,
      progressPercent,
      currentFileName,
      downloadSpeed: Math.round(downloadSpeed),
      estimatedTimeRemaining: Math.round(estimatedTimeRemaining),
      totalBytes: this.totalBytes,
      downloadedBytes: this.downloadedBytes
    }
  }

  private updateTaskbarProgress = (completed: number, total: number) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return

    const progress = completed / total
    try {
      mainWindow.setProgressBar(progress)
    } catch {

    }
  }

  private clearTaskbarProgress = () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return

    try {
      mainWindow.setProgressBar(-1)
    } catch {
    }
  }

  private sendInfo = (info: DownloaderInfo | null) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return

    try {
      mainWindow.webContents.send('downloaderInfo', info)
    } catch {
    }
  }

  private validateItem = (item: DownloadItem): boolean => {
    if (!item.url || typeof item.url !== 'string' || item.url.trim() === '') {
      return false
    }
    if (
      !item.destination ||
      typeof item.destination !== 'string' ||
      item.destination.trim() === ''
    ) {
      return false
    }
    if (!item.group || typeof item.group !== 'string') {
      return false
    }
    return true
  }

  private downloadFile = async (
    item: DownloadItem,
    maxRetries = 3,
    onProgress?: () => void
  ): Promise<void> => {
    const { url, destination } = item

    if (!url || url.startsWith('blocked::')) return

    if (url.startsWith('file://')) {
      const localFilePath = url.slice(7)
      this.ensureDirectoryExists(destination)
      const stats = await fs.stat(localFilePath)
      await fs.copy(localFilePath, destination, { overwrite: true })
      this.downloadedBytes += stats.size
      if (!item.size) {
        this.totalBytes += stats.size
      }
      return
    }

    let attempts = 0
    let lastError: Error | null = null

    let countedExistingBytes = 0
    let addedToTotalBytes = 0

    while (attempts < maxRetries) {
      let writer: fs.WriteStream | null = null
      let downloadedChunksBytes = 0
      let fileSizeFromServer = 0
      let startByte = 0

      try {
        if (fs.pathExistsSync(destination) && attempts > 0) {
          const stats = await fs.stat(destination)
          startByte = stats.size
          writer = fs.createWriteStream(destination, { flags: 'a' })
        } else {
          startByte = 0
          writer = fs.createWriteStream(destination)
        }

        if (startByte > countedExistingBytes) {
          this.downloadedBytes += startByte - countedExistingBytes
          countedExistingBytes = startByte
        }


        const makeRequest = async (rangeStart: number) => {
          const headers: Record<string, string> = {}
          if (rangeStart > 0) {
            headers['Range'] = `bytes=${rangeStart}-`
          }

          return axios.get(url, {
            responseType: 'stream',
            timeout: 30000,
            headers,
            signal: this.abortController?.signal
          })
        }

        let response = await makeRequest(startByte)

        if (startByte > 0 && response.status !== 206) {
          try {
            response.data.destroy()
          } catch {}

          try {
            writer.destroy()
          } catch {}

          await fs.truncate(destination, 0)
          this.downloadedBytes -= countedExistingBytes
          countedExistingBytes = 0

          startByte = 0
          writer = fs.createWriteStream(destination)

          response = await makeRequest(0)
        }

        fileSizeFromServer = parseInt(response.headers['content-length'] || '0', 10)

        if (!item.size && fileSizeFromServer > 0) {
          const totalForThisFile = response.status === 206 ? startByte + fileSizeFromServer : fileSizeFromServer
          if (totalForThisFile > addedToTotalBytes) {
            this.totalBytes += totalForThisFile - addedToTotalBytes
            addedToTotalBytes = totalForThisFile
          }
        }

        let lastProgressUpdate = Date.now()
        const PROGRESS_UPDATE_INTERVAL = 100

        const signal = this.abortController?.signal

        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            if (signal && onAbort) {
              try {
                signal.removeEventListener('abort', onAbort)
              } catch {}
            }
          }

          const onAbort = () => {
            try {
              response.data.destroy()
            } catch {}
            try {
              writer?.destroy()
            } catch {}
            cleanup()
            reject(new Error('AbortError'))
          }

          if (signal) {
            try {
              signal.addEventListener('abort', onAbort)
            } catch {

            }
          }

          response.data.on('data', (chunk: Buffer) => {
            downloadedChunksBytes += chunk.length
            this.downloadedBytes += chunk.length

            const now = Date.now()
            if (onProgress && now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
              onProgress()
              lastProgressUpdate = now
            }
          })

          response.data.pipe(writer!)
          writer!.on('finish', () => {
            cleanup()
            resolve()
          })
          writer!.on('error', (e) => {
            cleanup()
            reject(e)
          })
          response.data.on('error', (e: any) => {
            cleanup()
            reject(e)
          })
        })

        return
      } catch (error) {
        lastError = error as Error

        if (axios.isCancel(error) || lastError.message === 'AbortError') {
          throw lastError
        }

        attempts++

        this.downloadedBytes -= downloadedChunksBytes


        if (writer) {
          try {
            writer.destroy()
          } catch {}
        }

        if (attempts >= maxRetries) {
          if (fs.pathExistsSync(destination)) {
            try {
              await fs.remove(destination)
            } catch (e) {
              console.error(`Failed to remove corrupted file ${destination}:`, e)
            }
          }

          if (!item.size && addedToTotalBytes > 0) {
            this.totalBytes -= addedToTotalBytes

          }

          throw lastError
        }

        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 1000))
      }
    }
  }

  private sortByGroup = (items: DownloadItem[]): DownloadItem[][] => {
    const groups: Record<string, DownloadItem[]> = {}
    items.forEach((item) => {
      if (!groups[item.group]) groups[item.group] = []
      groups[item.group].push(item)
    })
    return Object.values(groups)
  }

  private getFileSha1 = async (filePath: string): Promise<string> => {
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

  private fileExistsAndMatches = async (
    filePath: string,
    sha1: string,
    size: number
  ): Promise<boolean> => {
    const actualPath = fs.pathExistsSync(filePath)
      ? filePath
      : fs.pathExistsSync(`${filePath}.disabled`)
        ? `${filePath}.disabled`
        : null

    if (!actualPath) return false

    try {
      if (sha1) {
        const currentSha1 = await this.getFileSha1(actualPath)
        if (currentSha1 !== sha1) return false
      }

      if (size) {
        const stats = await fs.stat(actualPath)
        if (stats.size !== size) return false
      }

      return true
    } catch (err) {
      console.error(`File verification error ${actualPath}:`, err)
      return false
    }
  }

  private directoryCreationCache = new Set<string>()

  private ensureDirectoryExists = (filePath: string): void => {
    const dir = path.dirname(filePath)

    if (this.directoryCreationCache.has(dir)) {
      return
    }

    if (!fs.pathExistsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.directoryCreationCache.add(dir)
  }

  private getSafeExtractPath(destinationRoot: string, entryName: string): string {

    const name = (entryName || '').replace(/\\/g, '/')

    if (!name || name === '.' || name === '/') {
      throw new Error(`Invalid archive entry name: "${entryName}"`)
    }

    if (name.startsWith('/') || name.startsWith('\\') || /^[a-zA-Z]:/.test(name)) {
      throw new Error(`Unsafe archive entry path (absolute): "${entryName}"`)
    }

    const normalized = path.posix.normalize(name)

    if (normalized.startsWith('..') || normalized.includes('/..')) {
      throw new Error(`Unsafe archive entry path (traversal): "${entryName}"`)
    }

    const root = path.resolve(destinationRoot)
    const target = path.resolve(root, normalized)

    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Unsafe archive entry path (escape): "${entryName}"`)
    }

    return target
  }

  private extractZipSafe = async (filePath: string, targetPath: string): Promise<void> => {

    const zip = new AdmZip(filePath)
    const entries = zip.getEntries()

    await fs.ensureDir(targetPath)

    for (const entry of entries) {
      const entryName = entry.entryName
      const outPath = this.getSafeExtractPath(targetPath, entryName)

      if ((entry as any).isDirectory) {
        await fs.ensureDir(outPath)
        continue
      }

      await fs.ensureDir(path.dirname(outPath))
      await fs.writeFile(outPath, entry.getData())
    }
  }

  private extractTarSafe = async (filePath: string, targetPath: string): Promise<void> => {
    await fs.ensureDir(targetPath)

    await tar.x({
      file: filePath,
      cwd: targetPath,
      filter: (p: string, entry: any) => {
        const safePath = this.getSafeExtractPath(targetPath, p)

        const type = entry?.type as string | undefined
        const linkpath = entry?.linkpath as string | undefined

        if (type === 'Link' || type === 'SymbolicLink') {
          if (!linkpath) return false

          const lp = linkpath.replace(/\\/g, '/')
          if (lp.startsWith('/') || lp.startsWith('\\') || /^[a-zA-Z]:/.test(lp)) {
            throw new Error(`Unsafe tar linkpath (absolute): "${linkpath}"`)
          }

          const lpn = path.posix.normalize(lp)
          if (lpn.startsWith('..') || lpn.includes('/..')) {
            throw new Error(`Unsafe tar linkpath (traversal): "${linkpath}"`)
          }
        }

        return !!safePath
      }
    })
  }

  private extractFile = async (
    filePath: string,
    targetPath: string,
    isDelete: boolean
  ): Promise<void> => {
    const ext = path.extname(filePath).toLowerCase()

    try {
      await fs.ensureDir(targetPath)

      if (ext === '.zip' || ext === '.jar' || ext === '.mrpack') {
        await this.extractZipSafe(filePath, targetPath)
      } else if (ext === '.gz' || ext === '.tgz') {
        await this.extractTarSafe(filePath, targetPath)
      } else {
        throw new Error(`Unsupported archive format: ${ext}`)
      }

      if (isDelete) {
        await fs.remove(filePath)
      }
    } catch (err) {
      console.error(`Extraction error ${filePath}:`, err)
      throw err
    }
  }
}
