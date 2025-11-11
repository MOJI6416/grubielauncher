import axios from 'axios'
import fs from 'fs-extra'
import AdmZip from 'adm-zip'
import path from 'path'
import crypto from 'crypto'
import pLimit from 'p-limit'
import { DownloadItem } from '@/types/Downloader'
import tar from 'tar'

export class Downloader {
  private limit = pLimit(6)
  private items: DownloadItem[] = []

  constructor(items: DownloadItem[], limit = 6) {
    this.items = items
    this.limit = pLimit(limit)
  }

  downloadFiles = async (
    notifyProgress: (progress: number, group: string) => void,
    notifyTray: (progress: number) => void
  ): Promise<void> => {
    const groups = this.sortByGroup(this.items)

    let totalFiles = this.items.length
    let completedFiles = 0

    for (const group of groups) {
      const groupName = group[0].group

      const promises = group.map((item) => {
        const { destination, sha1, size } = item

        return this.limit(async () => {
          try {
            const fileMatches = await this.fileExistsAndMatches(destination, sha1 || '', size || 0)
            if (fileMatches) {
              completedFiles++
              const overallProgress = Math.floor((completedFiles / totalFiles) * 100)

              notifyProgress(Math.floor((completedFiles / group.length) * 100), groupName)
              notifyTray(overallProgress)
              return
            }

            this.ensureDirectoryExists(destination)

            await this.downloadFile(item, 3)

            if (item.options?.extract) {
              this.extractFile(
                destination,
                item?.options?.extractFolder || path.dirname(destination),
                item?.options?.extractDelete != undefined ? item.options.extractDelete : true
              )
            }

            completedFiles++
            const overallProgress = Math.floor((completedFiles / totalFiles) * 100)

            notifyProgress(Math.floor((completedFiles / group.length) * 100), groupName)
            notifyTray(overallProgress)
          } catch {}
        })
      })

      await Promise.all(promises)
    }
  }

  private sortByGroup = (items: DownloadItem[]): DownloadItem[][] => {
    const groups: Record<string, DownloadItem[]> = {}
    items.forEach((item) => {
      if (!groups[item.group]) {
        groups[item.group] = []
      }
      groups[item.group].push(item)
    })
    return Object.values(groups)
  }

  private getFileSha1 = async (filePath: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha1')
      const stream = fs.createReadStream(filePath)

      stream.on('data', (chunk) => {
        hash.update(chunk)
      })

      stream.on('end', () => {
        resolve(hash.digest('hex'))
      })

      stream.on('error', (error) => {
        reject(error)
      })
    })
  }

  private fileExistsAndMatches = async (
    filePath: string,
    sha1: string,
    size: number
  ): Promise<boolean> => {
    if (!fs.pathExistsSync(filePath) && !fs.pathExistsSync(`${filePath}.disabled`)) return false

    if (sha1) {
      const currentSha1 = await this.getFileSha1(filePath)
      if (currentSha1 !== sha1) return false
    }

    if (size) {
      const stats = await fs.promises.stat(filePath)
      if (stats.size !== size) return false
    }

    return true
  }

  private ensureDirectoryExists = (filePath: string): void => {
    const dir = path.dirname(filePath)
    if (!fs.pathExistsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private downloadFile = async (item: DownloadItem, maxRetries = 3): Promise<void> => {
    const { url, destination } = item

    if (!url || url.startsWith('blocked::')) return

    let attempts = 0

    if (url.startsWith('file://')) {
      const localFilePath = url.slice(7)
      this.ensureDirectoryExists(destination)
      fs.copyFileSync(localFilePath, destination)
      return
    }

    while (attempts < maxRetries) {
      try {
        const writer = fs.createWriteStream(destination)
        const response = await axios.get(url, { responseType: 'stream' })

        await new Promise((resolve, reject) => {
          response.data.pipe(writer)
          writer.on('finish', () => resolve(0))
          writer.on('error', reject)
        })
        return
      } catch (error) {
        attempts++
        if (attempts >= maxRetries) throw error
      }
    }
  }

  private extractFile = async (
    filePath: string,
    targetPath: string,
    isDelete: boolean
  ): Promise<void> => {
    const ext = path.extname(filePath).toLowerCase()

    if (ext === '.zip') {
      const zip = new AdmZip(filePath)
      zip.extractAllTo(targetPath, true)
    } else if (ext === '.gz' || ext === '.tgz') {
      await tar.x({
        file: filePath,
        cwd: targetPath
      })
    } else {
      throw new Error('Unsupported archive format')
    }

    if (isDelete) {
      fs.unlinkSync(filePath)
    }
  }
}
