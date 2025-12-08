import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  NativeImage,
  nativeImage,
  Notification,
  dialog
} from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { RPC } from './utils/rpc'
import { getSha1 } from './utils/files'
import { Downloader } from './utils/downloader'
import axios from 'axios'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { DownloadItem } from '@/types/Downloader'
import { IConsoleMessage } from '@/types/Console'
import netstat from 'node-netstat'
import dotenv from 'dotenv'

dotenv.config()

let mainWindow: BrowserWindow | null = null
let updaterWindow: BrowserWindow | null = null

const rpc = new RPC()

function createUpdaterWindow() {
  updaterWindow = new BrowserWindow({
    width: 300,
    height: 350,
    resizable: false,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      devTools: false,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: true
    }
  })

  updaterWindow.on('ready-to-show', () => {
    updaterWindow?.show()
    autoUpdater.checkForUpdates()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    updaterWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/updater')
  } else {
    updaterWindow.loadFile(join(__dirname, '../renderer/updater.html'))
  }
}

function createMainWindow(): void {
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
      devTools: false,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    rpc.login()

    ipcMain.on('updateActivity', async (_, activity) => {
      await rpc.updateActivity(activity)
    })

    ipcMain.on('notify', async (_, options: Electron.NotificationConstructorOptions) => {
      let image: NativeImage | undefined = undefined

      if (options.icon && options.icon != '') {
        const response = await axios.get(options.icon as string, { responseType: 'arraybuffer' })
        const buffer = await response.data
        image = nativeImage.createFromBuffer(Buffer.from(buffer))
      }

      const notification = new Notification({
        ...options,
        icon: image ? image : icon
      })

      notification.show()

      notification.on('click', () => {
        mainWindow?.restore()
      })
    })
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

const gotTheLock = app.requestSingleInstanceLock()

const gameProcesses = new Map<
  string,
  {
    process: ChildProcessWithoutNullStreams
    serverPort: number | null
  }
>()

if (!gotTheLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.grubielauncher')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // createUpdaterWindow()

    if (is.dev) createMainWindow()
    else createUpdaterWindow()

    autoUpdater.on('update-available', () => {
      updaterWindow?.webContents.send('update-available')
    })

    autoUpdater.on('download-progress', (p) => {
      updaterWindow?.webContents.send('download-progress', p)
    })

    autoUpdater.on('update-downloaded', () => {
      updaterWindow?.webContents.send('update-downloaded')
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

    ipcMain.handle('getLocale', () => {
      return app.getLocale()
    })

    ipcMain.handle(
      'getPath',
      (
        _,
        pathKey:
          | 'home'
          | 'appData'
          | 'userData'
          | 'sessionData'
          | 'temp'
          | 'exe'
          | 'module'
          | 'desktop'
          | 'documents'
          | 'downloads'
          | 'music'
          | 'pictures'
          | 'videos'
          | 'recent'
          | 'logs'
          | 'crashDumps'
      ) => {
        return app.getPath(pathKey)
      }
    )

    ipcMain.handle('getSha1', async (_, filePath: string) => {
      return await getSha1(filePath)
    })

    ipcMain.handle('startDownload', async (_, items: DownloadItem[], limit: number = 6) => {
      return new Promise<void>((resolve, reject) => {
        const downloader = new Downloader(items, limit)
        downloader
          .downloadFiles(
            (progress, group) => {
              mainWindow?.webContents.send('download-progress', { progress, group })
            },
            (progress) => {
              mainWindow?.setProgressBar(progress / 100)
            }
          )

          .then(() => {
            mainWindow?.setProgressBar(-1)
            resolve()
          })
          .catch((error) => {
            mainWindow?.setProgressBar(-1)
            reject(error)
          })
      })
    })

    ipcMain.handle('getVersion', async (_) => {
      return app.getVersion()
    })

    ipcMain.handle(
      'openFileDialog',
      async (
        _event,
        isFolder = false,
        filters = [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif'] }]
      ) => {
        try {
          if (!mainWindow) {
            throw new Error('Main window is not defined')
          }

          const result = await dialog.showOpenDialog(mainWindow, {
            properties: isFolder ? ['openDirectory'] : [],
            filters: !isFolder ? filters : []
          })

          if (result.canceled) {
            return []
          }

          return result.filePaths
        } catch (error) {
          return []
        }
      }
    )

    ipcMain.handle('runJar', async (_event, command, args, cwd: string) => {
      return new Promise((resolve, reject) => {
        const server = spawn(command, args, {
          cwd
        })

        server.on('close', (code) => {
          resolve(code)
        })

        server.stderr.on('data', (data) => {
          reject(data.toString())
        })
      })
    })

    ipcMain.handle('installServer', async (_event, command, args, serverPath: string) => {
      return new Promise((resolve) => {
        const server = spawn(command, args, {
          cwd: serverPath
        })

        server.stdout.on('data', (data) => {
          const output = data.toString()

          if (output.includes('EULA')) {
            resolve('done')
          }
        })

        server.on('close', (code) => {
          resolve(code)
        })
      })
    })

    ipcMain.handle('closeGame', async (_event, versionName: string, instance: number) => {
      const javaProcess = gameProcesses.get(`${versionName}-${instance}`)
      if (javaProcess) {
        javaProcess.process.kill()
        gameProcesses.delete(versionName)
      }
    })

    ipcMain.handle(
      'runGame',
      async (_event, command, args, versionPath: string, versionName: string, instance: number) => {
        mainWindow?.webContents.send('consoleClear', versionName, instance)

        const javaProcess = spawn(command, args, {
          cwd: versionPath
        })

        gameProcesses.set(`${versionName}-${instance}`, {
          process: javaProcess,
          serverPort: null
        })

        javaProcess.stdout.on('data', (data) => {
          const message = data.toString()

          if (message.includes('Setting gameDir') || message.includes('Setting user')) {
            mainWindow?.minimize()
            mainWindow?.webContents.send('launch')
          }

          const connectMatch = message.match(/Connecting to ([\w.-]+), (\d+)/)
          const processData = gameProcesses.get(`${versionName}-${instance}`)
          if (connectMatch) {
            const serverAddress = connectMatch[1]
            processData!.serverPort = parseInt(connectMatch[2], 10)
            const { serverPort } = processData!
            mainWindow?.webContents.send('friendUpdate', {
              serverAddress: `${serverAddress}:${serverPort}`
            })
          }

          const msg: IConsoleMessage = {
            type: 'info',
            message,
            tips: []
          }
          mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)
        })

        javaProcess.stderr.on('data', (data) => {
          const msg: IConsoleMessage = {
            type: 'error',
            message: data.toString(),
            tips: []
          }
          mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)
        })

        const checkConnection = (): void => {
          const processData = gameProcesses.get(`${versionName}-${instance}`)
          if (!processData || !processData.serverPort) {
            return
          }

          try {
            const connections: any[] = []

            netstat(
              {
                filter: {
                  remote: {
                    port: processData.serverPort
                  },
                  protocol: 'tcp'
                }
              },
              (item: any) => {
                if (item.state == 'ESTABLISHED') connections.push(item)
              }
            )

            setTimeout(() => {
              if (connections.length === 0) {
                mainWindow?.webContents.send('friendUpdate', { serverAddress: '' })
                processData.serverPort = null
              }
            }, 1000)
          } catch {}
        }

        const intervalId = setInterval(checkConnection, 5000)

        javaProcess.on('close', (c, signal) => {
          let code = c
          if (signal == 'SIGTERM') code = 0

          const msg: IConsoleMessage = {
            type: 'info',
            message: `Game closed with code ${code}`,
            tips: []
          }

          if (code === 0) {
            mainWindow?.webContents.send('consoleChangeStatus', versionName, instance, 'stopped')
            msg.type = 'success'
          } else {
            mainWindow?.webContents.send('consoleChangeStatus', versionName, instance, 'error')
            msg.type = 'error'
            msg.tips.push('checkIntegrity')
          }

          mainWindow?.webContents.send('consoleMessage', versionName, instance, msg)

          clearInterval(intervalId)
          gameProcesses.delete(`${versionName}-${instance}`)

          if (mainWindow?.isMinimized()) {
            mainWindow?.restore()
          }

          mainWindow?.webContents.send('launch')
          rpc.updateActivity()
          mainWindow?.webContents.send('friendUpdate', {
            versionName: '',
            versionCode: '',
            serverAddress: ''
          })
        })
      }
    )
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
