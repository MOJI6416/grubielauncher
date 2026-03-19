import axios from 'axios'
import { checkToken } from '../utilities/jwt'
import { BACKEND_URL } from '@/shared/config'
import { readAccountsConfig, saveAccountsConfig } from '../utilities/accounts'

export class BaseService {
  public readonly baseUrl: string = BACKEND_URL
  public api = axios.create({
    baseURL: this.baseUrl,
    timeout: 30000
  })

  protected accessToken: string | undefined

  private isInitialized = false
  private refreshPromise: Promise<string | null> | null = null

  private init() {
    if (this.isInitialized) return

    this.isInitialized = true

    this.api.interceptors.request.use((config) => {
      config.headers = config.headers ?? {}

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
          if (!this.accessToken) {
            return Promise.reject(err)
          }

          config._retry = true

          const oldToken = this.accessToken

          if (!this.refreshPromise) {
            this.refreshPromise = (async () => {
              const tokenData = await checkToken(oldToken)

              if (!tokenData || !tokenData.isValid) {
                return null
              }

              this.accessToken = tokenData.token

              if (this.accessToken && this.accessToken !== oldToken) {
                await this.saveToken(this.accessToken, oldToken)
              }

              return this.accessToken || null
            })().finally(() => {
              this.refreshPromise = null
            })
          }

          const newToken = await this.refreshPromise
          if (!newToken) {
            return Promise.reject(err)
          }

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

  private async saveToken(token: string, oldToken: string) {
    try {
      const accounts = await readAccountsConfig()
      if (!accounts) return

      let didUpdate = false
      const nextAccounts = accounts.accounts.map((account) => {
        if (account.accessToken !== oldToken) return account
        didUpdate = true
        return {
          ...account,
          accessToken: token
        }
      })

      if (!didUpdate) return

      await saveAccountsConfig({
        ...accounts,
        accounts: nextAccounts
      })
    } catch {
      return
    }
  }
}
