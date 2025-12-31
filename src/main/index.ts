import { app } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import * as ipcHandlers from './ipc'
import { createMainWindow } from './windows/mainWindow'
import { createUpdaterWindow, updaterWindow } from './windows/updaterWindow'
import path from 'path'
import fs from 'fs-extra'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.grubielauncher')

    const appdata = app.getPath('appData')
    const launcherPath = path.join(appdata, '.grubielauncher')
    await fs.ensureDir(launcherPath)

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // createUpdaterWindow()

    if (is.dev) createMainWindow()
    else {
      createUpdaterWindow()
      autoUpdater.checkForUpdates()
    }

    autoUpdater.on('download-progress', (p) => {
      updaterWindow?.webContents.send('updater:downloadProgress', p.percent.toFixed(1))
    })

    autoUpdater.on('update-downloaded', () => {
      autoUpdater.quitAndInstall()
    })

    autoUpdater.on('update-not-available', () => {
      updaterWindow?.close()
      createMainWindow()
    })

    autoUpdater.on('error', () => {
      updaterWindow?.close()
      createMainWindow()
    })

    Object.values(ipcHandlers).forEach((register) => register())
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
