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
