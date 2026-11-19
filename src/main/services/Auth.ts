import { attachApiHostFallback } from '../utilities/apiHost'
import {
  IAuthRequest,
  IAuthResponse,
  ILittleSkinProfile,
  ILittleSkinSession,
  IRefreshTokenRequest,
  IRefreshTokenResponse
} from '@/types/Auth'
import axios from 'axios'
import { logAxiosError } from '../utilities/axiosLog'
import { providerOutageError } from '@/shared/authRefresh'

const api = attachApiHostFallback(
  axios.create({
    timeout: 30000
  })
)

async function postAuth<TResponse>(url: string, data: any, errorPrefix: string): Promise<TResponse> {
  try {
    const response = await api.post<TResponse>(url, data)
    return response.data
  } catch (error) {
    logAxiosError(errorPrefix, error, 'service:auth')
    throw providerOutageError(error) ?? error
  }
}

export async function authMicrosoft(
  code: string,
  codeVerifier?: string
): Promise<IAuthResponse | null> {
  return postAuth<IAuthResponse>(
    '/auth/microsoft',
    { code, ...(codeVerifier ? { codeVerifier } : {}) } as IAuthRequest,
    'Microsoft auth error'
  )
}

export async function refreshMicrosoftToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postAuth<IRefreshTokenResponse>(
    '/auth/microsoft/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'Microsoft refresh error'
  )
}

export async function authElyBy(code: string): Promise<IAuthResponse | null> {
  return postAuth<IAuthResponse>(
    '/auth/elyby',
    { code } as IAuthRequest,
    'ElyBy auth error'
  )
}

export async function refreshElyByToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postAuth<IRefreshTokenResponse>(
    '/auth/elyby/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'ElyBy refresh error'
  )
}

export async function authLittleSkin(
  session: ILittleSkinSession,
  profile?: ILittleSkinProfile
): Promise<IAuthResponse | null> {
  return postAuth<IAuthResponse>(
    '/auth/littleskin',
    {
      accessToken: session.accessToken,
      clientToken: session.clientToken,
      ...(profile ? { profileId: profile.id, profileName: profile.name } : {})
    },
    'LittleSkin auth error'
  )
}

export async function refreshLittleSkinToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postAuth<IRefreshTokenResponse>(
    '/auth/littleskin/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'LittleSkin refresh error'
  )
}

export async function authDiscord(code: string): Promise<IAuthResponse | null> {
  return postAuth<IAuthResponse>(
    '/auth/discord',
    { code } as IAuthRequest,
    'Discord auth error'
  )
}

export async function refreshDiscordToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postAuth<IRefreshTokenResponse>(
    '/auth/discord/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'Discord refresh error'
  )
}
