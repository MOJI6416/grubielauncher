import {
  GetModsByIdsListRequestBody,
  ICategory,
  IFile,
  IGetModFilesResponse,
  IMod,
  ISearchModsResponse,
  ModLoaderType,
  ModTypeClassIds,
  ModsSearchSortField
} from '@/types/CurseForge'
import axios from 'axios'

const env = window.api.env
const URL = 'https://api.curseforge.com/v1'

export class CurseForge {
  static async search(
    query: string,
    options: {
      version?: string
      loader?: ModLoaderType
      modType: ModTypeClassIds
      category: string[]
      sortField?: ModsSearchSortField
    },
    pagination: {
      offset: number
      limit: number
    }
  ) {
    try {
      const { version, loader, modType, category, sortField } = options
      const params = new URLSearchParams()

      params.append('gameId', '432')
      params.append('classId', modType.toString())
      params.append('pageSize', pagination.limit.toString())
      params.append('index', pagination.offset.toString())
      if (version) params.append('gameVersion', version)
      params.append('searchFilter', query)

      if (loader && (modType == ModTypeClassIds.mod || modType == ModTypeClassIds.modpack)) {
        params.append('modLoaderType', loader.toString())
      }

      params.append('sortOrder', 'desc')

      if (category.length > 0) {
        if (category.length > 1) params.append('categoryIds', JSON.stringify(category))
        else params.append('categoryId', category[0])
      }

      if (sortField) params.append('sortField', ModsSearchSortField[sortField])

      console.log(env.CURSEFORGE_API_KEY, 'CURSEFORGE_API_KEY')

      const response = await axios.get<ISearchModsResponse>(`${URL}/mods/search`, {
        params,
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data
    } catch {
      return null
    }
  }

  static async get(modId: number) {
    try {
      const response = await axios.get<{ data: IMod }>(`${URL}/mods/${modId}`, {
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data.data
    } catch {
      return null
    }
  }

  static async getFile(modId: number, fileId: number) {
    try {
      const response = await axios.get<{ data: IFile }>(`${URL}/v1/mods/${modId}/files/${fileId}`, {
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data.data
    } catch {
      return null
    }
  }

  static async getModFiles(
    modId: number,
    options: { modType: ModTypeClassIds; version?: string; loader?: ModLoaderType }
  ) {
    try {
      const { modType, version, loader } = options

      const params = new URLSearchParams()

      params.append('modId', String(modId))
      if (version) params.append('gameVersion', version)

      if (loader && (modType == ModTypeClassIds.mod || modType == ModTypeClassIds.modpack))
        params.append('modLoaderType', loader.toString())

      const response = await axios.get<IGetModFilesResponse>(`${URL}/mods/${modId}/files`, {
        params,
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data.data
    } catch {
      return null
    }
  }

  static async getFilter(modType: ModTypeClassIds) {
    try {
      const params = new URLSearchParams()

      params.append('classId', modType.toString())

      const response = await axios.get<{ data: ICategory[] }>(`${URL}/categories?gameId=432`, {
        params,
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data.data.filter((f) => f.parentCategoryId == modType)
    } catch {
      return null
    }
  }

  static async getFiles(fileIds: number[]) {
    try {
      const response = await axios.post<{ data: IFile[] }>(
        `${URL}/mods/files`,
        {
          fileIds
        },
        {
          headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
        }
      )

      return response.data.data
    } catch {
      return []
    }
  }

  static async getMods(modIds: number[]) {
    try {
      const body: GetModsByIdsListRequestBody = {
        modIds,
        filterPcOnly: null
      }

      const response = await axios.post<{ data: IMod[] }>(
        `${URL}/mods`,
        { ...body },
        {
          headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
        }
      )

      return response.data.data
    } catch {
      return []
    }
  }

  static async getModDescription(modId: number) {
    try {
      const response = await axios.get<{ data: string }>(`${URL}/mods/${modId}/description`, {
        headers: { 'x-api-key': env.CURSEFORGE_API_KEY }
      })

      return response.data.data
    } catch {
      return null
    }
  }
}
