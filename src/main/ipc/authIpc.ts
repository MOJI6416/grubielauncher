import { ipcMain } from 'electron'
import {
  authDiscord,
  authElyBy,
  authMicrosoft,
  refreshDiscordToken,
  refreshElyByToken,
  refreshMicrosoftToken
} from '../services/Auth'
import { startOAuthServer } from '../utilities/authServer'

export function registerAuthIpc() {
  ipcMain.handle('auth:microsoft', async (_, code: string) => {
    const auth = await authMicrosoft(code)
    return auth
  })

  ipcMain.handle('auth:microsoft:refresh', async (_, refreshToken: string, id: string) => {
    const auth = await refreshMicrosoftToken(refreshToken, id)
    return auth
  })

  ipcMain.handle('auth:elyby', async (_, code: string) => {
    const auth = await authElyBy(code)
    return auth
  })

  ipcMain.handle('auth:elyby:refresh', async (_, refreshToken: string, id: string) => {
    const auth = await refreshElyByToken(refreshToken, id)
    return auth
  })

  ipcMain.handle('auth:discord', async (_, code: string) => {
    const auth = await authDiscord(code)
    return auth
  })

  ipcMain.handle('auth:discord:refresh', async (_, refreshToken: string, id: string) => {
    const auth = await refreshDiscordToken(refreshToken, id)
    return auth
  })

  ipcMain.handle('auth:startServer', async () => {
    return await startOAuthServer()
  })
}
