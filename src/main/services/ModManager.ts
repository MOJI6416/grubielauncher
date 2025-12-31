import {
  DependencyType,
  IFilterGroup,
  IProject,
  ISearchData,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider
} from '@/types/ModManager'
import { CurseForge } from './CurseForge'
import { ModTypeClassIds, ModsSearchSortField } from '@/types/CurseForge'
import { ProjectType as ModrinthProjectType, SortValue } from '@/types/Modrinth'
import { Modrinth } from './Modrinth'
import { ServerCore } from '@/types/Server'
import { Loader } from '@/types/Loader'
import {
  cfFileToVersion,
  cfModToProject,
  loaderToCfLoader,
  mrProjectToProject,
  mrVersionToVersion
} from '../utilities/modManager'

export class ModManager {
  static async search(
    query: string,
    provider: Provider,
    options: {
      version: string | undefined
      loader: Loader | ServerCore | undefined
      projectType: ProjectType
      sort: string
      filter: string[]
    },
    pagination: {
      offset: number
      limit: number
    }
  ): Promise<ISearchData> {
    const { version, loader, projectType, sort, filter } = options

    const data: ISearchData = {
      projects: [],
      limit: pagination.limit,
      offset: 0,
      total: 0
    }

    try {
      if (provider == 'curseforge') {
        const curseforge = await CurseForge.search(
          query,
          {
            loader: loader ? loaderToCfLoader(loader) : undefined,
            version: version,
            modType: ModTypeClassIds[projectType],
            sortField: sort as unknown as ModsSearchSortField,
            category: filter
          },
          {
            offset: pagination.offset,
            limit: pagination.limit
          }
        )

        if (!curseforge) return data

        curseforge.data.forEach((mod) => {
          data.projects.push(cfModToProject(mod))
        })

        data.total =
          curseforge.pagination.totalCount <= 10000 ? curseforge.pagination.totalCount : 10000

        data.limit = curseforge.pagination.pageSize
        data.offset = curseforge.pagination.index * curseforge.pagination.pageSize
      } else if (provider == 'modrinth') {
        const modrinth = await Modrinth.search(
          query,
          {
            loader,
            projectType,
            version: version,
            sort: sort != '' ? SortValue[sort] : undefined,
            category: filter
          },
          {
            offset: pagination.offset,
            limit: pagination.limit
          }
        )

        if (!modrinth) return data

        modrinth.hits.forEach((project) => {
          data.projects.push(mrProjectToProject(project, projectType))
        })

        data.total = modrinth.total_hits
        data.limit = modrinth.limit
        data.offset = modrinth.offset
      }

      return data
    } catch {
      return data
    }
  }

  static getSort(provider: Provider): string[] {
    if (provider == Provider.CURSEFORGE) {
      return Object.keys(ModsSearchSortField).filter((key) => isNaN(Number(key)))
    } else if (provider == Provider.MODRINTH) {
      return Object.keys(SortValue).map((sv) => sv)
    }

    return []
  }

  static async getFilter(provider: Provider, projectType: ProjectType): Promise<IFilterGroup[]> {
    if (provider == Provider.CURSEFORGE) {
      const filters = await CurseForge.getFilter(ModTypeClassIds[projectType])

      if (!filters) return []

      return [
        {
          title: 'Categories',
          items: filters.map((f) => ({
            name: f.name,
            icon: f.iconUrl,
            id: f.id.toString()
          }))
        }
      ]
    } else if (provider == Provider.MODRINTH) {
      let pType = projectType
      if (pType == ProjectType.PLUGIN) pType = ProjectType.MOD

      const filters = await Modrinth.getFilter(pType as ModrinthProjectType)

      if (!filters) return []

      const groups = [...new Set(filters.map((f) => f.header))]

      return groups.map((g) => ({
        title: g,
        items: filters
          .filter((f) => f.header == g)
          .map((f) => ({
            name: f.name,
            icon: f.icon
          }))
      }))
    }

    return []
  }

  static async getProject(provider: Provider, projectId: string): Promise<IProject | null> {
    try {
      if (provider == Provider.CURSEFORGE) {
        const mod = await CurseForge.get(Number(projectId))

        if (!mod) return null

        const description = await CurseForge.getModDescription(Number(projectId))

        return { ...cfModToProject(mod), body: description || '' }
      } else if (provider == Provider.MODRINTH) {
        const project = await Modrinth.get(projectId)

        if (!project) return null

        return mrProjectToProject(project, project.project_type as ProjectType)
      }

      return null
    } catch {
      return null
    }
  }

  static async getVersions(
    provider: Provider,
    projectId: string,
    options: { version?: string; loader?: Loader; projectType: ProjectType; modUrl: string }
  ): Promise<IVersion[]> {
    try {
      const { version, loader, projectType, modUrl } = options

      if (provider == Provider.CURSEFORGE) {
        const files = await CurseForge.getModFiles(Number(projectId), {
          modType: ModTypeClassIds[projectType],
          loader: loader ? loaderToCfLoader(loader) : undefined,
          version
        })

        if (!files) return []

        return files.map((f) => cfFileToVersion(f, projectType, modUrl))
      } else if (provider == Provider.MODRINTH) {
        const project = await Modrinth.get(projectId)

        const versions = await Modrinth.versions(projectId, {
          version,
          loader,
          project_type: projectType
        })

        if (!versions) return []

        return versions.map((v) =>
          mrVersionToVersion(v, project?.server_side != 'unsupported', projectType)
        )
      }

      return []
    } catch {
      return []
    }
  }

  static async getDependencies(
    provider: Provider,
    projectId: string,
    deps: IVersionDependency[]
  ): Promise<IVersionDependency[]> {
    try {
      if (provider == Provider.CURSEFORGE) {
        const data = await CurseForge.getMods(deps.map((d) => Number(d.projectId)))

        const dependencies: IVersionDependency[] = []
        for (let index = 0; index < deps.length; index++) {
          const dependency = deps[index]

          const mod = data.find((p) => p.id.toString() == dependency.projectId)

          if (!mod) continue

          if (dependencies.find((d) => d.project?.title == mod.name)) continue

          dependency.project = cfModToProject(mod)
          dependencies.push(dependency)
        }

        return dependencies
      } else if (provider == Provider.MODRINTH) {
        const data = await Modrinth.getDependencies(
          projectId,
          deps.map((d) => ({
            project_id: d.projectId,
            version_id: d.versionId,
            dependency_type: d.relationType as DependencyType,
            file_name: ''
          }))
        )

        const dependencies: IVersionDependency[] = []
        for (let index = 0; index < deps.length; index++) {
          const dependency = deps[index]

          const project = data.find((p) => p.id == dependency.projectId)

          if (!project) continue

          if (dependencies.find((d) => d.project?.title == project.title)) continue

          dependency.project = mrProjectToProject(project, project.project_type as ProjectType)
          dependencies.push(dependency)
        }

        return dependencies
      }

      return []
    } catch {
      return []
    }
  }
}
