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

const fallbackModsResult: VersionInstallResult = {
  success: false,
  error: 'Mods operation failed.'
}

let activeModsInstall:
  | {
      controller: AbortController
      mods: Mods
    }
  | null = null

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
      if (activeModsInstall) {
        return {
          success: false,
          error: 'Another mods operation is already running.'
        }
      }

      const controller = new AbortController()
      const mods = new Mods(settings, versionConf, server)

      activeModsInstall = { controller, mods }

      try {
        await mods.check({
          ...options,
          signal: controller.signal
        })
        return { success: true }
      } catch (error) {
        if (
          controller.signal.aborted ||
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
        if (activeModsInstall?.controller === controller) {
          activeModsInstall = null
        }
      }
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
      if (activeModsInstall) {
        return {
          success: false,
          error: 'Another mods operation is already running.'
        }
      }

      const controller = new AbortController()
      const mods = new Mods(settings, versionConf)

      activeModsInstall = { controller, mods }

      try {
        await mods.downloadOther({
          ...options,
          signal: controller.signal
        })
        return { success: true }
      } catch (error) {
        if (
          controller.signal.aborted ||
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
        if (activeModsInstall?.controller === controller) {
          activeModsInstall = null
        }
      }
    }
  )

  handleSafe('mods:cancelInstall', false, async () => {
    if (!activeModsInstall) return false

    activeModsInstall.controller.abort()
    activeModsInstall.mods.cancelInstall()
    return true
  })
}
