import { IAccountConf } from '@/types/Account'
import { app, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs-extra'

export function registerAccountsIpc() {
  ipcMain.removeHandler('accounts:save')

  ipcMain.handle(
    'accounts:save',
    async (_, accounts: IAccountConf['accounts'], lastPlayed: string, launcherPath: string) => {
      const expectedLauncherPath = path.resolve(app.getPath('appData'), '.grubielauncher')
      const providedLauncherPath = path.resolve(String(launcherPath || ''))

      const safeLauncherPath =
        providedLauncherPath === expectedLauncherPath ? providedLauncherPath : expectedLauncherPath

      if (!Array.isArray(accounts) || typeof lastPlayed !== 'string') {
        throw new Error('Invalid accounts payload')
      }

      await fs.ensureDir(safeLauncherPath)

      const accountsFile = path.join(safeLauncherPath, 'accounts.json')
      const tmpFile = `${accountsFile}.tmp-${process.pid}-${Date.now()}`

      const data: IAccountConf = {
        accounts,
        lastPlayed
      }

      try {
        await fs.writeFile(tmpFile, JSON.stringify(data, null, 2), 'utf-8')
        await fs.move(tmpFile, accountsFile, { overwrite: true })
        return true
      } catch (err) {
        await fs.remove(tmpFile).catch(() => {})
        throw err
      }
    }
  )
}
