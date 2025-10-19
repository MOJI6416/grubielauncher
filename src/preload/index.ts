import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  archiveFiles,
  extractAll,
  getSha1,
  getWorldName,
  readJSONFromArchive
} from '../main/utils/files'
import fsExtra from 'fs-extra'
import * as DiscordRPC from 'discord-rpc'
import { DownloadItem } from '@/types/Downloader'
import { detectSkinModel, renderCape, renderCharacter } from '@/main/utils/skin'
import { generateOfflineUUID } from '@/main/utils/other'
import { startOAuthServer } from '@/main/utils/server'

export const getPath = (key: string) => {
  return ipcRenderer.invoke('getPath', key)
}

// Custom APIs for renderer
export const api = {
  path: require('path'),
  os: require('os'),
  fromBuffer: Buffer.from,
  rimraf: require('rimraf').rimraf,
  fs: require('fs-extra'),
  tomlParse: require('toml').parse,
  getPath,
  startDownload: (items: DownloadItem[], limit: number = 6) =>
    ipcRenderer.invoke('startDownload', items, limit),
  getSha1,
  getVersion: () => ipcRenderer.invoke('getVersion'),
  nbt: require('prismarine-nbt'),
  updateActivity: (activity: DiscordRPC.Presence) => ipcRenderer.send('updateActivity', activity),
  shell: require('electron').shell,
  clipboard: require('electron').clipboard,
  isDirectory: (path: string) => {
    return fsExtra.statSync(path).isDirectory()
  },
  renderCharacter,
  renderCape,
  generateOfflineUUID,
  startOAuthServer,
  zlib: require('zlib'),
  getWorldName,
  extractAll,
  readJSONFromArchive,
  archiveFiles,
  detectSkinModel,
  env: {
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
    ELYBY_CLIENT_ID: process.env.ELYBY_CLIENT_ID,
    ELYBY_CLIENT_SECRET: process.env.ELYBY_CLIENT_SECRET,
    DISCORD_CLIENT_PASSWORD: process.env.DISCORD_CLIENT_PASSWORD,
    BACKEND_URL: process.env.BACKEND_URL,
    CURSEFORGE_API_KEY: process.env.CURSEFORGE_API_KEY
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.

export const electron = {
  ...electronAPI,
  process: {
    ...electronAPI.process,
    arch: process.arch
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electron)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electron
  // @ts-ignore (define in dts)
  window.api = api
}

;(async () => {
  const appdata = await ipcRenderer.invoke('getPath', 'appData')
  const launcherPath = api.path.join(appdata, '.grubielauncher')
  try {
    await fsExtra.access(launcherPath)
  } catch {
    await fsExtra.mkdir(launcherPath)
  }
})()
