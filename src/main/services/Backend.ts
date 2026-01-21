import { IBackendServer, IModpack, IModpackUpdate, IServerStatus } from '@/types/Backend'
import { ICreateUser, IUpdateUser, IUser } from '@/types/IUser'
import { BaseService } from './Base'
import { ICreateServer, IServer } from '@/types/Browser'
import { INews } from '@/types/News'
import { IGrubieSkin } from '@/types/SkinManager'
import FormData from 'form-data'
import fs from 'fs-extra'
import path from 'path'
import { IAuthlib } from '@/types/IAuthlib'

export class Backend extends BaseService {
  constructor(accessToken?: string) {
    super(accessToken)
  }

  async shareModpack(modpack: { conf: IModpack['conf'] }) {
    try {
      if (modpack.conf.loader.mods.length > 0) {
        modpack.conf.loader.mods = modpack.conf.loader.mods.filter(
          (mod) => mod.id !== 'sponge-core' && mod.projectType !== 'plugin'
        )
      }

      const response = await this.api.post<{ shareCode: string }>(
        `${this.baseUrl}/modpacks`,
        modpack
      )

      return response.data.shareCode
    } catch (error) {
      throw error
    }
  }

  async updateModpack(shareCode: string, update: IModpackUpdate) {
    try {
      if (update.mods && update.mods.length > 0) {
        update.mods = update.mods.filter(
          (mod) => mod.id !== 'sponge-core' && mod.projectType !== 'plugin'
        )
      }

      await this.api.patch(`${this.baseUrl}/modpacks/${shareCode}`, {
        ...update
      })

      return true
    } catch (error) {
      throw error
    }
  }

  async getModpack(shareCode: string): Promise<{
    status: 'success' | 'not_found' | 'error'
    data: IModpack | null
  }> {
    try {
      const response = await this.api.get<IModpack>(`${this.baseUrl}/modpacks/${shareCode}`)

      return {
        status: 'success',
        data: response.data
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return { status: 'not_found', data: null }
      } else {
        return { status: 'error', data: null }
      }
    }
  }

  async deleteModpack(shareCode: string) {
    try {
      await this.api.delete(`modpacks/${shareCode}`)
    } catch {}
  }

  async createUser(user: ICreateUser) {
    try {
      const response = await this.api.post<IUser>(`${this.baseUrl}/users`, {
        ...user
      })

      return response.data
    } catch {
      return null
    }
  }

  async updateUser(id: string, user: IUpdateUser) {
    try {
      const response = await this.api.patch<IUser>(`${this.baseUrl}/users/${id}`, user)

      return response.data
    } catch (error) {
      return null
    }
  }

  async getUser(id: string) {
    try {
      const response = await this.api.get<IUser>(`${this.baseUrl}/users/` + id)

      return response.data
    } catch {
      return null
    }
  }

  async uploadFileFromPath(
    filePath: string,
    fileName?: string,
    folder?: string
  ): Promise<string | null> {
    try {
      const formData = new FormData()

      const stream = fs.createReadStream(filePath)

      formData.append('file', stream, {
        filename: fileName ?? path.basename(filePath),
        contentType: 'application/octet-stream'
      })

      if (folder) formData.append('folder', folder)

      const response = await this.api.post<string>(`${this.baseUrl}/files/upload`, formData, {
        headers: formData.getHeaders()
      })

      return response.data
    } catch (err) {
      console.error('Upload error:', err)
      return null
    }
  }

  async deleteFile(key: string, isDirectory = false) {
    try {
      await this.api.delete(`${this.baseUrl}/files`, {
        data: { key, isDirectory }
      })
    } catch {}
  }

  async modpackSearch({
    offset,
    limit,
    search,
    sort,
    filter
  }: {
    offset: number
    limit: number
    search: string
    sort: string
    filter: string[]
  }) {
    try {
      const response = await this.api.get<IModpack[]>(
        `${this.baseUrl}/modpacks/search?offset=${offset}&limit=${limit}&search=${search}&sort=${sort}&filter=${filter.join(',')}`
      )

      return response.data
    } catch {
      return []
    }
  }

  async modpackDownloaded(shareCode: string) {
    try {
      await this.api.patch(`${this.baseUrl}/modpacks/${shareCode}/downloaded`)
    } catch {}
  }

  async allModpacksByUser(owner: string) {
    try {
      const response = await this.api.get<IModpack[]>(`${this.baseUrl}/modpacks/owner/${owner}`)

      return response.data
    } catch {
      return []
    }
  }

  async getNews() {
    try {
      const response = await this.api.get<INews[]>(`${this.baseUrl}/news.json`)
      return response.data
    } catch {
      return []
    }
  }

  async login(
    id: string,
    auth: {
      accessToken: string
      refreshToken: string
      expiresAt: number
    }
  ) {
    try {
      const response = await this.api.post<{ access_token: string }>(`${this.baseUrl}/auth/login`, {
        id,
        auth
      })

      return response.data.access_token
    } catch {
      return null
    }
  }

  async getServer(serverId: string) {
    try {
      const response = await this.api.get<IBackendServer>(`${this.baseUrl}/servers/${serverId}`)
      return response.data
    } catch {
      return null
    }
  }

  async updateServer(serverId: string, server: ICreateServer) {
    try {
      await this.api.patch(`${this.baseUrl}/servers/${serverId}`, server)
    } catch (error) {
      throw error
    }
  }

  async deleteServer(serverId: string) {
    try {
      await this.api.delete(`servers/${serverId}`)
    } catch (error) {
      throw error
    }
  }

  async createServer(server: ICreateServer) {
    try {
      const response = await this.api.post<{ id: string }>(`${this.baseUrl}/servers`, server)
      return response.data
    } catch (error) {
      throw error
    }
  }

  async searchServers({
    offset,
    limit,
    search,
    filter
  }: {
    offset: number
    limit: number
    search: string
    filter: string[]
  }) {
    try {
      const response = await this.api.get<IServer[]>(
        `${this.baseUrl}/servers/search?offset=${offset}&limit=${limit}&search=${search}&filter=${filter.join(',')}`
      )

      return response.data
    } catch {
      return []
    }
  }

  async getStatus(address: string) {
    try {
      const response = await this.api.get<IServerStatus>(
        `${this.baseUrl}/servers/status/${address}`
      )
      return response.data
    } catch {
      return null
    }
  }

  async ownerServers(owner: string) {
    try {
      const response = await this.api.get<IServer[]>(`${this.baseUrl}/servers/owner/${owner}`)
      return response.data
    } catch {
      return []
    }
  }

  async getSkin(uuid: string) {
    try {
      const response = await this.api.get<IGrubieSkin>(`${this.baseUrl}/skins/${uuid}`)
      return response.data
    } catch {
      return null
    }
  }

  async discordAuthenticated(userId: string) {
    try {
      const response = await this.api.put<boolean>(`${this.baseUrl}/discord/authenticated`, {
        userId
      })
      return response.data
    } catch {
      return false
    }
  }

  async aiComplete(prompt: string) {
    try {
      const response = await this.api.post<{ completion: string }>(
        `${this.baseUrl}/ai/complete`,
        {
          prompt
        },
        {
          timeout: (this.api.defaults.timeout || 30000) * 2
        }
      )
      return response.data.completion
    } catch {
      return null
    }
  }

  async getAuthlib() {
    try {
      const response = await this.api.get<IAuthlib>(`${this.baseUrl}/libs/authlib`)
      return response.data
    } catch {
      return null
    }
  }
}
