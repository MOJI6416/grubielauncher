import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'path'
import icon from '../../../resources/icon.png?asset'
import { rpc } from '../rpc'
import { is } from '@electron-toolkit/utils'
import fs from 'fs-extra'

export let mainWindow: BrowserWindow | null = null

const MIN_WIDTH = 1280
const MIN_HEIGHT = 720

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

function getWindowStatePath(): string {
  return join(app.getPath('appData'), '.grubielauncher', 'window-state.json')
}

function readWindowState(): WindowState | null {
  try {
    const state = fs.readJSONSync(getWindowStatePath()) as Partial<WindowState>
    if (
      typeof state?.width !== 'number' ||
      typeof state?.height !== 'number'
    ) {
      return null
    }

    const width = Math.max(MIN_WIDTH, Math.round(state.width))
    const height = Math.max(MIN_HEIGHT, Math.round(state.height))

    let x: number | undefined
    let y: number | undefined
    if (typeof state.x === 'number' && typeof state.y === 'number') {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea
        return (
          state.x! < area.x + area.width &&
          state.x! + width > area.x &&
          state.y! < area.y + area.height &&
          state.y! + height > area.y
        )
      })
      if (visible) {
        x = Math.round(state.x)
        y = Math.round(state.y)
      }
    }

    return { width, height, x, y, isMaximized: state.isMaximized === true }
  } catch {
    return null
  }
}

function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getNormalBounds()
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized: window.isMaximized()
    }
    fs.writeJSONSync(getWindowStatePath(), state)
  } catch {}
}

export function createMainWindow(): void {
  const savedState = readWindowState()

  mainWindow = new BrowserWindow({
    minHeight: MIN_HEIGHT,
    minWidth: MIN_WIDTH,
    width: savedState?.width ?? MIN_WIDTH,
    height: savedState?.height ?? MIN_HEIGHT,
    ...(savedState?.x !== undefined && savedState?.y !== undefined
      ? { x: savedState.x, y: savedState.y }
      : {}),
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    resizable: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      devTools: is.dev,
      webSecurity: is.dev ? false : true,
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true
    }
  })

  mainWindow.on('close', () => {
    if (mainWindow) saveWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.once('ready-to-show', () => {
    void rpc.login()
    mainWindow?.show()
    if (savedState?.isMaximized) {
      mainWindow?.maximize()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        shell.openExternal(details.url)
      }
    } catch {
    }
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}
