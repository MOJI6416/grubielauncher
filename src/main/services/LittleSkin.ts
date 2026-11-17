import axios from 'axios'
import { randomUUID } from 'crypto'
import { LITTLESKIN_YGGDRASIL_URL } from '@/shared/config'
import type { ILittleSkinProfile, ILittleSkinSession } from '@/types/Auth'
import { logAxiosError } from '../utilities/axiosLog'

export const LITTLESKIN_INVALID_CREDENTIALS = 'littleskin_invalid_credentials'
export const LITTLESKIN_NO_PROFILES = 'littleskin_no_profiles'

const REQUEST_TIMEOUT_MS = 20000

interface AuthenticateResponse {
  accessToken?: unknown
  clientToken?: unknown
  selectedProfile?: unknown
  availableProfiles?: unknown
}

export interface LittleSkinAuthentication {
  session: ILittleSkinSession
  selectedProfile: ILittleSkinProfile | null
  profiles: ILittleSkinProfile[]
}

function toProfile(value: unknown): ILittleSkinProfile | null {
  if (!value || typeof value !== 'object') return null
  const { id, name } = value as { id?: unknown; name?: unknown }
  if (typeof id !== 'string' || !/^[0-9a-fA-F-]{32,36}$/.test(id)) return null
  if (typeof name !== 'string' || !name) return null
  return { id, name }
}

export async function authenticateLittleSkin(
  login: string,
  password: string
): Promise<LittleSkinAuthentication> {
  const clientToken = randomUUID().replace(/-/g, '')

  try {
    const response = await axios.post<AuthenticateResponse>(
      `${LITTLESKIN_YGGDRASIL_URL}/authserver/authenticate`,
      {
        agent: { name: 'Minecraft', version: 1 },
        username: login,
        password,
        clientToken,
        requestUser: false
      },
      { timeout: REQUEST_TIMEOUT_MS }
    )

    const data = response.data
    if (typeof data?.accessToken !== 'string' || !data.accessToken) {
      throw new Error('LittleSkin returned no access token')
    }

    const profiles = Array.isArray(data.availableProfiles)
      ? data.availableProfiles
          .map(toProfile)
          .filter((profile): profile is ILittleSkinProfile => profile !== null)
      : []

    return {
      session: {
        accessToken: data.accessToken,
        clientToken: typeof data.clientToken === 'string' && data.clientToken
          ? data.clientToken
          : clientToken
      },
      selectedProfile: toProfile(data.selectedProfile),
      profiles
    }
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 403 &&
      (error.response.data as { error?: unknown } | undefined)?.error ===
        'ForbiddenOperationException'
    ) {
      throw new Error(LITTLESKIN_INVALID_CREDENTIALS)
    }

    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    const code = axios.isAxiosError(error) ? error.code : undefined
    const safe = new Error(
      status
        ? `LittleSkin sign-in failed: Request failed with status code ${status}`
        : `LittleSkin sign-in failed: ${code || (error instanceof Error ? error.message : 'unknown error')}`
    )
    logAxiosError('LittleSkin sign-in error', safe, 'service:auth')
    throw safe
  }
}
