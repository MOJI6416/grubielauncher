import { attachApiHostFallback } from '../utilities/apiHost'
import {
  IAuthRequest,
  IAuthResponse,
  IRefreshTokenRequest,
  IRefreshTokenResponse
} from '@/types/Auth'
import axios from 'axios'
import { logAxiosError } from '../utilities/axiosLog'

const api = attachApiHostFallback(
  axios.create({
    timeout: 30000
  })
)

async function postOrNull<TResponse>(url: string, data: any, errorPrefix: string): Promise<TResponse | null> {
  try {
    const response = await api.post<TResponse>(url, data)
    return response.data
  } catch (error) {
    logAxiosError(errorPrefix, error, 'service:auth')
    return null
  }
}

export async function authMicrosoft(
  code: string,
  codeVerifier?: string
): Promise<IAuthResponse | null> {
  return postOrNull<IAuthResponse>(
    '/auth/microsoft',
    { code, ...(codeVerifier ? { codeVerifier } : {}) } as IAuthRequest,
    'Microsoft auth error'
  )
}

export async function refreshMicrosoftToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postOrNull<IRefreshTokenResponse>(
    '/auth/microsoft/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'Microsoft refresh error'
  )
}

export async function authElyBy(code: string): Promise<IAuthResponse | null> {
  return postOrNull<IAuthResponse>(
    '/auth/elyby',
    { code } as IAuthRequest,
    'ElyBy auth error'
  )
}

export async function refreshElyByToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postOrNull<IRefreshTokenResponse>(
    '/auth/elyby/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'ElyBy refresh error'
  )
}

export async function authDiscord(code: string): Promise<IAuthResponse | null> {
  return postOrNull<IAuthResponse>(
    '/auth/discord',
    { code } as IAuthRequest,
    'Discord auth error'
  )
}

export async function refreshDiscordToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  return postOrNull<IRefreshTokenResponse>(
    '/auth/discord/refresh',
    { refreshToken, id } as IRefreshTokenRequest,
    'Discord refresh error'
  )
}
