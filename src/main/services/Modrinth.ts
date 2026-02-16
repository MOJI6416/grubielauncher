import { Loader } from '@/types/Loader'
import {
  IProject,
  IResult,
  ProjectType,
  IVersion,
  ICategoryTag,
  ILoaderTag,
  SortValue,
  IProjectDependencies,
  VersionDependency
} from '@/types/Modrinth'
import { ServerCore } from '@/types/Server'
import axios from 'axios'

const URL = 'https://api.modrinth.com/v2'

export class Modrinth {
  private static api = axios.create({
    baseURL: URL,
    timeout: 30000
  })

  static async search(
    query: string,
    options: {
      version?: string
      loader?: Loader | ServerCore
      projectType: ProjectType
      category?: string[]
      sort?: SortValue
    },
    pagination: {
      offset: number
      limit: number
    }
  ) {
    try {
      const { version, loader, projectType, category, sort } = options
      const params = new URLSearchParams()

      params.append('query', query)

      if (sort) params.append('index', sort.toString())

      const facets: string[][] = []

      facets.push([`project_type:${projectType}`])

      if (version) facets.push([`versions:${version}`])

      if (
        loader &&
        projectType !== ProjectType.RESOURCEPACK &&
        projectType !== ProjectType.SHADER &&
        projectType !== ProjectType.DATAPACK
      ) {
        facets.push([`categories:${loader}`])
      }

      if (category && category.length > 0) {
        facets.push(...category.map((c) => [`categories:${c.replace(/\+/g, '')}`]))
      }

      params.append('facets', JSON.stringify(facets))
      params.append('limit', pagination.limit.toString())
      params.append('offset', pagination.offset.toString())

      const response = await this.api.get<IResult>('/search', {
        params
      })

      return response.data
    } catch {
      return null
    }
  }

  static async get(id: string) {
    try {
      const response = await this.api.get<IProject>(`/project/${id}`)
      return response.data
    } catch {
      return null
    }
  }

  static async getVersion(id: string) {
    try {
      const response = await this.api.get<IVersion>(`/version/${id}`)
      return response.data
    } catch {
      return null
    }
  }

  static async versions(
    project_id: string,
    options: { version?: string; loader?: Loader; project_type: ProjectType }
  ) {
    try {
      const { version, loader, project_type } = options

      const params = new URLSearchParams()

      if (version) params.append('game_versions', JSON.stringify([version]))

      if (
        loader &&
        project_type !== ProjectType.RESOURCEPACK &&
        project_type !== ProjectType.SHADER
      )
        params.append('loaders', JSON.stringify([loader]))

      const response = await this.api.get<IVersion[]>(`/project/${project_id}/version`, {
        params
      })

      return response.data
    } catch {
      return null
    }
  }

  static async getFilter(projectType: ProjectType) {
    try {
      const response = await this.api.get<ICategoryTag[]>(`/tag/category`)
      return response.data.filter((c) => c.project_type == projectType)
    } catch {
      return null
    }
  }

  static async tags() {
    try {
      const categories = await this.api.get<ICategoryTag[]>(`/tag/category`)
      const loaders = await this.api.get<ILoaderTag[]>(`/tag/loader`)

      return {
        tags: [...categories.data, ...loaders.data],
        categories: categories.data
      }
    } catch {
      return null
    }
  }

  static async getDependencies(project_id: string, deps: VersionDependency[]) {
    try {
      const response = await this.api.get<IProjectDependencies>(`/project/${project_id}/dependencies`)

      const dependencies: IProject[] = []
      for (let index = 0; index < deps.length; index++) {
        const dependency = deps[index]

        const project = response.data.projects.find((p) => p.id == dependency.project_id)

        if (!project) continue

        dependencies.push(project)
      }

      return dependencies
    } catch {
      return []
    }
  }

  static async getProjects(ids: string[]) {
    try {
      const params = new URLSearchParams()
      params.append('ids', JSON.stringify(ids))

      const response = await this.api.get<IProject[]>(`/projects`, {
        params
      })

      return response.data
    } catch {
      return []
    }
  }
}
