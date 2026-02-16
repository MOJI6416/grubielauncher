import { IAuth } from '@/types/Account'
import { jwtDecode } from 'jwt-decode'
import { Backend } from '../services/Backend'

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
  const auth = (decoded as any)?.auth

  if (!sub || !auth) {
    return null
  }

  try {
    const backend = new Backend(token)
    const newToken = await backend.login(sub, auth)
    if (!newToken) return null

    return {
      token: newToken,
      isValid: true
    }
  } catch {
    return null
  }
}
