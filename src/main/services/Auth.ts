import { BACKEND_URL } from '@/shared/config'
import {
  IAuthRequest,
  IAuthResponse,
  IRefreshTokenRequest,
  IRefreshTokenResponse
} from '@/types/Auth'
import axios from 'axios'

export async function authMicrosoft(code: string): Promise<IAuthResponse | null> {
  try {
    const response = await axios.post<IAuthResponse>(`${BACKEND_URL}/auth/microsoft`, {
      code
    } as IAuthRequest)
    return response.data
  } catch (error) {
    console.error('Microsoft auth error:', error)
    return null
  }
}

export async function refreshMicrosoftToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  try {
    const response = await axios.post<IRefreshTokenResponse>(
      `${BACKEND_URL}/auth/microsoft/refresh`,
      {
        refreshToken,
        id
      } as IRefreshTokenRequest
    )
    return response.data
  } catch (error) {
    console.error('Microsoft refresh error:', error)
    return null
  }
}

export async function authElyBy(code: string): Promise<IAuthResponse | null> {
  try {
    const response = await axios.post<IAuthResponse>(`${BACKEND_URL}/auth/elyby`, {
      code
    } as IAuthRequest)
    return response.data
  } catch (error) {
    console.error('ElyBy auth error:', error)
    return null
  }
}

export async function refreshElyByToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  try {
    const response = await axios.post<IRefreshTokenResponse>(`${BACKEND_URL}/auth/elyby/refresh`, {
      refreshToken,
      id
    } as IRefreshTokenRequest)
    return response.data
  } catch (error) {
    console.error('ElyBy refresh error:', error)
    return null
  }
}

export async function authDiscord(code: string): Promise<IAuthResponse | null> {
  try {
    const response = await axios.post<IAuthResponse>(`${BACKEND_URL}/auth/discord`, {
      code
    } as IAuthRequest)
    return response.data
  } catch (error) {
    console.error('Discord auth error:', error)
    return null
  }
}

export async function refreshDiscordToken(
  refreshToken: string,
  id: string
): Promise<IRefreshTokenResponse | null> {
  try {
    const response = await axios.post<IRefreshTokenResponse>(
      `${BACKEND_URL}/auth/discord/refresh`,
      {
        refreshToken,
        id
      } as IRefreshTokenRequest
    )
    return response.data
  } catch (error) {
    console.error('Discord refresh error:', error)
    return null
  }
}
