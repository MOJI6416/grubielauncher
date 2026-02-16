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

let oauthServerPromise:
  | Promise<{
      code: string
      provider: 'microsoft' | 'discord' | 'elyby'
    }>
  | null = null

export function registerAuthIpc() {
  const register = <T extends any[]>(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => any
  ) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler as any)
  }

  register('auth:microsoft', async (_, code: string) => {
    if (typeof code !== 'string' || !code) throw new Error('Invalid code')
    const auth = await authMicrosoft(code)
    return auth
  })

  register('auth:microsoft:refresh', async (_, refreshToken: string, id: string) => {
    if (typeof refreshToken !== 'string' || !refreshToken) throw new Error('Invalid refreshToken')
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    const auth = await refreshMicrosoftToken(refreshToken, id)
    return auth
  })

  register('auth:elyby', async (_, code: string) => {
    if (typeof code !== 'string' || !code) throw new Error('Invalid code')
    const auth = await authElyBy(code)
    return auth
  })

  register('auth:elyby:refresh', async (_, refreshToken: string, id: string) => {
    if (typeof refreshToken !== 'string' || !refreshToken) throw new Error('Invalid refreshToken')
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    const auth = await refreshElyByToken(refreshToken, id)
    return auth
  })

  register('auth:discord', async (_, code: string) => {
    if (typeof code !== 'string' || !code) throw new Error('Invalid code')
    const auth = await authDiscord(code)
    return auth
  })

  register('auth:discord:refresh', async (_, refreshToken: string, id: string) => {
    if (typeof refreshToken !== 'string' || !refreshToken) throw new Error('Invalid refreshToken')
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    const auth = await refreshDiscordToken(refreshToken, id)
    return auth
  })

  register('auth:startServer', async () => {
    if (!oauthServerPromise) {
      oauthServerPromise = startOAuthServer().finally(() => {
        oauthServerPromise = null
      })
    }
    return await oauthServerPromise
  })
}
