import { Loader } from '@/types/Loader'
import { ProjectType, Provider } from '@/types/ModManager'
import { IServerConf, ServerCore } from '@/types/Server'

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
        )
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

    return projectTypes
  }

  return projectTypes
}
