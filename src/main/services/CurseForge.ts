import { BACKEND_URL } from '@/shared/config'
import {
  ICategory,
  IFile,
  IMod,
  ISearchModsResponse,
  ModLoaderType,
  ModTypeClassIds,
  ModsSearchSortField
} from '@/types/CurseForge'
import axios from 'axios'

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
  ): Promise<ISearchModsResponse | null> {
    try {
      const { version, loader, modType, category, sortField } = options
      const params = new URLSearchParams()

      params.append('query', query)
      params.append('modType', modType.toString())
      params.append('offset', pagination.offset.toString())
      params.append('limit', pagination.limit.toString())

      if (version) params.append('version', version)
      if (loader !== undefined) params.append('loader', loader.toString())
      if (sortField !== undefined) params.append('sortField', sortField.toString())

      category.forEach((cat) => params.append('category', cat))

      const response = await axios.get<ISearchModsResponse>(`${BACKEND_URL}/curseforge/search`, {
        params
      })

      return response.data
    } catch (error) {
      console.error('Error searching mods:', error)
      return null
    }
  }

  static async get(modId: number): Promise<IMod | null> {
    try {
      const response = await axios.get<IMod>(`${BACKEND_URL}/curseforge/mods/${modId}`)
      return response.data
    } catch (error) {
      console.error('Error getting mod:', error)
      return null
    }
  }

  static async getFile(modId: number, fileId: number): Promise<IFile | null> {
    try {
      const response = await axios.get<IFile>(
        `${BACKEND_URL}/curseforge/mods/${modId}/files/${fileId}`
      )
      return response.data
    } catch (error) {
      console.error('Error getting file:', error)
      return null
    }
  }

  static async getModFiles(
    modId: number,
    options: { modType: ModTypeClassIds; version?: string; loader?: ModLoaderType }
  ): Promise<IFile[] | null> {
    try {
      const { modType, version, loader } = options
      const params = new URLSearchParams()

      params.append('modType', modType.toString())
      if (version) params.append('version', version)
      if (loader !== undefined) params.append('loader', loader.toString())

      const response = await axios.get<IFile[]>(`${BACKEND_URL}/curseforge/mods/${modId}/files`, {
        params
      })

      return response.data
    } catch (error) {
      console.error('Error getting mod files:', error)
      return null
    }
  }

  static async getFilter(modType: ModTypeClassIds): Promise<ICategory[] | null> {
    try {
      const response = await axios.get<ICategory[]>(
        `${BACKEND_URL}/curseforge/categories/${modType}`
      )
      return response.data
    } catch (error) {
      console.error('Error getting categories:', error)
      return null
    }
  }

  static async getFiles(fileIds: number[]): Promise<IFile[]> {
    try {
      const response = await axios.post<IFile[]>(`${BACKEND_URL}/curseforge/files`, {
        fileIds
      })
      return response.data
    } catch (error) {
      console.error('Error getting files:', error)
      return []
    }
  }

  static async getMods(modIds: number[]): Promise<IMod[]> {
    try {
      const response = await axios.post<IMod[]>(`${BACKEND_URL}/curseforge/mods`, {
        modIds
      })
      return response.data
    } catch (error) {
      console.error('Error getting mods:', error)
      return []
    }
  }

  static async getModDescription(modId: number): Promise<string | null> {
    try {
      const response = await axios.get<string>(
        `${BACKEND_URL}/curseforge/mods/${modId}/description`
      )
      return response.data
    } catch (error) {
      console.error('Error getting mod description:', error)
      return null
    }
  }
}
