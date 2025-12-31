import { ipcMain } from 'electron'
import { Java } from '../game/Java'
import fs from 'fs-extra'

export function registerJavaIpc() {
  ipcMain.handle('java:getPath', async (_, majorVersion: number) => {
    const java = new Java(majorVersion)
    await java.init()

    if (await fs.pathExists(java.javaPath)) {
      return java.javaPath
    }

    await java.install()
    return java.javaPath
  })

  ipcMain.handle('java:install', async (_, majorVersion: number) => {
    const java = new Java(majorVersion)
    await java.init()
    await java.install()
    return java.javaPath
  })
}
