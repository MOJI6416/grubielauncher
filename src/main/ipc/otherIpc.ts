import { DownloadItem } from '@/types/Downloader'
import fs from 'fs-extra'
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
import { runConnectivityTests } from '../utilities/connectivityTest'
import { ConnectivityCheckResult } from '@/types/Connectivity'
import {
  setDownloadSource,
  updateMojangReachableFromConnectivity
} from '../utilities/mirrorState'
import { DownloadSource } from '@/types/Settings'
import { rpc } from '../rpc'
import { RpcRendererContext } from '@/types/Rpc'
import { NotificationClickAction } from '@/types/Notification'
import icon from '../../../resources/icon.png?asset'
import axios from 'axios'
import { handleSafe } from '../utilities/ipc'
import { assertWritablePath, blessUserSelectedPath } from '../utilities/safePath'
import { isSafeRemoteImageUrl } from '../utilities/safeUrl'
import { createInstanceShortcut, getImageBase64 } from '../utilities/shortcut'

let activeConnectivityRun: Promise<ConnectivityCheckResult[]> | null = null

function assertSafeExternalUrl(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Unsupported external URL protocol')
  }

  return parsed.toString()
}

function restoreMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.focus()
}

function sendNotificationClick(action?: NotificationClickAction): void {
  if (!action || !mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.webContents.isDestroyed()) return

  mainWindow.webContents.send('other:notificationClick', action)
}

export function registerOtherIpc() {
  handleSafe<void, [string]>('shell:openExternal', undefined, async (_, url: string) => {
    await shell.openExternal(assertSafeExternalUrl(url))
  })

  handleSafe<boolean, [string]>('clipboard:writeText', false, async (_, text: string) => {
    clipboard.writeText(text)
    return true
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

      const kind = isFolder ? 'folder' : 'file'
      for (const selectedPath of result.filePaths) {
        blessUserSelectedPath(selectedPath, kind)
      }

      return result.filePaths
    }
  )

  handleSafe<Awaited<ReturnType<typeof getLauncherPaths>>>('other:getPaths', {
    launcher: '',
    minecraft: '',
    java: '',
    skins: '',
    cache: '',
    shortcuts: ''
  }, async () => {
    return await getLauncherPaths()
  })

  handleSafe<void, [string]>('shell:openPath', undefined, async (_, p: string) => {
    assertWritablePath(p, 'shell:openPath')
    await shell.openPath(p)
  })

  handleSafe<boolean, [string]>('shell:trashItem', false, async (_, p: string) => {
    assertWritablePath(p, 'shell:trashItem')
    try {
      await shell.trashItem(p)
    } catch {
      await fs.remove(p)
    }
    return true
  })

  handleSafe<void, [RpcRendererContext]>('rpc:syncContext', undefined, async (_, context) => {
    await rpc.syncContext(context)
  })

  handleSafe<void, [Electron.NotificationConstructorOptions, NotificationClickAction?]>(
    'other:notify',
    undefined,
    async (_, options, clickAction) => {
      let image: NativeImage | undefined = undefined

      if (isSafeRemoteImageUrl(options.icon)) {
        const response = await axios.get(options.icon, {
          responseType: 'arraybuffer',
          timeout: 10000,
          maxContentLength: 5 * 1024 * 1024
        })
        const buffer = await response.data
        image = nativeImage.createFromBuffer(Buffer.from(buffer))
      }

      const notification = new Notification({
        ...options,
        icon: image ? image : icon
      })

      notification.show()

      notification.on('click', () => {
        restoreMainWindow()
        sendNotificationClick(clickAction)
      })
    }
  )

  handleSafe<void>('other:restoreWindow', undefined, () => {
    restoreMainWindow()
  })

  handleSafe<void>('window:minimize', undefined, () => {
    mainWindow?.minimize()
  })

  handleSafe<void>('window:maximizeToggle', undefined, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })

  handleSafe<void>('window:close', undefined, () => {
    mainWindow?.close()
  })

  handleSafe<ConnectivityCheckResult[]>('connectivity:test', [], async (event) => {
    if (activeConnectivityRun) return await activeConnectivityRun

    activeConnectivityRun = (async () => {
      const results = await runConnectivityTests((result) => {
        try {
          if (!event.sender.isDestroyed()) {
            event.sender.send('connectivity:result', result)
          }
        } catch {}
      })

      updateMojangReachableFromConnectivity(results)
      return results
    })().finally(() => {
      activeConnectivityRun = null
    })

    return await activeConnectivityRun
  })

  handleSafe<void, [DownloadSource]>('mirror:setSource', undefined, async (_, source) => {
    setDownloadSource(source)
  })

  handleSafe<{ success: boolean; error?: string }, [string, number?, string?]>(
    'shortcut:create',
    { success: false },
    async (_, versionName: string, instance = 0, imageSource?: string) => {
      return await createInstanceShortcut(versionName, instance, imageSource)
    }
  )

  handleSafe<string | null, [string]>(
    'image:bytes',
    null,
    async (_, source: string) => {
      return await getImageBase64(source)
    }
  )
}
