import { IAccountConf } from '@/types/Account'
import axios from 'axios'
import { checkToken } from '../utilities/jwt'
import { app, ipcRenderer } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { BACKEND_URL } from '@/shared/config'

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
      const appData =
        app && typeof app.getPath === 'function'
          ? app.getPath('appData')
          : ipcRenderer && typeof ipcRenderer.invoke === 'function'
            ? await ipcRenderer.invoke('getPath', 'appData')
            : null

      if (!appData) return

      const accountsPath = path.join(appData, '.grubielauncher', 'accounts.json')

      const accounts: IAccountConf = await fs.readJSON(accountsPath, 'utf-8')

      const account = accounts.accounts.find((acc) => acc.accessToken === oldToken)
      if (!account) return

      account.accessToken = token

      await fs.writeJSON(accountsPath, accounts, { spaces: 2 })
    } catch {
      return
    }
  }
}
