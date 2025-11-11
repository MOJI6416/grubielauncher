import { ElectronAPI } from '@electron-toolkit/preload'
import { getSha1 } from '../main/utils/files'
import { DownloadStatus } from '@/types/DownloadManager'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      path: typeof import('path')
      os: typeof import('os')
      fromBuffer: typeof Buffer.from
      rimraf: typeof import('rimraf').rimraf
      fs: typeof import('fs-extra')
      tomlParse: typeof import('toml').parse
      getPath: (key: string) => Promise<string>
      startDownload: (items: DownloadItem[], limit: number = 6) => Promise<void>
      getSha1: typeof getSha1
      getVersion: () => Promise<string>
      nbt: typeof import('prismarine-nbt')
      updateActivity: (activity: DiscordRPC.Presence) => void
      shell: typeof import('electron').shell
      clipboard: typeof import('electron').clipboard
      isDirectory: (path: string) => boolean
      renderCharacter: typeof import('@/main/utils/skin').renderCharacter
      renderCape: typeof import('@/main/utils/skin').renderCape
      generateOfflineUUID: typeof import('@/main/utils/other').generateOfflineUUID
      startOAuthServer: typeof import('@/main/utils/server').startOAuthServer
      handleMinecraftServerStart: typeof import('@/main/utils/tunel').handleMinecraftServerStart
      closeTunnel: typeof import('@/main/utils/tunel').closeTunnel
      zlib: typeof import('zlib')
      getWorldName: typeof import('@/main/utils/files').getWorldName
      extractAll: typeof import('@/main/utils/files').extractAll
      readJSONFromArchive: typeof import('@/main/utils/files').readJSONFromArchive
      archiveFiles: typeof import('@/main/utils/files').archiveFiles
      detectSkinModel: typeof import('@/main/utils/skin').detectSkinModel
      env: {
        DISCORD_CLIENT_ID: string
        MICROSOFT_CLIENT_ID: string
        ELYBY_CLIENT_ID: string
        ELYBY_CLIENT_SECRET: string
        DISCORD_CLIENT_PASSWORD: string
        BACKEND_URL: string
        CURSEFORGE_API_KEY: string
      }
    }
  }
}
