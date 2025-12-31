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
      if (version) facets.push([`versions:${version}`], [`project_type:${projectType}`])
      else facets.push([`project_type:${projectType}`])

      if (
        loader &&
        projectType !== ProjectType.RESOURCEPACK &&
        projectType !== ProjectType.SHADER &&
        projectType !== ProjectType.DATAPACK
      )
        facets.push([`categories:${loader}`])

      if (category) facets.push(...category.map((c) => [`categories:${c.replace('+', '')}`]))

      params.append('facets', JSON.stringify(facets))
      params.append('limit', pagination.limit.toString())
      params.append('offset', pagination.offset.toString())

      const response = await axios.get<IResult>(`${URL}/search`, {
        params
      })

      return response.data
    } catch {
      return null
    }
  }

  static async get(id: string) {
    try {
      const response = await axios.get<IProject>(`${URL}/project/${id}`)

      return response.data
    } catch {
      return null
    }
  }

  static async getVersion(id: string) {
    try {
      const response = await axios.get<IVersion>(`${URL}/version/${id}`)

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

      const response = await axios.get<IVersion[]>(`${URL}/project/${project_id}/version`, {
        params
      })

      return response.data
    } catch {
      return null
    }
  }

  static async getFilter(projectType: ProjectType) {
    try {
      const response = await axios.get<ICategoryTag[]>(`${URL}/tag/category`)

      return response.data.filter((c) => c.project_type == projectType)
    } catch {
      return null
    }
  }

  static async tags() {
    try {
      const categories = await axios.get<ICategoryTag[]>(`${URL}/tag/category`)
      const loaders = await axios.get<ILoaderTag[]>(`${URL}/tag/loader`)

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
      const response = await axios.get<IProjectDependencies>(
        `${URL}/project/${project_id}/dependencies`
      )

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

      const response = await axios.get<IProject[]>(`${URL}/projects`, {
        params
      })

      return response.data
    } catch {
      return []
    }
  }
}
