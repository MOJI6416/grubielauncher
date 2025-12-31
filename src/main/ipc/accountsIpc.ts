import { IAccountConf } from '@/types/Account'
import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs-extra'

export function registerAccountsIpc() {
  ipcMain.handle(
    'accounts:save',
    async (_, accounts: IAccountConf['accounts'], lastPlayed: string, launcherPath: string) => {
      const accountsFile = path.join(launcherPath, 'accounts.json')
      const data: IAccountConf = {
        accounts,
        lastPlayed
      }
      await fs.writeJSON(accountsFile, data, { spaces: 2 })
      return true
    }
  )
}
