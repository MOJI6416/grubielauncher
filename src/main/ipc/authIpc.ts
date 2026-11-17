import { ipcMain } from 'electron'
import type {
  ILittleSkinProfile,
  ILittleSkinSession,
  LittleSkinSignInResult
} from '@/types/Auth'
import {
  authDiscord,
  authElyBy,
  authLittleSkin,
  authMicrosoft,
  refreshDiscordToken,
  refreshElyByToken,
  refreshLittleSkinToken,
  refreshMicrosoftToken
} from '../services/Auth'
import { authenticateLittleSkin, LITTLESKIN_NO_PROFILES } from '../services/LittleSkin'
import {
  startOAuthServer,
  stopOAuthServer,
  type OAuthCallbackProvider,
} from '../utilities/authServer'

let oauthServerPromise:
  | Promise<{
      code: string
      provider: OAuthCallbackProvider
    }>
  | null = null
let oauthServerState: string | null = null

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

function readLittleSkinSession(value: unknown): ILittleSkinSession {
  const { accessToken, clientToken } = (value ?? {}) as Partial<ILittleSkinSession>
  if (!isBoundedString(accessToken, 8192) || !isBoundedString(clientToken, 256)) {
    throw new Error('Invalid LittleSkin session')
  }
  return { accessToken, clientToken }
}

function readLittleSkinProfile(value: unknown): ILittleSkinProfile {
  const { id, name } = (value ?? {}) as Partial<ILittleSkinProfile>
  if (!isBoundedString(id, 64) || !isBoundedString(name, 64)) {
    throw new Error('Invalid LittleSkin profile')
  }
  return { id, name }
}

export function registerAuthIpc() {
  const register = <T extends any[]>(
    channel: string,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => any
  ) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, handler as any)
  }

  register('auth:microsoft', async (_, code: string, codeVerifier?: string) => {
    if (typeof code !== 'string' || !code) throw new Error('Invalid code')
    if (codeVerifier !== undefined && typeof codeVerifier !== 'string') {
      throw new Error('Invalid codeVerifier')
    }
    const auth = await authMicrosoft(code, codeVerifier)
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

  register(
    'auth:littleskin',
    async (_, login: string, password: string): Promise<LittleSkinSignInResult> => {
      if (!isBoundedString(login, 256)) throw new Error('Invalid login')
      if (!isBoundedString(password, 1024)) throw new Error('Invalid password')

      const result = await authenticateLittleSkin(login.trim(), password)
      const profile =
        result.selectedProfile ?? (result.profiles.length === 1 ? result.profiles[0] : null)

      if (!profile) {
        if (result.profiles.length === 0) throw new Error(LITTLESKIN_NO_PROFILES)
        return { status: 'chooseProfile', session: result.session, profiles: result.profiles }
      }

      const auth = await authLittleSkin(
        result.session,
        result.selectedProfile ? undefined : profile
      )
      if (!auth) throw new Error('Empty auth response')
      return { status: 'signedIn', auth }
    }
  )

  register('auth:littleskin:profile', async (_, session: unknown, profile: unknown) => {
    const auth = await authLittleSkin(
      readLittleSkinSession(session),
      readLittleSkinProfile(profile)
    )
    if (!auth) throw new Error('Empty auth response')
    return auth
  })

  register('auth:littleskin:refresh', async (_, refreshToken: string, id: string) => {
    if (typeof refreshToken !== 'string' || !refreshToken) throw new Error('Invalid refreshToken')
    if (typeof id !== 'string' || !id) throw new Error('Invalid id')
    const auth = await refreshLittleSkinToken(refreshToken, id)
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

  register('auth:startServer', async (_, expectedState: string) => {
    if (typeof expectedState !== 'string' || !expectedState) {
      throw new Error('Invalid OAuth state')
    }

    if (!oauthServerPromise || oauthServerState !== expectedState) {
      oauthServerState = expectedState
      oauthServerPromise = startOAuthServer(expectedState).finally(() => {
        if (oauthServerState === expectedState) {
          oauthServerPromise = null
          oauthServerState = null
        }
      })
    }
    return await oauthServerPromise
  })

  register('auth:stopServer', async () => {
    await stopOAuthServer('OAuth sign-in was cancelled.')
    oauthServerPromise = null
    oauthServerState = null
    return true
  })
}
