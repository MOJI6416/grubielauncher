import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import icon from '../../../resources/icon.png?asset'
import { rpc } from '../rpc'
import { is } from '@electron-toolkit/utils'

export let mainWindow: BrowserWindow | null = null

export function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    minHeight: 720,
    minWidth: 1280,
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    resizable: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: is.dev,
      webSecurity: false,
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()

    rpc.login()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
