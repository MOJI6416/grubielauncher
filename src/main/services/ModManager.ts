import {
  DependencyType,
  IFilterGroup,
  ILocalIdentifyMatch,
  ILocalIdentifyRequest,
  ILocalIdentifyResult,
  IProject,
  ISearchData,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider
} from '@/types/ModManager'
import { isSourceUnreachable } from '@/shared/errors'
import { CurseForge } from './CurseForge'
import { ModTypeClassIds, ModsSearchSortField } from '@/types/CurseForge'
import {
  IProject as ModrinthProject,
  IVersion as ModrinthVersion,
  ProjectType as ModrinthProjectType,
  SortValue
} from '@/types/Modrinth'
import { Modrinth } from './Modrinth'
import { ServerCore } from '@/types/Server'
import { Loader } from '@/types/Loader'
import {
  cfFileToVersion,
  cfModToProject,
  loaderToCfLoader,
  mrProjectToProject,
  mrVersionToVersion,
  sortVersionsByDate
} from '../utilities/modManager'
import { fileCurseForgeFingerprint } from '../utilities/cfFingerprint'
import { getSha1 } from '../utilities/files'
import pLimit from 'p-limit'

const SHA1_PATTERN = /^[0-9a-f]{40}$/
const MODRINTH_HASH_BATCH = 500
const MODRINTH_PROJECT_BATCH = 100
const FINGERPRINT_CONCURRENCY = 4
const CURSEFORGE_LOADER_NAMES = new Set(['forge', 'neoforge', 'fabric', 'quilt'])

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

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
        let cfSortField: ModsSearchSortField = ModsSearchSortField.Popularity

        if (sort && sort !== '') {
          const mapped = (ModsSearchSortField as any)[sort]
          if (typeof mapped === 'number') cfSortField = mapped as ModsSearchSortField
        }

        const curseforge = await CurseForge.search(
          query,
          {
            loader: loader ? loaderToCfLoader(loader) : undefined,
            version: version,
            modType: ModTypeClassIds[projectType],
            sortField: cfSortField,
            category: filter
          },
          {
            offset: pagination.offset,
            limit: pagination.limit
          }
        )

        if (!curseforge) return { ...data, error: true }

        curseforge.data.forEach((mod) => {
          data.projects.push(cfModToProject(mod))
        })

        data.total =
          curseforge.pagination.totalCount <= 10000 ? curseforge.pagination.totalCount : 10000

        data.limit = curseforge.pagination.pageSize
        data.offset = curseforge.pagination.index
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

        if (!modrinth) return { ...data, error: true }

        modrinth.hits.forEach((project) => {
          data.projects.push(mrProjectToProject(project, projectType))
        })

        data.total = modrinth.total_hits
        data.limit = modrinth.limit
        data.offset = modrinth.offset
      }

      return data
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return { ...data, error: true }
    }
  }

  static getSort(provider: Provider): string[] {
    if (provider == Provider.CURSEFORGE) {
      return Object.keys(ModsSearchSortField).filter((key) => isNaN(Number(key)))
    } else if (provider == Provider.MODRINTH) {
      return Object.keys(SortValue).filter((key) => isNaN(Number(key)))
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
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
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

        return sortVersionsByDate(files.map((f) => cfFileToVersion(f, projectType, modUrl)))
      } else if (provider == Provider.MODRINTH) {
        const project = await Modrinth.get(projectId)

        const versions = await Modrinth.versions(projectId, {
          version,
          loader,
          project_type: projectType
        })

        if (!versions) return []

        const isClient = projectType != ProjectType.MOD || project?.client_side != 'unsupported'

        return sortVersionsByDate(
          versions.map((v) =>
            mrVersionToVersion(v, project?.server_side != 'unsupported', projectType, isClient)
          )
        )
      }

      return []
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return []
    }
  }

  static async identifyLocalFiles(
    requests: ILocalIdentifyRequest[]
  ): Promise<ILocalIdentifyResult> {
    const matches: ILocalIdentifyMatch[] = []
    const unavailable: Provider[] = []
    const limit = pLimit(FINGERPRINT_CONCURRENCY)

    const items = await Promise.all(
      requests.map((request) =>
        limit(async () => {
          const known = request.sha1.toLowerCase()
          const sha1 = SHA1_PATTERN.test(known)
            ? known
            : await getSha1(request.path).catch(() => '')
          return { ...request, sha1 }
        })
      )
    )

    const pending = new Map(items.map((item) => [item.key, item]))

    const hashes = [...new Set(items.map((item) => item.sha1).filter(Boolean))]
    const versionsByHash: Record<string, ModrinthVersion> = {}
    let modrinthFailed = false

    for (const batch of chunk(hashes, MODRINTH_HASH_BATCH)) {
      const found = await Modrinth.versionsByHashes(batch)
      if (!found) {
        modrinthFailed = true
        break
      }
      Object.assign(versionsByHash, found)
    }

    if (modrinthFailed) unavailable.push(Provider.MODRINTH)

    const projectIds = [
      ...new Set(Object.values(versionsByHash).map((version) => version.project_id))
    ]
    const projects = new Map<string, ModrinthProject>()
    for (const batch of chunk(projectIds, MODRINTH_PROJECT_BATCH)) {
      for (const project of (await Modrinth.getProjects(batch)) ?? []) {
        projects.set(project.id, project)
      }
    }

    for (const item of items) {
      const version = versionsByHash[item.sha1]
      const project = version ? projects.get(version.project_id) : undefined
      const file = version?.files.find((entry) => entry.hashes.sha1 === item.sha1)
      if (!version || !project || !file) continue

      const isServer = project.server_side != 'unsupported'
      const isClient = item.projectType != ProjectType.MOD || project.client_side != 'unsupported'
      const mapped = mrVersionToVersion(version, isServer, item.projectType, isClient)

      matches.push({
        key: item.key,
        provider: Provider.MODRINTH,
        loaders: version.loaders ?? [],
        project: mrProjectToProject(project, item.projectType),
        version: {
          ...mapped,
          files: [
            {
              filename: file.filename,
              size: file.size,
              isServer,
              isClient,
              url: file.url,
              sha1: file.hashes.sha1
            }
          ]
        }
      })
      pending.delete(item.key)
    }

    if (pending.size === 0) return { matches, unavailable }

    const fingerprints = new Map<string, number>()
    await Promise.all(
      [...pending.values()].map((item) =>
        limit(async () => {
          const fingerprint = await fileCurseForgeFingerprint(item.path).catch(() => null)
          if (fingerprint !== null) fingerprints.set(item.key, fingerprint)
        })
      )
    )

    const found = await CurseForge.getFingerprintMatches([...new Set(fingerprints.values())])
    if (!found) {
      unavailable.push(Provider.CURSEFORGE)
      return { matches, unavailable }
    }

    const byFingerprint = new Map(found.map((match) => [match.id, match]))
    const mods = await CurseForge.getMods([...new Set(found.map((match) => match.modId))])
    if (!mods) {
      unavailable.push(Provider.CURSEFORGE)
      return { matches, unavailable }
    }
    const modById = new Map(mods.map((mod) => [mod.id, mod]))

    for (const item of pending.values()) {
      const fingerprint = fingerprints.get(item.key)
      const match = fingerprint !== undefined ? byFingerprint.get(fingerprint) : undefined
      const mod = match ? modById.get(match.modId) : undefined
      if (!match || !mod) continue

      const project = cfModToProject(mod)
      matches.push({
        key: item.key,
        provider: Provider.CURSEFORGE,
        loaders: (match.file.gameVersions ?? [])
          .map((entry) => entry.toLowerCase())
          .filter((entry) => CURSEFORGE_LOADER_NAMES.has(entry)),
        project,
        version: cfFileToVersion(match.file, item.projectType, project.url)
      })
    }

    return { matches, unavailable }
  }

  static async getDependencies(
    provider: Provider,
    _projectId: string,
    deps: IVersionDependency[]
  ): Promise<IVersionDependency[] | null> {
    if (provider == Provider.CURSEFORGE) {
      const data = await CurseForge.getMods(deps.map((d) => Number(d.projectId)))
      if (!data) return null

      const dependencies: IVersionDependency[] = []
      for (let index = 0; index < deps.length; index++) {
        const dependency = deps[index]

        const mod = data.find((p) => p.id.toString() == dependency.projectId)

        if (!mod) continue

        if (dependencies.find((d) => d.projectId == dependency.projectId)) continue

        dependency.project = cfModToProject(mod)
        dependencies.push(dependency)
      }

      return dependencies
    } else if (provider == Provider.MODRINTH) {
      const data = await Modrinth.getDependencies(
        deps.map((d) => ({
          project_id: d.projectId,
          version_id: d.versionId,
          dependency_type: d.relationType as DependencyType,
          file_name: ''
        }))
      )
      if (!data) return null

      const dependencies: IVersionDependency[] = []
      for (let index = 0; index < deps.length; index++) {
        const dependency = deps[index]

        const project = data.find((p) => p.id == dependency.projectId)

        if (!project) continue

        if (dependencies.find((d) => d.projectId == dependency.projectId)) continue

        dependency.project = mrProjectToProject(project, project.project_type as ProjectType)
        dependencies.push(dependency)
      }

      return dependencies
    }

    return []
  }
}
