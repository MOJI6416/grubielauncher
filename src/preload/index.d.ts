import { IElectronAPI } from './index'

declare global {
  interface Window {
    api: IElectronAPI
  }
}
