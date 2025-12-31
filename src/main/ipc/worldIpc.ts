import { ILocalAccount } from '@/types/Account'
import { ipcMain } from 'electron'
import { loadStatistics, readWorld, writeWorldName } from '../utilities/worlds'

export function registerWorldIpc() {
  ipcMain.handle('worlds:loadStatistics', async (_, worldPath: string, account: ILocalAccount) => {
    return await loadStatistics(worldPath, account)
  })

  ipcMain.handle('worlds:readWorld', async (_, worldPath: string, account: ILocalAccount) => {
    const worldData = await readWorld(worldPath, account)
    return worldData
  })

  ipcMain.handle('worlds:writeName', async (_, worldPath: string, newName: string) => {
    return await writeWorldName(worldPath, newName)
  })
}
