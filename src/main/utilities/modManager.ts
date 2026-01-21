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
import { ServerCore } from '@/types/Server'
import { getFilesRecursively, getSha1 } from './files'
import { Loader } from '@/types/Loader'
import { CurseForge } from '../services/CurseForge'
import path from 'path'
import fs from 'fs-extra'
import toml from 'toml'
import { ModManager } from '../services/ModManager'
import { app } from 'electron'
import { extractFileFromArchive } from './archiver'
import { rimraf } from 'rimraf'

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

  const gallery: IProject['gallery'] = []

  if ('gallery' in project && Array.isArray(project.gallery)) {
    for (const image of project.gallery) {
      if (typeof image === 'string') {
        gallery.push({ url: image, description: '', title: '' })
      } else if (image && typeof image === 'object' && 'url' in image) {
        gallery.push({
          url: image.raw_url || image.url,
          description: image.description || '',
          title: image.title || ''
        })
      }
    }
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
    gallery
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

async function getModIcon(
  modPath: string,
  iconPath: string,
  tempPath: string
): Promise<string | null> {
  try {
    await extractFileFromArchive(modPath, iconPath, tempPath)
    const extractPath = path.join(tempPath, path.basename(iconPath))
    const base = await fs.readFile(extractPath)
    const base64 = Buffer.from(base).toString('base64')
    const ext = path.extname(iconPath).substring(1)
    return `data:image/${ext};base64,${base64}`
  } catch {
    return null
  }
}

export async function checkLocalMod(modPath: string): Promise<ILocalFileInfo | null> {
  let tempPath = ''

  try {
    const fileSize = (await fs.stat(modPath)).size
    const sha1 = await getSha1(modPath)

    const fileName = path.basename(modPath)

    if (!fileName) return null

    tempPath = path.join(app.getPath('temp'), fileName)
    await fs.mkdir(tempPath, { recursive: true })

    const parsers = [
      {
        files: ['fabric.mod.json', 'quilt.mod.json'],
        parse: async (extractedPath: string, foundFile: string): Promise<ILocalFileInfo> => {
          const fabricMod: IFabricMod = await fs.readJSON(path.join(extractedPath, foundFile))
          let icon: string | null = null
          if (fabricMod.icon) {
            icon = await getModIcon(modPath, fabricMod.icon, tempPath)
          }

          return {
            ...fabricMod,
            url: fabricMod.contact.homepage,
            filename: fileName,
            size: fileSize,
            path: modPath,
            sha1,
            icon
          }
        }
      },
      {
        files: ['META-INF/neoforge.mods.toml', 'META-INF/mods.toml'],
        parse: async (extractedPath: string, foundFile: string): Promise<ILocalFileInfo> => {
          const modsToml = await parseModsToml(path.join(extractedPath, foundFile))
          if (!modsToml) throw new Error('Invalid mods.toml')

          const mod = modsToml.mods[0]

          let icon: string | null = null
          if (mod.logoFile) {
            icon = await getModIcon(modPath, mod.logoFile, tempPath)
          }

          return {
            description: mod.description,
            filename: fileName,
            size: fileSize,
            id: mod.modId,
            name: mod.displayName,
            path: modPath,
            url: mod.displayURL,
            version: null,
            sha1,
            icon
          }
        }
      },
      {
        files: ['pack.mcmeta'],
        parse: async (extractedPath: string, foundFile: string): Promise<ILocalFileInfo> => {
          const packMcMeta: {
            pack: {
              description: { fallback: string } | string
            }
          } = await fs.readJSON(path.join(extractedPath, foundFile))

          const description =
            typeof packMcMeta.pack.description === 'object'
              ? packMcMeta.pack.description.fallback
              : packMcMeta.pack.description

          let icon = await getModIcon(modPath, 'logo.png', tempPath)
          if (!icon) icon = await getModIcon(modPath, 'pack.png', tempPath)

          return {
            description,
            filename: fileName,
            size: fileSize,
            id: fileName,
            name: fileName,
            path: modPath,
            url: '',
            version: null,
            sha1,
            icon
          }
        }
      }
    ]

    for (const parser of parsers) {
      for (const file of parser.files) {
        const extractedPath = await extractFileFromArchive(modPath, file, tempPath)
        if (extractedPath) {
          try {
            const info = await parser.parse(extractedPath, path.basename(file))
            return info
          } catch {
            continue
          }
        }
      }
    }

    return {
      description: '',
      filename: fileName,
      size: fileSize,
      id: fileName,
      name: fileName,
      path: modPath,
      url: '',
      version: null,
      sha1,
      icon: null
    }
  } catch (err) {
    return null
  } finally {
    if (tempPath && (await fs.pathExists(tempPath))) {
      await rimraf(tempPath).catch(() => {})
    }
  }
}

async function parseModsToml(filePath: string): Promise<any> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const parsedContent = toml.parse(fileContent)
    return parsedContent
  } catch (error) {
    return null
  }
}

function extractModrinthIds(url: string): { modId: string; versionId: string } | null {
  const match = url.match(/data\/([^/]+)\/versions\/([^/]+)/)
  return match ? { modId: match[1], versionId: match[2] } : null
}

export async function checkModpack(
  modpackPath: string,
  pack?: IProject,
  selectVersion?: IVersion
): Promise<IModpack | null> {
  const tempPath = app.getPath('temp')

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
              filename: path.basename(file.path),
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
    const targetFolders = ['mods', 'resourcepacks', 'shaderpacks', 'datapacks']
    const files = await getFilesRecursively(overridesPath, null, targetFolders)

    for (const file of files) {
      const folder = path.relative(overridesPath, path.dirname(file)).split(path.sep)[0]
      if (!targetFolders.includes(folder)) continue

      const fileName = path.basename(file)
      if (!fileName) continue

      const projectType = folderToProjectType(folder)
      if (!projectType) continue

      const info = await checkLocalMod(file)

      modpack.mods.push({
        description: info?.description || '',
        iconUrl: info?.icon || '',
        title: info?.name || fileName,
        projectType,
        url: '',
        provider: Provider.LOCAL,
        id: info?.id || fileName,
        version: {
          id: info?.version || 'local',
          dependencies: [],
          files: [
            {
              filename: fileName,
              size: info?.size || 0,
              url: '',
              sha1: info?.sha1 || '',
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
    default:
      return ''
  }
}

export function folderToProjectType(folder: string): ProjectType | null {
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
    case 'datapacks':
      return ProjectType.DATAPACK
    default:
      return null
  }
}

export function compareMods(a: ILocalProject[], b: ILocalProject[]): boolean {
  if (a.length !== b.length) return false

  const sig = (m: ILocalProject) => {
    const v = m.version
    const fileSig = v?.files?.map((f) => `${f.filename}:${f.sha1}:${f.size}`).join('|') ?? ''
    const depSig = v?.dependencies?.map((d) => `${d.title}:${d.relationType}`).join('|') ?? ''
    return `${m.id}#${m.provider}#${m.projectType}#${v?.id ?? 'null'}#${fileSig}#${depSig}`
  }

  const as = [...a].map(sig).sort()
  const bs = [...b].map(sig).sort()

  for (let i = 0; i < as.length; i++) if (as[i] !== bs[i]) return false
  return true
}
