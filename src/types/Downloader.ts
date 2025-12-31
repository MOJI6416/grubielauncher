export interface DownloadItem {
  url: string
  destination: string
  group: string
  sha1?: string
  size?: number
  options?: {
    extract?: boolean
    extractFolder?: string
    extractDelete?: boolean
  }
}

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
