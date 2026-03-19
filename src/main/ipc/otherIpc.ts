import { DownloadItem } from '@/types/Downloader'
import {
  app,
  clipboard,
  dialog,
  NativeImage,
  shell,
  Notification,
  nativeImage
} from 'electron'
import { Downloader } from '../utilities/downloader'
import { mainWindow } from '../windows/mainWindow'
import { getLauncherPaths } from '../utilities/other'
import { rpc } from '../rpc'
import { RpcRendererContext } from '@/types/Rpc'
import icon from '../../../resources/icon.png?asset'
import axios from 'axios'
import { handleSafe } from '../utilities/ipc'

function assertSafeExternalUrl(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Unsupported external URL protocol')
  }

  return parsed.toString()
}

export function registerOtherIpc() {
  handleSafe<void, [string]>('shell:openExternal', undefined, async (_, url: string) => {
    await shell.openExternal(assertSafeExternalUrl(url))
  })

  handleSafe<void, [string]>('clipboard:writeText', undefined, async (_, text: string) => {
    clipboard.writeText(text)
  })

  handleSafe<string>('other:getLocale', 'en', () => {
    return app.getLocale()
  })

  handleSafe<
    string,
    [
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
    ]
  >('other:getPath', '', (_, pathKey) => {
    return app.getPath(pathKey)
  })

  handleSafe<void, [DownloadItem[], number?]>('file:download', undefined, async (_, items, limit = 6) => {
    const downloader = new Downloader(limit)
    await downloader.downloadFiles(items)
  })

  handleSafe<string>('other:getVersion', '', () => {
    return app.getVersion()
  })

  handleSafe<string[], [boolean?, { name: string; extensions: string[] }[]?, boolean?]>(
    'other:openFileDialog',
    [],
    async (
      _event,
      isFolder = false,
      filters = [{ name: 'Image', extensions: ['jpg', 'jpeg', 'png', 'gif'] }],
      multi: boolean = false
    ) => {
      if (!mainWindow) return []

      const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] = []
      if (isFolder) properties.push('openDirectory')
      else properties.push('openFile')

      if (multi) properties.push('multiSelections')

      const result = await dialog.showOpenDialog(mainWindow, {
        properties,
        filters: !isFolder ? filters : []
      })

      if (result.canceled) return []
      return result.filePaths
    }
  )

  handleSafe<Awaited<ReturnType<typeof getLauncherPaths>>>('other:getPaths', {
    launcher: '',
    minecraft: '',
    java: '',
    skins: ''
  }, async () => {
    return await getLauncherPaths()
  })

  handleSafe<void, [string]>('shell:openPath', undefined, async (_, p: string) => {
    await shell.openPath(p)
  })

  handleSafe<void, [RpcRendererContext]>('rpc:syncContext', undefined, async (_, context) => {
    await rpc.syncContext(context)
  })

  handleSafe<void, [Electron.NotificationConstructorOptions]>(
    'other:notify',
    undefined,
    async (_, options) => {
      let image: NativeImage | undefined = undefined

      if (options.icon && options.icon !== '') {
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
    }
  )

  handleSafe<void>('other:restoreWindow', undefined, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (!mainWindow.isVisible()) {
      mainWindow.show()
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
  })
}
