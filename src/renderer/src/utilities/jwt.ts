import { IAuth } from '@/types/Account'
import { Backend } from '@renderer/services/Backend'
import { jwtDecode } from 'jwt-decode'

function isTokenExpired(token: string) {
  const decoded = jwtDecode<IAuth>(token)
  const currentTime = Date.now() / 1000

  return {
    decoded,
    isExpired: decoded.exp < currentTime
  }
}

export async function checkToken(token: string) {
  const { decoded, isExpired } = isTokenExpired(token)

  if (token && !isExpired) {
    return {
      token,
      isValid: true
    }
  } else {
    const backend = new Backend(token)
    const newToken = await backend.login(decoded.sub, decoded.auth)
    if (!newToken) return null

    return {
      token: newToken,
      isValid: true
    }
  }
}
