import { is } from '@electron-toolkit/utils'
import { BrowserWindow } from 'electron'
import path, { join } from 'path'

export let updaterWindow: BrowserWindow | null = null

export function createUpdaterWindow() {
  updaterWindow = new BrowserWindow({
    width: 300,
    height: 350,
    resizable: false,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      devTools: is.dev,
      webSecurity: is.dev ? false : true,
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true
    }
  })

  updaterWindow.on('closed', () => {
    updaterWindow = null
  })

  updaterWindow.once('ready-to-show', () => {
    updaterWindow?.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    updaterWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/updater')
  } else {
    updaterWindow.loadFile(join(__dirname, '../renderer/updater.html'))
  }
}
