import { Loader } from '@/types/Loader'
import { ILocalProject, ProjectType, Provider } from '@/types/ModManager'
import { IServerConf, ServerCore } from '@/types/Server'

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
