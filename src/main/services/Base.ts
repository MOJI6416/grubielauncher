import axios from 'axios'
import { checkToken, getTokenSubject } from '../utilities/jwt'
import { BACKEND_CANDIDATES } from '@/shared/config'
import { mutateAccountsConfig } from '../utilities/accounts'
import { attachApiHostFallback, getApiBaseUrl } from '../utilities/apiHost'

const inflightRefreshes = new Map<string, Promise<string | null>>()

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

async function persistRefreshedToken(token: string, oldToken: string) {
  try {
    await mutateAccountsConfig((accounts) => {
      const oldSubject = getTokenSubject(oldToken)
      const newSubject = getTokenSubject(token)
      let didUpdate = false
      const nextAccounts = accounts.accounts.map((account) => {
        const accountSubject = getTokenSubject(account.accessToken)
        const isSameToken = account.accessToken === oldToken
        const isSameSubject =
          !!oldSubject &&
          !!newSubject &&
          oldSubject === newSubject &&
          accountSubject === oldSubject

        if (!isSameToken && !isSameSubject) return account

        didUpdate = true
        return {
          ...account,
          accessToken: token
        }
      })

      if (!didUpdate) return null

      return {
        ...accounts,
        accounts: nextAccounts
      }
    })
  } catch {
    return
  }
}

function refreshAccessToken(oldToken: string): Promise<string | null> {
  const existing = inflightRefreshes.get(oldToken)
  if (existing) return existing

  const promise = (async () => {
    const tokenData = await checkToken(oldToken)
    if (!tokenData || !tokenData.isValid) return null

    const newToken = tokenData.token || null
    if (newToken && newToken !== oldToken) {
      await persistRefreshedToken(newToken, oldToken)
    }

    return newToken
  })().finally(() => {
    inflightRefreshes.delete(oldToken)
  })

  inflightRefreshes.set(oldToken, promise)
  return promise
}

export class BaseService {
  public get baseUrl(): string {
    return getApiBaseUrl()
  }

  public api = axios.create({
    timeout: 30000
  })

  protected accessToken: string | undefined

  private authorizedOrigins = new Set<string>(
    BACKEND_CANDIDATES.map((url) => toOrigin(url) ?? url)
  )

  private isInitialized = false

  protected allowAuthorizedOrigin(url: string) {
    const origin = toOrigin(url)
    if (origin) this.authorizedOrigins.add(origin)
  }

  private isAuthorizedTarget(config: { url?: string; baseURL?: string }): boolean {
    try {
      const resolved = new URL(String(config.url ?? ''), config.baseURL || this.baseUrl)
      return this.authorizedOrigins.has(resolved.origin)
    } catch {
      return false
    }
  }

  private init() {
    if (this.isInitialized) return

    this.isInitialized = true

    attachApiHostFallback(this.api)

    this.api.interceptors.request.use((config) => {
      config.headers = config.headers ?? {}

      if (!this.isAuthorizedTarget(config)) {
        delete (config.headers as any).Authorization
        return config
      }

      if (this.accessToken) {
        ; (config.headers as any).Authorization = `Bearer ${this.accessToken}`
      }
      return config
    })

    this.api.interceptors.response.use(
      (res) => res,
      async (err) => {
        const config = err?.config as any

        if (!config) {
          return Promise.reject(err)
        }

        const url: string = String(config.url || '')
        if (url.includes('/auth/login')) {
          return Promise.reject(err)
        }

        if (err.response?.status === 401 && !config._retry) {
          if (!this.accessToken || !this.isAuthorizedTarget(config)) {
            return Promise.reject(err)
          }

          config._retry = true

          const oldToken = this.accessToken
          const newToken = await refreshAccessToken(oldToken)
          if (!newToken) {
            return Promise.reject(err)
          }

          this.accessToken = newToken

          config.headers = config.headers ?? {}
          config.headers.Authorization = `Bearer ${newToken}`

          return this.api(config)
        }

        return Promise.reject(err)
      }
    )
  }

  constructor(accessToken?: string) {
    this.accessToken = accessToken
    this.init()
  }

  public setAccessToken(accessToken?: string) {
    this.accessToken = accessToken
    this.init()
  }
}
