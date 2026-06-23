import { ElectronAPI } from '@electron-toolkit/preload'
import { getSha1 } from '../main/utils/files'
import { DownloadStatus } from '@/types/DownloadManager'
import { IElectronAPI } from './index'

declare global {
  interface Window {
    api: IElectronAPI
  }
}
