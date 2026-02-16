import { BACKEND_URL } from '@/shared/config'
import {
  IAuthRequest,
  IAuthResponse,
  IRefreshTokenRequest,
  IRefreshTokenResponse
} from '@/types/Auth'
import axios from 'axios'

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000
})

function logAxiosError(prefix: string, error: unknown) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const statusText = error.response?.statusText
    const message = error.message
    console.error(`${prefix}:`, status ? `HTTP ${status}${statusText ? ` ${statusText}` : ''}` : message)
    return
  }

  console.error(`${prefix}:`, error)
}

async function postOrNull<TResponse>(url: string, data: any, errorPrefix: string): Promise<TResponse | null> {
  try {
    const response = await api.post<TResponse>(url, data)
    return response.data
  } catch (error) {
    logAxiosError(errorPrefix, error)
    return null
  }
}

export async function authMicrosoft(code: string): Promise<IAuthResponse | null> {
  return postOrNull<IAuthResponse>(
    '/auth/microsoft',
    { code } as IAuthRequest,
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
