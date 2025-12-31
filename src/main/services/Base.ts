import { IAccountConf } from '@/types/Account'
import axios from 'axios'
import { checkToken } from '../utilities/jwt'
import { ipcRenderer } from 'electron'
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

  private init() {
    this.api.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`
      }
      return config
    })

    this.api.interceptors.response.use(
      (res) => res,
      async (err) => {
        if (err.response?.status === 401 && !err.config._retry) {
          if (!this.accessToken) {
            return Promise.reject(err)
          }

          err.config._retry = true

          const tokenData = await checkToken(this.accessToken)

          if (!tokenData || !tokenData.isValid) {
            return Promise.reject(err)
          }

          this.accessToken = tokenData.token
          await this.saveToken(this.accessToken!, err.config.headers.Authorization.split(' ')[1])
          err.config.headers.Authorization = `Bearer ${this.accessToken}`
          return this.api(err.config)
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
    const appData = await ipcRenderer.invoke('getPath', 'appData')
    const accountsPath = path.join(appData, '.grubielauncher', 'accounts.json')

    const accounts: IAccountConf = await fs.readJSON(accountsPath, 'utf-8')

    const account = accounts.accounts.find((acc) => acc.accessToken === oldToken)
    if (!account) return

    account.accessToken = token

    await fs.writeJSON(accountsPath, accounts, { spaces: 2 })
  }
}
