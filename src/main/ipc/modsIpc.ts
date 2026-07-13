import { Mods } from '../game/Mods'
import { TSettings } from '@/types/Settings'
import { IVersionConf } from '@/types/IVersion'
import { IServerConf } from '@/types/Server'
import { handleSafe } from '../utilities/ipc'
import {
  VERSION_INSTALL_CANCELLED,
  VersionInstallOptions,
  VersionInstallResult,
} from '@/types/InstallationProgress'
import {
  cancelActiveInstallOperation,
  tryBeginInstallOperation,
} from './installLock'

const fallbackModsResult: VersionInstallResult = {
  success: false,
  error: 'Mods operation failed.'
}

async function runModsOperation(
  mods: Mods,
  action: (mods: Mods, signal: AbortSignal) => Promise<void>
): Promise<VersionInstallResult> {
  const lock = tryBeginInstallOperation(() => mods.cancelInstall())
  if (!lock) {
    return {
      success: false,
      error: 'Another installation operation is already running.'
    }
  }

  try {
    await action(mods, lock.controller.signal)
    return { success: true, failures: mods.lastFailures?.failures }
  } catch (error) {
    if (
      lock.controller.signal.aborted ||
      (error instanceof Error && error.message === VERSION_INSTALL_CANCELLED)
    ) {
      return {
        success: false,
        cancelled: true,
        error: VERSION_INSTALL_CANCELLED
      }
    }

    throw error
  } finally {
    lock.end()
  }
}

export function registerModsIpc() {
  handleSafe<VersionInstallResult>(
    'mods:check',
    fallbackModsResult,
    async (
      _event,
      settings: TSettings,
      versionConf: IVersionConf,
      server?: IServerConf,
      options?: VersionInstallOptions
    ) => {
      const mods = new Mods(settings, versionConf, server)
      return runModsOperation(mods, (m, signal) =>
        m.check({ ...options, signal })
      )
    }
  )

  handleSafe<VersionInstallResult>(
    'mods:downloadOther',
    fallbackModsResult,
    async (
      _event,
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions
    ) => {
      const mods = new Mods(settings, versionConf)
      return runModsOperation(mods, (m, signal) =>
        m.downloadOther({ ...options, signal })
      )
    }
  )

  handleSafe<VersionInstallResult>(
    'mods:syncLive',
    fallbackModsResult,
    async (
      _event,
      settings: TSettings,
      versionConf: IVersionConf,
      options?: VersionInstallOptions
    ) => {
      const mods = new Mods(settings, versionConf)
      return runModsOperation(mods, (m, signal) =>
        m.syncLive({ ...options, signal })
      )
    }
  )

  handleSafe('mods:cancelInstall', false, async () => {
    return cancelActiveInstallOperation()
  })
}
