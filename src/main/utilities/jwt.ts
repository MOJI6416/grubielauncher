import { IAuth } from '@/types/Account'
import { IRefreshTokenResponse } from '@/types/Auth'
import { jwtDecode } from 'jwt-decode'
import {
  refreshDiscordToken,
  refreshElyByToken,
  refreshMicrosoftToken
} from '../services/Auth'
import { mutateAccountsConfig, readAccountsConfig } from './accounts'

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

export function getTokenSubject(token?: string) {
  if (!token) return null

  try {
    return jwtDecode<IAuth>(token).sub || null
  } catch {
    return null
  }
}

type TokenCheckResult = { token: string; isValid: boolean } | null

// Providers rotate the refresh token, so two parallel refreshes of the same
// account make the loser persist an already-revoked credential and log the user
// out. Everything funnels through one in-flight promise per account.
const inflightRefreshes = new Map<string, Promise<TokenCheckResult>>()

export async function checkToken(token: string): Promise<TokenCheckResult> {
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
  const auth = (decoded as any)?.auth

  if (!sub || !auth) {
    return null
  }

  const existing = inflightRefreshes.get(sub)
  if (existing) return existing

  const refreshPromise = refreshForSubject(sub, token).finally(() => {
    inflightRefreshes.delete(sub)
  })

  inflightRefreshes.set(sub, refreshPromise)

  return refreshPromise
}

async function refreshForSubject(
  sub: string,
  token: string
): Promise<TokenCheckResult> {
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
      }
    }

    const refreshToken = account?.refreshToken

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

    if (!refreshResult?.accessToken) return null
    const newToken = refreshResult.accessToken
    const nextRefreshToken = refreshResult.refreshToken

    await mutateAccountsConfig((config) => {
      let didUpdate = false

      const nextAccounts = config.accounts.map((entry) => {
        if (getTokenSubject(entry.accessToken) !== sub) return entry

        didUpdate = true
        return {
          ...entry,
          accessToken: newToken,
          refreshToken: nextRefreshToken
        }
      })

      if (!didUpdate) return null

      return { ...config, accounts: nextAccounts }
    })

    return {
      token: newToken,
      isValid: true
    }
  } catch {
    return null
  }
}
