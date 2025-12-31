import { DownloadItem } from '@/types/Downloader'
import {
  app,
  clipboard,
  dialog,
  ipcMain,
  NativeImage,
  shell,
  Notification,
  nativeImage
} from 'electron'
import { Downloader } from '../utilities/downloader'
import { mainWindow } from '../windows/mainWindow'
import { getLauncherPaths } from '../utilities/other'
import { rpc } from '../rpc'
import icon from '../../../resources/icon.png?asset'
import axios from 'axios'

export function registerOtherIpc() {
  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('clipboard:writeText', async (_, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('other:getLocale', () => {
    return app.getLocale()
  })

  ipcMain.handle(
    'other:getPath',
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

  ipcMain.handle('file:download', async (_, items: DownloadItem[], limit: number = 6) => {
    const downloader = new Downloader(limit)
    await downloader.downloadFiles(items)
  })

  ipcMain.handle('other:getVersion', async (_) => {
    return app.getVersion()
  })

  ipcMain.handle(
    'other:openFileDialog',
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

  ipcMain.handle('other:getPaths', async () => {
    return await getLauncherPaths()
  })

  ipcMain.handle('shell:openPath', async (_, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle('rpc:updateActivity', async (_, activity) => {
    await rpc.updateActivity(activity)
  })

  ipcMain.handle('other:notify', async (_, options: Electron.NotificationConstructorOptions) => {
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
}
