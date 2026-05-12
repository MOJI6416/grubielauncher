import { IAuth } from '@/types/Account'
import { IRefreshTokenResponse } from '@/types/Auth'
import { jwtDecode } from 'jwt-decode'
import {
  refreshDiscordToken,
  refreshElyByToken,
  refreshMicrosoftToken
} from '../services/Auth'
import { readAccountsConfig } from './accounts'

function isTokenExpired(token: string) {
  try {
    const decoded = jwtDecode<IAuth>(token)
    const currentTime = Date.now() / 1000

    const exp = (decoded as any)?.exp
    const isExpired = typeof exp === 'number' ? exp < currentTime : true

    return {
      decoded,
      isExpired
    }
  } catch {
    return {
      decoded: null,
      isExpired: true
    }
  }
}

function getTokenSubject(token?: string) {
  if (!token) return null

  try {
    return jwtDecode<IAuth>(token).sub || null
  } catch {
    return null
  }
}

export async function checkToken(token: string) {
  if (!token || typeof token !== 'string' || token.trim() === '') {
    return null
  }

  const { decoded, isExpired } = isTokenExpired(token)

  if (!isExpired) {
    return {
      token,
      isValid: true
    }
  }

  if (!decoded) {
    return null
  }

  const sub = (decoded as any)?.sub
  let auth = (decoded as any)?.auth

  if (!sub || !auth) {
    return null
  }

  try {
    const accounts = await readAccountsConfig()
    let account = accounts?.accounts.find((entry) => entry.accessToken === token)

    if (!account) {
      account = accounts?.accounts.find(
        (entry) => getTokenSubject(entry.accessToken) === sub
      )

      if (account?.accessToken && account.accessToken !== token) {
        const current = isTokenExpired(account.accessToken)
        if (!current.isExpired) {
          return {
            token: account.accessToken,
            isValid: true
          }
        }

        auth = current.decoded?.auth || auth
      }
    }

    const refreshToken = auth?.refreshToken

    if (!account || typeof refreshToken !== 'string' || refreshToken.trim() === '') {
      return null
    }

    let refreshResult: IRefreshTokenResponse | null = null

    if (account.type === 'microsoft') {
      refreshResult = await refreshMicrosoftToken(refreshToken, sub)
    } else if (account.type === 'elyby') {
      refreshResult = await refreshElyByToken(refreshToken, sub)
    } else if (account.type === 'discord') {
      refreshResult = await refreshDiscordToken(refreshToken, sub)
    } else {
      return null
    }

    const newToken = refreshResult?.accessToken
    if (!newToken) return null

    return {
      token: newToken,
      isValid: true
    }
  } catch {
    return null
  }
}
