import {
  DependencyType,
  IFabricMod,
  ILocalFileInfo,
  ILocalProject,
  IModpack,
  IProject,
  IVersion,
  IVersionDependency,
  ProjectType,
  Provider
} from '@/types/ModManager'
import {
  IModpack as CurseForgeModpack,
  FileRelationType,
  IFile,
  IMod,
  ModLoaderType,
  ModTypeClassIds
} from '@/types/CurseForge'
import {
  IResultProject,
  IModpack as ModrinthModpack,
  IProject as IModrinthProject,
  IVersion as ModrinthVersion,
  IModpackDependencies
} from '@/types/Modrinth'
import { CurseForge } from '@renderer/services/CurseForge'
import { IServerConf, ServerCore } from '@/types/Server'
import { ModManager } from '@renderer/services/ModManager'
import { getFilesRecursively } from './Files'
import { Loader } from '@/types/Loader'

const api = window.api
const fs = api.fs
const path = api.path
const toml = api.tomlParse
const getPath = api.getPath
const extractAll = api.extractAll

export function compareMods(arr1: ILocalProject[], arr2: ILocalProject[]): boolean {
  if (arr1.length !== arr2.length) {
    return false
  }

  const sortFn = (a: ILocalProject, b: ILocalProject) => a.id.localeCompare(b.id)

  arr1.sort(sortFn)
  arr2.sort(sortFn)

  for (let i = 0; i < arr1.length; i++) {
    if (!areObjectsEqual(arr1[i], arr2[i])) {
      return false
    }
  }

  return true
}

function areObjectsEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true

  if (obj1 === null || obj2 === null || typeof obj1 !== typeof obj2) {
    return false
  }

  if (typeof obj1 === 'object' && typeof obj2 === 'object') {
    const ignoredKeys = ['_id', 'localPath']

    const keys1 = Object.keys(obj1)
      .filter((key) => !ignoredKeys.includes(key))
      .sort()
    const keys2 = Object.keys(obj2)
      .filter((key) => !ignoredKeys.includes(key))
      .sort()

    if (keys1.length !== keys2.length) {
      return false
    }

    for (let i = 0; i < keys1.length; i++) {
      const key = keys1[i]
      if (key !== keys2[i]) {
        return false
      }
      if (!areObjectsEqual(obj1[key], obj2[key])) {
        return false
      }
    }

    return true
  }

  return false
}

export function dependencyToLocalProject(dependencies: IVersionDependency[]) {
  const newMods: ILocalProject[] = []
  for (let index = 0; index < dependencies.length; index++) {
    const dependency = dependencies[index]
    const project = dependency.project

    if (!project) continue

    const version = project.versions[0]
    newMods.push({
      title: project.title,
      description: project.description,
      projectType: project.projectType,
      iconUrl: project.iconUrl,
      url: project.url,
      provider: project.provider,
      id: project.id,
      version: {
        id: version.id,
        dependencies: [],
        files: version.files
      }
    })
  }

  return newMods
}

export async function cfModpackToModpack(modpack: CurseForgeModpack): Promise<IModpack> {
  const mods = await CurseForge.getMods(modpack.files.map((file) => file.projectID))
  const files = await CurseForge.getFiles(modpack.files.map((file) => file.fileID))

  function getLoaderName(minecraft: CurseForgeModpack['minecraft']): Loader | null {
    return (minecraft.modLoaders?.[0]?.id.split('-')[0] as Loader) || null
  }

  const loader = getLoaderName(modpack.minecraft)

  const modpackFiles: ILocalProject[] = []

  for (const f of modpack.files) {
    const mod = mods.find((m) => m.id == f.projectID)
    if (!mod) continue

    let file = files.find((file) => file.id == f.fileID)
    if (!file && loader) {
      const lastFileIndex = mod.latestFilesIndexes.find(
        (f) => f.gameVersion == modpack.minecraft.version && f.modLoader == loaderToCfLoader(loader)
      )

      if (lastFileIndex == undefined) continue

      const newFile = await CurseForge.getFile(mod.id, lastFileIndex.fileId)

      if (!newFile) continue

      file = newFile
    }

    if (!file) continue

    const projectType = ModTypeClassIds[mod.classId || 6] as ProjectType

    modpackFiles.push({
      description: mod.summary,
      iconUrl: mod.logo?.url || '',
      title: mod.name,
      projectType,
      url: mod.links.websiteUrl,
      provider: Provider.CURSEFORGE,
      id: mod.id.toString(),
      version: {
        id: file.id.toString(),
        dependencies: [],
        files: [
          {
            filename: projectType != ProjectType.WORLD ? file.fileName : file.fileName,
            size: file.fileLength,
            url: file.downloadUrl || `blocked::${mod.links.websiteUrl}/download/${file.id}`,
            sha1: file.hashes.find((h) => h.algo == 1)?.value || '',
            isServer: file.isServerPack || true
          }
        ]
      }
    })
  }

  return {
    name: modpack.name,
    version: modpack.minecraft.version,
    loader: loader || undefined,
    mods: modpackFiles,
    folderPath: '',
    image: undefined
  }
}

export async function mrModpackToModpack(modpack: ModrinthModpack): Promise<IModpack> {
  function getLoaderName(dependencies: IModpackDependencies[]): Loader | null {
    const loaders = ['forge', 'neoforge', 'fabric-loader', 'quilt-loader']
    return (
      (loaders.find((loader) => loader in dependencies)?.replace('-loader', '') as Loader) || null
    )
  }

  return {
    name: modpack.name,
    folderPath: '',
    image: undefined,
    version: modpack.dependencies['minecraft'],
    loader: getLoaderName(modpack.dependencies) || undefined,
    mods: [],
    versionId: modpack.versionId
  }
}

export function loaderToCfLoader(loader: Loader | ServerCore): ModLoaderType {
  if (loader == 'fabric') return ModLoaderType.Fabric
  if (loader == 'forge') return ModLoaderType.Forge
  if (loader == 'neoforge') return ModLoaderType.NeoForge
  if (loader == 'quilt') return ModLoaderType.Quilt

  return ModLoaderType.Any
}

export function cfModToProject(mod: IMod): IProject {
  return {
    url: mod.links.websiteUrl,
    description: mod.summary,
    iconUrl: mod.logo?.url || '',
    id: mod.id.toString(),
    projectType: ModTypeClassIds[mod.classId || 'mod'] as ProjectType,
    title: mod.name,
    provider: Provider.CURSEFORGE,
    versions: [],
    body: '',
    gallery: mod.screenshots.map((s) => ({
      ...s
    }))
  }
}

export function mrIsResultProject(project: any): project is IResultProject {
  return (project as IResultProject).project_id !== undefined
}

export function mrProjectToProject(
  project: IResultProject | IModrinthProject,
  projectType: ProjectType
): IProject {
  let body = ''

  if ('body' in project) {
    body = project.body
  }

  return {
    url: `https://modrinth.com/${project.project_type}/${project.slug}`,
    description: project.description,
    iconUrl: project.icon_url,
    id: mrIsResultProject(project) ? project.project_id : project.id,
    projectType,
    title: project.title,
    provider: Provider.MODRINTH,
    versions: [],
    body,
    gallery: project.gallery
      ? project.gallery.map((s) => ({
          ...s
        }))
      : []
  }
}

export function cfFileToVersion(file: IFile, projectType: ProjectType, modUrl: string): IVersion {
  return {
    id: file.id.toString(),
    name:
      projectType != ProjectType.MODPACK
        ? file.displayName
        : `${file.displayName} for ${file.gameVersions.slice(0, 2).join(' / ')}`,
    dependencies: file.dependencies
      .map((d) => {
        const relation = cfRelationTypeToVersionDependency(d.relationType)

        if (!relation) return

        return {
          projectId: d.modId.toString(),
          versionId: null,
          project: null,
          relationType: relation
        }
      })
      .filter((d) => d !== undefined) as IVersionDependency[],
    downloads: file.downloadCount,
    files: [
      {
        filename: projectType != ProjectType.WORLD ? file.fileName : file.fileName,
        size: file.fileLength,
        url: file.downloadUrl || `blocked::${modUrl}/download/${file.id}`,
        isServer: file.isServerPack || true,
        sha1: file.hashes.find((h) => h.algo == 1)?.value || ''
      }
    ]
  }
}

export function mrVersionToVersion(
  version: ModrinthVersion,
  isServer: boolean,
  projectType: ProjectType
): IVersion {
  return {
    id: version.id,
    name:
      projectType != ProjectType.MODPACK ? version.name : `${version.name} / ${version.loaders[0]}`,
    dependencies: version.dependencies
      .map((d) => {
        if (d.project_id == null) return
        return {
          projectId: d.project_id,
          versionId: d.version_id,
          project: null,
          relationType: d.dependency_type as DependencyType
        }
      })
      .filter((d) => d !== undefined) as IVersionDependency[],
    downloads: version.downloads,
    files: version.files
      .filter((f) => (version.files.length > 1 ? f.primary : true))
      .map((f) => ({
        filename: f.filename,
        size: f.size,
        isServer,
        url: f.url,
        sha1: f.hashes.sha1
      }))
  }
}

export function cfRelationTypeToVersionDependency(
  relationType: FileRelationType
): DependencyType | null {
  if (relationType == FileRelationType.RequiredDependency) return DependencyType.REQUIRED
  if (relationType == FileRelationType.OptionalDependency) return DependencyType.OPTIONAL
  if (relationType == FileRelationType.Incompatible) return DependencyType.INCOMPATIBLE
  if (relationType == FileRelationType.EmbeddedLibrary) return DependencyType.EMBEDDED

  return null
}

export function versionDependencyToCfRelationType(
  relationType: DependencyType
): FileRelationType | null {
  if (relationType == DependencyType.REQUIRED) return FileRelationType.RequiredDependency
  if (relationType == DependencyType.OPTIONAL) return FileRelationType.OptionalDependency
  if (relationType == DependencyType.INCOMPATIBLE) return FileRelationType.Incompatible
  if (relationType == DependencyType.EMBEDDED) return FileRelationType.EmbeddedLibrary

  return null
}

export function getProjectTypes(
  loader: Loader,
  server: IServerConf | undefined,
  provider: Provider
): ProjectType[] {
  const projectTypes: ProjectType[] = []

  if (loader == 'vanilla') {
    projectTypes.push(ProjectType.RESOURCEPACK)

    if (provider != Provider.MODRINTH) projectTypes.push(ProjectType.WORLD)
    projectTypes.push(ProjectType.DATAPACK)

    if (server) {
      if (
        [ServerCore.BUKKIT, ServerCore.SPIGOT, ServerCore.PAPER, ServerCore.PURPUR].includes(
          server.core
        ) ||
        (server.core == ServerCore.SPONGE &&
          (provider == Provider.MODRINTH || provider == Provider.LOCAL))
      ) {
        projectTypes.push(ProjectType.PLUGIN)
      }

      return projectTypes
    }
  } else {
    projectTypes.push(ProjectType.MOD)
    projectTypes.push(ProjectType.RESOURCEPACK)
    projectTypes.push(ProjectType.SHADER)
    if (provider != Provider.MODRINTH) projectTypes.push(ProjectType.WORLD)
    projectTypes.push(ProjectType.DATAPACK)

    if (
      server &&
      server.core == ServerCore.SPONGE &&
      (provider == Provider.MODRINTH || provider == Provider.LOCAL) &&
      loader == 'forge'
    ) {
      projectTypes.push(ProjectType.PLUGIN)
    }

    return projectTypes
  }

  return projectTypes
}

export async function checkLocalMod(
  versionPath: string,
  modPath: string
): Promise<ILocalFileInfo | null> {
  try {
    const fileSize = (await fs.stat(modPath)).size
    const fileName = modPath.split('\\').pop()

    if (!fileName) return null

    async function fabric(tempPath: string, filePath: string): Promise<ILocalFileInfo | null> {
      if (!fileName) return null

      const fabricMod: IFabricMod = JSON.parse(
        await fs.readFile(path.join(tempPath, filePath), 'utf-8')
      )

      return {
        ...fabricMod,
        url: fabricMod.contact.homepage,
        filename: fileName,
        size: fileSize,
        path: path.join(tempPath, fileName)
      }
    }

    const tempPath = path.join(versionPath, 'temp', fileName)
    await fs.mkdir(tempPath, { recursive: true })

    const filePath = path.join(tempPath, fileName)
    await fs.copyFile(modPath, filePath)

    await extractAll(filePath, tempPath)

    let info: ILocalFileInfo | null = null

    if (fs.pathExistsSync(path.join(tempPath, 'fabric.mod.json'))) {
      info = await fabric(tempPath, 'fabric.mod.json')
    } else if (fs.pathExistsSync(path.join(tempPath, 'quilt.mod.json'))) {
      info = await fabric(tempPath, 'quilt.mod.json')
    } else if (fs.pathExistsSync(path.join(tempPath, 'META-INF', 'mods.toml'))) {
      const modsToml = await parseModsToml(path.join(tempPath, 'META-INF', 'mods.toml'))
      if (!modsToml) return null

      info = {
        description: modsToml.mods[0].description,
        filename: fileName,
        size: fileSize,
        id: modsToml.mods[0].modId,
        name: modsToml.mods[0].displayName,
        path: filePath,
        url: modsToml.mods[0].displayURL,
        version: null
      }
    } else if (fs.pathExistsSync(path.join(tempPath, 'pack.mcmeta'))) {
      const packMcMeta: {
        pack: {
          description:
            | {
                fallback: string
              }
            | string
        }
      } = await fs.readJSON(path.join(tempPath, 'pack.mcmeta'), 'utf-8')

      info = {
        description:
          packMcMeta.pack.description instanceof Object && 'fallback' in packMcMeta.pack.description
            ? packMcMeta.pack.description.fallback
            : packMcMeta.pack.description,
        filename: fileName,
        size: fileSize,
        id: '',
        name: fileName,
        path: filePath,
        url: '',
        version: null
      }
    } else {
      info = {
        description: '',
        filename: fileName,
        size: fileSize,
        id: '',
        name: fileName,
        path: filePath,
        url: '',
        version: null
      }
    }

    return info
  } catch (err) {
    return null
  }
}

export function projetTypeToFolder(type: ProjectType): string {
  switch (type) {
    case ProjectType.MOD:
      return 'mods'
    case ProjectType.MODPACK:
      return 'modpacks'
    case ProjectType.PLUGIN:
      return 'plugins'
    case ProjectType.RESOURCEPACK:
      return 'resourcepacks'
    case ProjectType.SHADER:
      return 'shaderpacks'
    case ProjectType.WORLD:
      return 'saves'
    case ProjectType.DATAPACK:
      return path.join('storage', 'datapacks')
  }
}

async function parseModsToml(filePath: string): Promise<any> {
  const fileContent = await fs.readFile(filePath, 'utf-8')
  const parsedContent = toml(fileContent)

  return parsedContent
}

function extractModrinthIds(url: string): { modId: string; versionId: string } | null {
  const match = url.match(/data\/([^/]+)\/versions\/([^/]+)/)
  return match ? { modId: match[1], versionId: match[2] } : null
}

function folderToProjectType(folder: string): ProjectType | null {
  switch (folder) {
    case 'mods':
      return ProjectType.MOD
    case 'modpacks':
      return ProjectType.MODPACK
    case 'plugins':
      return ProjectType.PLUGIN
    case 'resourcepacks':
      return ProjectType.RESOURCEPACK
    case 'shaderpacks':
      return ProjectType.SHADER
    case 'saves':
      return ProjectType.WORLD
    default:
      return null
  }
}

export async function checkModpack(
  modpackPath: string,
  pack?: IProject,
  selectVersion?: IVersion
): Promise<IModpack | null> {
  const tempPath = await getPath('temp')

  if (!tempPath) return null

  let confPath = ''
  let provider: Provider | null = null
  try {
    const cfPath = path.join(modpackPath, 'manifest.json')
    const mrPath = path.join(modpackPath, 'modrinth.index.json')

    if (await fs.pathExists(cfPath)) {
      confPath = cfPath
      provider = Provider.CURSEFORGE
    } else if (await fs.pathExists(mrPath)) {
      confPath = mrPath
      provider = Provider.MODRINTH
    }

    if (!confPath || !provider) {
      return null
    }
  } catch {
    return null
  }

  const conf = await fs.readJSON(confPath, 'utf-8')

  let modpack: IModpack | null = null
  if (provider == Provider.CURSEFORGE) {
    const cfModpack: CurseForgeModpack = conf
    modpack = await cfModpackToModpack(cfModpack)
  } else if (provider == Provider.MODRINTH) {
    const mrModpack: ModrinthModpack = conf
    modpack = await mrModpackToModpack(mrModpack)

    if (!modpack) return null

    if (!pack) {
      const searchData = await ModManager.search(
        modpack.name,
        Provider.MODRINTH,
        {
          projectType: ProjectType.MODPACK,
          loader: modpack.loader,
          version: modpack.version,
          filter: [],
          sort: ''
        },
        {
          offset: 0,
          limit: 1
        }
      )

      if (!searchData.projects.length) return null

      pack = searchData.projects[0]

      if (!pack) return null

      const versions = await ModManager.getVersions(Provider.MODRINTH, pack.id, {
        loader: modpack.loader,
        version: modpack.version,
        projectType: ProjectType.MODPACK,
        modUrl: ''
      })

      if (!versions.length) return null
      selectVersion = versions.find((v) => v.name.split(' for')[0] == modpack?.versionId)
    }

    if (!selectVersion) return null

    const dependensies = await ModManager.getDependencies(
      Provider.MODRINTH,
      pack.id,
      selectVersion.dependencies
    )

    for (const file of mrModpack.files) {
      const downloadUrl = file.downloads[0]
      if (!downloadUrl) continue

      const ids = extractModrinthIds(downloadUrl)
      if (!ids) continue

      const { modId, versionId } = ids

      const dependency = dependensies.find((d) => d.projectId == modId && d.versionId == versionId)
      if (!dependency) continue

      const mod = dependency.project
      if (!mod) continue

      modpack.mods.push({
        description: mod.description,
        iconUrl: mod.iconUrl,
        title: mod.title,
        projectType: mod.projectType,
        url: mod.url,
        provider: Provider.MODRINTH,
        id: mod.id,
        version: {
          id: versionId,
          dependencies: [],
          files: [
            {
              filename: file.path.split('/').pop() || '',
              size: file.fileSize,
              url: downloadUrl,
              sha1: file.hashes.sha1,
              isServer: file.env?.server == 'required' || true
            }
          ]
        }
      })
    }
  }

  if (!modpack) return null

  const overridesPath = path.join(modpackPath, 'overrides')
  if (await fs.pathExists(overridesPath)) {
    const targetFolders = ['mods', 'resourcepacks', 'shaderpacks']
    const files = await getFilesRecursively(overridesPath, null, targetFolders)

    for (const file of files) {
      const folder = file.split('\\').slice(-2, -1)[0]
      if (!targetFolders.includes(folder)) continue

      const fileName = file.split('\\').pop()
      if (!fileName) continue

      const projectType = folderToProjectType(folder)
      if (!projectType) continue

      modpack.mods.push({
        description: '',
        iconUrl: null,
        title: fileName,
        projectType,
        url: '',
        provider: Provider.LOCAL,
        id: fileName,
        version: {
          id: '',
          dependencies: [],
          files: [
            {
              filename: fileName,
              size: 0,
              url: '',
              sha1: '',
              isServer: true
            }
          ]
        }
      })
    }
  }

  return {
    ...modpack,
    folderPath: modpackPath,
    image: pack?.iconUrl || undefined
  }
}
