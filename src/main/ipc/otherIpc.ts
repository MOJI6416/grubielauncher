import { DownloadItem } from '@/types/Downloader'
import fs from 'fs-extra'
import {
  app,
  clipboard,
  dialog,
  NativeImage,
  shell,
  Notification,
  nativeImage,
  ipcMain
} from 'electron'
import { Downloader } from '../utilities/downloader'
import {
  confirmWindowClose,
  mainWindow,
  setUnsavedChangesGuard
} from '../windows/mainWindow'
import { getLauncherPaths } from '../utilities/other'
import { getConnectivityPlan, runConnectivityTests } from '../utilities/connectivityTest'
import { ConnectivityCheckPlanEntry, ConnectivityCheckResult } from '@/types/Connectivity'
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled,
  setDownloadSource,
  updateMojangReachableFromConnectivity
} from '../utilities/mirrorState'
import { MirrorState } from '@/shared/mirrorMode'
import { DownloadSource } from '@/types/Settings'
import { rpc } from '../rpc'
import { RpcRendererContext } from '@/types/Rpc'
import { NotificationClickAction } from '@/types/Notification'
import icon from '../../../resources/icon.png?asset'
import axios from 'axios'
import path from 'path'
import {
  check,
  getIpcFailureToken,
  handleSafe,
  IpcArgumentError
} from '../utilities/ipc'
import { IPC_FAILURE_TOKEN_CHANNEL } from '@/shared/ipcFailureEnvelope'
import {
  assertOpenablePath,
  assertWritablePath,
  blessUserSelectedPath,
  isOpenableFileExtension,
  listBlessedPaths,
  PathPolicyError,
  revokeBlessedPath
} from '../utilities/safePath'
import { BlessedPathInfo } from '@/types/AllowedPath'
import { isSafeRemoteFetchUrl } from '../utilities/safeUrl'
import { createInstanceShortcut, getImageBase64 } from '../utilities/shortcut'
import { assertSafeVersionName } from '@/shared/versionName'

let activeConnectivityRun: Promise<ConnectivityCheckResult[]> | null = null

const MAX_PATH_LENGTH = 4096
const MAX_DOWNLOAD_ITEMS = 20000
const MAX_CLIPBOARD_LENGTH = 8 * 1024 * 1024
const MAX_NOTIFICATION_TEXT_LENGTH = 512
const MAX_DIALOG_FILTERS = 20
const APP_PATH_KEYS = new Set([
  'home',
  'appData',
  'userData',
  'sessionData',
  'temp',
  'exe',
  'module',
  'desktop',
  'documents',
  'downloads',
  'music',
  'pictures',
  'videos',
  'recent',
  'logs',
  'crashDumps'
])
const DOWNLOAD_SOURCES: DownloadSource[] = ['auto', 'official', 'mirror']

function toShortText(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined

  let text = ''
  for (const char of value.slice(0, MAX_NOTIFICATION_TEXT_LENGTH)) {
    const code = char.codePointAt(0) ?? 0
    text += code < 32 || code === 127 ? ' ' : char
  }

  return text
}

function sanitizeNotificationOptions(
  options: Electron.NotificationConstructorOptions
): Electron.NotificationConstructorOptions {
  return {
    title: toShortText(options?.title),
    subtitle: toShortText(options?.subtitle),
    body: toShortText(options?.body),
    silent: options?.silent === true
  }
}

function sanitizeDialogFilters(
  filters: unknown
): { name: string; extensions: string[] }[] | null {
  if (!Array.isArray(filters)) return null

  const result = filters
    .slice(0, MAX_DIALOG_FILTERS)
    .filter(
      (filter): filter is { name: string; extensions: string[] } =>
        !!filter &&
        typeof filter === 'object' &&
        typeof (filter as { name?: unknown }).name === 'string' &&
        Array.isArray((filter as { extensions?: unknown }).extensions)
    )
    .map((filter) => ({
      name: filter.name,
      extensions: filter.extensions.filter(
        (extension): extension is string => typeof extension === 'string'
      )
    }))

  return result.length > 0 ? result : null
}

function toSafeDownloadItem(value: unknown): DownloadItem {
  const item = (value ?? {}) as Partial<DownloadItem>
  const isText = check.nonEmptyString(MAX_PATH_LENGTH)
  const refuse = () => {
    throw new IpcArgumentError('Refused file:download: item is not allowed')
  }

  if (!isText(item.url) || !isText(item.destination) || !isText(item.group)) refuse()
  if (item.options !== undefined && !check.object(16)(item.options)) refuse()

  const options = item.options ?? {}
  const safe: DownloadItem = {
    url: item.url as string,
    destination: item.destination as string,
    group: item.group as string
  }

  if (isText(item.sha1)) safe.sha1 = item.sha1
  if (isText(item.checksum)) safe.checksum = item.checksum
  if (item.checksumType === 'sha1' || item.checksumType === 'sha256') {
    safe.checksumType = item.checksumType
  }
  if (check.number()(item.size)) safe.size = item.size

  if (options.extract === true) {
    const extractFolder = isText(options.extractFolder)
      ? (options.extractFolder as string)
      : path.dirname(safe.destination)

    assertWritablePath(extractFolder, 'file:download extract folder')

    safe.options = {
      extract: true,
      extractFolder,
      extractDelete: options.extractDelete !== false
    }
  }

  if (check.number()(options.maxBytes)) {
    safe.options = { ...safe.options, maxBytes: options.maxBytes }
  }
  if (options.silent === true) {
    safe.options = { ...safe.options, silent: true }
  }

  return safe
}

function assertSafeExternalUrl(url: string): string {
  const parsed = new URL(url)
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    throw new Error('Unsupported external URL protocol')
  }

  parsed.username = ''
  parsed.password = ''

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
  ipcMain.removeAllListeners(IPC_FAILURE_TOKEN_CHANNEL)
  ipcMain.on(IPC_FAILURE_TOKEN_CHANNEL, (event) => {
    event.returnValue = getIpcFailureToken()
  })

  ipcMain.on('safepath:bless', (event, target: unknown) => {
    event.returnValue = false
    if (typeof target !== 'string' || !target || target.length > MAX_PATH_LENGTH) return
    if (target.includes('\0')) return
    if (!fs.pathExistsSync(target)) return

    blessUserSelectedPath(target, 'file', 'read')
    event.returnValue = true
  })

  handleSafe<BlessedPathInfo[]>('safepath:list', [], () => listBlessedPaths())

  handleSafe<boolean, [string]>(
    'safepath:revoke',
    false,
    [check.nonEmptyString(MAX_PATH_LENGTH)],
    (_, target) => revokeBlessedPath(target)
  )

  handleSafe<void, [string]>('shell:openExternal', undefined, async (_, url: string) => {
    await shell.openExternal(assertSafeExternalUrl(url))
  })

  handleSafe<boolean, [string]>('clipboard:writeText', false, async (_, text: string) => {
    if (typeof text !== 'string') return false
    if (text.length > MAX_CLIPBOARD_LENGTH) return false

    clipboard.writeText(text)
    return clipboard.readText() === text
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
    if (!APP_PATH_KEYS.has(pathKey)) return ''
    return app.getPath(pathKey)
  })

  handleSafe<boolean, [DownloadItem[], number?]>(
    'file:download',
    false,
    [check.arrayOf(check.object(), MAX_DOWNLOAD_ITEMS), check.optional(check.number())],
    async (_, items, limit = 6) => {
      const safeItems = items.map(toSafeDownloadItem)
      const parallel = Number.isFinite(limit) ? Math.min(16, Math.max(1, Math.trunc(limit))) : 6
      const downloader = new Downloader(parallel)
      await downloader.downloadFiles(safeItems)
      return true
    }
  )

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

      const pickFolder = isFolder === true
      const properties: ('openFile' | 'openDirectory' | 'multiSelections')[] = []
      if (pickFolder) properties.push('openDirectory')
      else properties.push('openFile')

      if (multi === true) properties.push('multiSelections')

      const result = await dialog.showOpenDialog(mainWindow, {
        properties,
        filters: !pickFolder ? (sanitizeDialogFilters(filters) ?? []) : []
      })

      if (result.canceled) return []

      const kind = pickFolder ? 'folder' : 'file'
      for (const selectedPath of result.filePaths) {
        blessUserSelectedPath(selectedPath, kind, 'readwrite')
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
    assertOpenablePath(p, 'shell:openPath')

    const stats = await fs.stat(p)
    if (!stats.isDirectory()) {
      if (!stats.isFile() || !isOpenableFileExtension(p)) {
        throw new PathPolicyError(`Refused shell:openPath for ${String(p)}`)
      }
    }

    const failure = await shell.openPath(p)
    if (failure) throw new Error(failure)
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
    if (!context || typeof context !== 'object' || Array.isArray(context)) return
    await rpc.syncContext(context)
  })

  handleSafe<void, [Electron.NotificationConstructorOptions, NotificationClickAction?]>(
    'other:notify',
    undefined,
    async (_, options, clickAction) => {
      if (!options || typeof options !== 'object') return

      let image: NativeImage | undefined = undefined

      if (await isSafeRemoteFetchUrl(options.icon)) {
        const response = await axios.get(options.icon as string, {
          responseType: 'arraybuffer',
          timeout: 10000,
          maxContentLength: 5 * 1024 * 1024
        })
        const buffer = await response.data
        image = nativeImage.createFromBuffer(Buffer.from(buffer))
      }

      const notification = new Notification({
        ...sanitizeNotificationOptions(options),
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

  handleSafe<void, [boolean]>(
    'other:setUnsavedGuard',
    undefined,
    [check.boolean()],
    async (_, value) => {
      setUnsavedChangesGuard(value)
    }
  )

  handleSafe<void>('other:confirmClose', undefined, () => {
    confirmWindowClose()
  })

  handleSafe<ConnectivityCheckPlanEntry[]>('connectivity:plan', [], () =>
    getConnectivityPlan()
  )

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
    if (!DOWNLOAD_SOURCES.includes(source)) return
    setDownloadSource(source)
  })

  handleSafe<MirrorState>(
    'mirror:getState',
    { source: 'auto', mirrorDisabled: false, mojangReachable: null },
    async () => ({
      source: getDownloadSource(),
      mirrorDisabled: isMirrorDisabled(),
      mojangReachable: getMojangReachable()
    })
  )

  handleSafe<{ success: boolean; error?: string }, [string, number?, string?]>(
    'shortcut:create',
    { success: false },
    async (_, versionName: string, instance = 0, imageSource?: string) => {
      assertSafeVersionName(versionName)
      const safeInstance = Number.isFinite(instance) ? Math.max(0, Math.trunc(instance)) : 0

      return await createInstanceShortcut(
        versionName.trim(),
        safeInstance,
        typeof imageSource === 'string' ? imageSource : undefined
      )
    }
  )

  handleSafe<string | null, [string]>(
    'image:bytes',
    null,
    async (_, source: string) => {
      if (typeof source !== 'string' || !source) return null
      return await getImageBase64(source)
    }
  )
}
