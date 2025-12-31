import { ElectronAPI } from '@electron-toolkit/preload'
import { getSha1 } from '../main/utils/files'
import { DownloadStatus } from '@/types/DownloadManager'
import { electron, IElectronAPI } from './index'

declare global {
  interface Window {
    electron: typeof electron
    api: IElectronAPI
  }
}
