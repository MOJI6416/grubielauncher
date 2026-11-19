import axios from 'axios'
import { randomUUID } from 'crypto'
import { LITTLESKIN_OAUTH_URL, LITTLESKIN_YGGDRASIL_URL } from '@/shared/config'
import type { ILittleSkinProfile, ILittleSkinSession } from '@/types/Auth'
import { logAxiosError } from '../utilities/axiosLog'

export const LITTLESKIN_INVALID_CREDENTIALS = 'littleskin_invalid_credentials'
export const LITTLESKIN_NO_PROFILES = 'littleskin_no_profiles'
export const LITTLESKIN_OAUTH_DENIED = 'littleskin_oauth_denied'
export const LITTLESKIN_OAUTH_EXPIRED = 'littleskin_oauth_expired'
export const LITTLESKIN_OAUTH_CANCELLED = 'littleskin_oauth_cancelled'
export const LITTLESKIN_OAUTH_UNAVAILABLE = 'littleskin_oauth_unavailable'

const CLIENT_REFUSED = new Set(['invalid_client', 'unauthorized_client', 'invalid_scope'])

export const LITTLESKIN_OAUTH_SCOPE =
  'openid Yggdrasil.PlayerProfiles.Select Yggdrasil.MinecraftToken.Create'

const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
const REQUEST_TIMEOUT_MS = 20000
const DEFAULT_POLL_INTERVAL_S = 5
const SLOW_DOWN_STEP_MS = 5000

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

export interface LittleSkinDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  expiresIn: number
  interval: number
}

export interface LittleSkinOAuthTokens {
  accessToken: string
  idToken: string
}

function toProfile(value: unknown): ILittleSkinProfile | null {
  if (!value || typeof value !== 'object') return null
  const { id, name } = value as { id?: unknown; name?: unknown }
  if (typeof id !== 'string' || !/^[0-9a-fA-F-]{32,36}$/.test(id)) return null
  if (typeof name !== 'string' || !name) return null
  return { id, name }
}

function toAuthentication(
  data: AuthenticateResponse | undefined,
  fallbackClientToken?: string
): LittleSkinAuthentication {
  if (typeof data?.accessToken !== 'string' || !data.accessToken) {
    throw new Error('LittleSkin returned no access token')
  }

  const clientToken =
    typeof data.clientToken === 'string' && data.clientToken
      ? data.clientToken
      : fallbackClientToken
  if (!clientToken) throw new Error('LittleSkin returned no client token')

  const profiles = Array.isArray(data.availableProfiles)
    ? data.availableProfiles
        .map(toProfile)
        .filter((profile): profile is ILittleSkinProfile => profile !== null)
    : []

  return {
    session: { accessToken: data.accessToken, clientToken },
    selectedProfile: toProfile(data.selectedProfile),
    profiles
  }
}

function safeError(prefix: string, label: string, error: unknown): Error {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const code = axios.isAxiosError(error) ? error.code : undefined
  const safe = new Error(
    status
      ? `${prefix}: Request failed with status code ${status}`
      : `${prefix}: ${code || (error instanceof Error ? error.message : 'unknown error')}`
  )
  logAxiosError(label, safe, 'service:auth')
  return safe
}

function oauthErrorCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const value = (error.response?.data as { error?: unknown } | undefined)?.error
  return typeof value === 'string' ? value : undefined
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

    return toAuthentication(response.data, clientToken)
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 403 &&
      (error.response.data as { error?: unknown } | undefined)?.error ===
        'ForbiddenOperationException'
    ) {
      throw new Error(LITTLESKIN_INVALID_CREDENTIALS)
    }

    throw safeError('LittleSkin sign-in failed', 'LittleSkin sign-in error', error)
  }
}

export async function requestLittleSkinDeviceCode(
  clientId: string
): Promise<LittleSkinDeviceAuthorization> {
  try {
    const response = await axios.post(
      `${LITTLESKIN_OAUTH_URL}/oauth/device_code`,
      new URLSearchParams({ client_id: clientId, scope: LITTLESKIN_OAUTH_SCOPE }),
      { timeout: REQUEST_TIMEOUT_MS }
    )

    const data = response.data as Record<string, unknown> | undefined
    const deviceCode = data?.device_code
    const userCode = data?.user_code
    const verificationUri = data?.verification_uri
    if (
      typeof deviceCode !== 'string' ||
      !deviceCode ||
      typeof userCode !== 'string' ||
      !userCode ||
      typeof verificationUri !== 'string' ||
      !verificationUri.startsWith('https://')
    ) {
      throw new Error('LittleSkin returned no device code')
    }

    const complete = data?.verification_uri_complete
    const expiresIn = Number(data?.expires_in)
    const interval = Number(data?.interval)

    return {
      deviceCode,
      userCode,
      verificationUri,
      ...(typeof complete === 'string' && complete.startsWith('https://')
        ? { verificationUriComplete: complete }
        : {}),
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300,
      interval: Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_POLL_INTERVAL_S
    }
  } catch (error) {
    const code = oauthErrorCode(error)
    const safe = safeError(
      code ? `LittleSkin device sign-in failed (${code})` : 'LittleSkin device sign-in failed',
      'LittleSkin device sign-in error',
      error
    )
    throw code && CLIENT_REFUSED.has(code) ? new Error(LITTLESKIN_OAUTH_UNAVAILABLE) : safe
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(LITTLESKIN_OAUTH_CANCELLED))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error(LITTLESKIN_OAUTH_CANCELLED))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function waitForLittleSkinAuthorization(
  clientId: string,
  device: LittleSkinDeviceAuthorization,
  signal?: AbortSignal,
  wait: (ms: number, signal?: AbortSignal) => Promise<void> = sleep
): Promise<LittleSkinOAuthTokens> {
  const deadline = Date.now() + device.expiresIn * 1000
  let interval = device.interval * 1000

  while (true) {
    await wait(interval, signal)
    if (Date.now() >= deadline) throw new Error(LITTLESKIN_OAUTH_EXPIRED)

    try {
      const response = await axios.post(
        `${LITTLESKIN_OAUTH_URL}/oauth/token`,
        new URLSearchParams({
          grant_type: DEVICE_CODE_GRANT,
          client_id: clientId,
          device_code: device.deviceCode
        }),
        { timeout: REQUEST_TIMEOUT_MS, signal }
      )

      const data = response.data as Record<string, unknown> | undefined
      if (typeof data?.access_token !== 'string' || !data.access_token) {
        throw new Error('LittleSkin returned no OAuth access token')
      }
      return {
        accessToken: data.access_token,
        idToken: typeof data.id_token === 'string' ? data.id_token : ''
      }
    } catch (error) {
      if (signal?.aborted) throw new Error(LITTLESKIN_OAUTH_CANCELLED)

      const code = oauthErrorCode(error)
      if (code === 'authorization_pending') continue
      if (code === 'slow_down') {
        interval += SLOW_DOWN_STEP_MS
        continue
      }
      if (code === 'access_denied') throw new Error(LITTLESKIN_OAUTH_DENIED)
      if (code === 'expired_token') throw new Error(LITTLESKIN_OAUTH_EXPIRED)
      if (code && CLIENT_REFUSED.has(code)) throw new Error(LITTLESKIN_OAUTH_UNAVAILABLE)
      if (error instanceof Error && !axios.isAxiosError(error)) throw error

      throw safeError(
        code ? `LittleSkin device sign-in failed (${code})` : 'LittleSkin device sign-in failed',
        'LittleSkin device sign-in error',
        error
      )
    }
  }
}

export function littleSkinProfileFromIdToken(idToken: string): ILittleSkinProfile | null {
  const payload = idToken.split('.')[1]
  if (!payload) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      selectedProfile?: unknown
    }
    return toProfile(claims.selectedProfile)
  } catch {
    return null
  }
}

export async function exchangeLittleSkinOAuthToken(
  accessToken: string,
  profile: ILittleSkinProfile
): Promise<LittleSkinAuthentication> {
  try {
    const response = await axios.post<AuthenticateResponse>(
      `${LITTLESKIN_YGGDRASIL_URL}/authserver/oauth`,
      { uuid: profile.id.replace(/-/g, '') },
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    return toAuthentication(response.data)
  } catch (error) {
    throw safeError('LittleSkin game token failed', 'LittleSkin game token error', error)
  }
}
