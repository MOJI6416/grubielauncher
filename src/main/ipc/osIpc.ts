import os from 'os'
import { shell } from 'electron'
import { check, handleSafe } from '../utilities/ipc'
import { availableMemoryBytes } from '../utilities/systemMemory'
import {
  detectLinuxLaunchTools,
  type LinuxLaunchTools
} from '../utilities/linuxLaunchTools'

type PrivacyPane = 'microphone' | 'accessibility'

const PRIVACY_URLS: Partial<Record<NodeJS.Platform, Record<PrivacyPane, string | null>>> = {
  win32: {
    microphone: 'ms-settings:privacy-microphone',
    accessibility: null
  },
  darwin: {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    accessibility:
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  }
}

export function registerOsIpc() {
  handleSafe<number>('os:totalmem', 0, () => {
    return os.totalmem()
  })

  handleSafe<number | null>('os:availableMemory', null, () =>
    availableMemoryBytes()
  )

  handleSafe<LinuxLaunchTools | null>('os:launchTools', null, () =>
    detectLinuxLaunchTools()
  )

  handleSafe<boolean, [PrivacyPane]>(
    'os:openPrivacySettings',
    false,
    [check.oneOf('microphone', 'accessibility')],
    async (_, pane) => {
      const url = PRIVACY_URLS[process.platform]?.[pane]
      if (!url) return false
      await shell.openExternal(url)
      return true
    }
  )
}
