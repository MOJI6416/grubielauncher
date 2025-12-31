import { ipcMain } from 'electron'
import os from 'os'

export function registerOsIpc() {
  ipcMain.handle('os:totalmem', () => {
    return os.totalmem()
  })
}
