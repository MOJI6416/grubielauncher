import { execFile } from 'child_process'
import type { IArch } from '@/types/OS'

const CHECK_TIMEOUT_MS = 10_000
const INSTALL_TIMEOUT_MS = 20 * 60_000

export const ROSETTA_MISSING_MESSAGE =
  'Rosetta 2 is not installed: this Java runs on Apple Silicon only through it'

let installed = false

export function needsRosetta(arch: IArch | undefined): boolean {
  return process.platform === 'darwin' && process.arch === 'arm64' && arch === 'x64'
}

export function isRosettaInstalled(): Promise<boolean> {
  if (installed) return Promise.resolve(true)

  return new Promise((resolve) => {
    execFile(
      '/usr/bin/arch',
      ['-x86_64', '/usr/bin/true'],
      { timeout: CHECK_TIMEOUT_MS },
      (error) => {
        installed = !error
        resolve(installed)
      }
    )
  })
}

export async function assertRosettaFor(arch: IArch | undefined): Promise<void> {
  if (needsRosetta(arch) && !(await isRosettaInstalled())) {
    throw new Error(ROSETTA_MISSING_MESSAGE)
  }
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function installRosetta(prompt: string): Promise<boolean> {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return Promise.resolve(false)

  const script = [
    'do shell script',
    appleScriptString('/usr/sbin/softwareupdate --install-rosetta --agree-to-license'),
    'with prompt',
    appleScriptString(prompt.slice(0, 300)),
    'with administrator privileges'
  ].join(' ')

  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-e', script], { timeout: INSTALL_TIMEOUT_MS }, (error) => {
      if (error) console.warn('[rosetta] installation did not finish:', error.message)
      installed = false
      void isRosettaInstalled().then(resolve)
    })
  })
}
