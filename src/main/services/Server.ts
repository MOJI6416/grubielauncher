import {
  IFablicLoader,
  IFabricInstaller,
  IPaper,
  IPurpurVersion,
  IServerOption,
  IServerVersion,
  IVanillaCores,
  ServerCore
} from '@/types/Server'
import axios from 'axios'
import { Loader } from '@/types/Loader'
import { LoaderVersion } from '@/types/VersionsService'
import { isTrustedServerCoreUrl } from '../utilities/trustedHosts'
import { getApiBaseUrl } from '../utilities/apiHost'
import { isSourceUnreachable } from '@/shared/errors'

export class Server {
  private static api = axios.create({
    timeout: 30000
  })

  private static isStableVersion(version: string | undefined): boolean {
    return !!version && !/-(?:beta|pre|rc|alpha)/i.test(version)
  }

  private static isAllowedOption(option: IServerOption | null): option is IServerOption {
    if (!option) return false
    if (isTrustedServerCoreUrl(option.url)) return true

    console.error(`Refused untrusted server core url: ${option.url}`)
    return false
  }

  private static checkVersion(
    version: string,
    versions: IServerVersion[],
    core: ServerCore
  ): IServerOption | null {
    for (let index = 0; index < versions.length; index++) {
      const serverVersion = versions[index]

      if (serverVersion.version == version) {
        return { core, url: serverVersion.url, additionalPackage: null }
      }
    }

    return null
  }

  static async get(version: string, loader: Loader): Promise<IServerOption[]> {
    const cores: IServerOption[] = []
    const unreachable: unknown[] = []

    const attempt = async (
      task: () => Promise<IServerOption | null>
    ): Promise<IServerOption | null> => {
      try {
        return await task()
      } catch (error) {
        if (isSourceUnreachable(error)) unreachable.push(error)
        else console.error('[servers:get] source failed:', error)
        return null
      }
    }

    if (loader == 'vanilla') {
      const [vanillaCores, paper, purpur] = await Promise.all([
        (async () => {
          try {
            const response = await this.api.get<IVanillaCores>(
              `${getApiBaseUrl()}/server/vanilla.json`
            )
            return response.data
          } catch (error) {
            if (isSourceUnreachable(error)) unreachable.push(error)
            return null
          }
        })(),
        attempt(() => this.getPaper(version)),
        attempt(() => this.getPurpur(version))
      ])

      if (vanillaCores) {
        const vanilla = this.checkVersion(version, vanillaCores.vanilla, ServerCore.VANILLA)
        if (this.isAllowedOption(vanilla)) cores.push(vanilla)

        const spigot = this.checkVersion(version, vanillaCores.spigot, ServerCore.SPIGOT)
        if (this.isAllowedOption(spigot)) cores.push(spigot)

        const bukkit = this.checkVersion(version, vanillaCores.bukkit, ServerCore.BUKKIT)
        if (this.isAllowedOption(bukkit)) cores.push(bukkit)
      }

      if (this.isAllowedOption(paper)) cores.push(paper)
      if (this.isAllowedOption(purpur)) cores.push(purpur)
    } else if (loader == 'fabric') {
      const fabric = await attempt(() => this.getFabric(version))
      if (this.isAllowedOption(fabric)) cores.push(fabric)
    } else if (loader == 'quilt') {
      const quilt = await attempt(() => this.getQuilt(version))
      if (this.isAllowedOption(quilt)) cores.push(quilt)
    } else if (loader == 'forge') {
      const forge = await attempt(() => this.getForge(version))
      if (this.isAllowedOption(forge)) cores.push(forge)
    } else if (loader == 'neoforge') {
      const neoForge = await attempt(() => this.getNeoForge(version))
      if (this.isAllowedOption(neoForge)) cores.push(neoForge)
    }

    if (cores.length === 0 && unreachable.length > 0) throw unreachable[0]

    return cores
  }

  private static async getPaper(version: string): Promise<IServerOption | null> {
    try {
      const response = await this.api.get<IPaper>(
        `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`
      )

      const builds = response.data.builds
      const lastBuild = builds[builds.length - 1]

      if (!lastBuild) {
        return null
      }

      return {
        core: ServerCore.PAPER,
        url: `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${lastBuild.build}/downloads/paper-${version}-${lastBuild.build}.jar`,
        additionalPackage: null
      }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }

  private static async getFabric(version: string): Promise<IServerOption | null> {
    try {
      const loaders = await this.api.get<IFablicLoader[]>(
        `https://meta.fabricmc.net/v2/versions/loader/` + version
      )
      const installers = await this.api.get<IFabricInstaller[]>(
        `https://meta.fabricmc.net/v2/versions/installer`
      )

      const loader =
        loaders.data.find((l) => l.loader?.stable)?.loader?.version ??
        loaders.data[0]?.loader?.version
      const installer =
        installers.data.find((i) => i.stable)?.version ??
        installers.data[0]?.version

      if (!loader || !installer) {
        return null
      }

      const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader}/${installer}/server/jar`

      return { core: ServerCore.FABRIC, url, additionalPackage: null }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }

  private static async getQuilt(version: string): Promise<IServerOption | null> {
    try {
      const loaders = await this.api.get<IFablicLoader[]>(
        `https://meta.quiltmc.org/v3/versions/loader/` + version
      )

      const loader =
        loaders.data.find((l) => this.isStableVersion(l.loader?.version))?.loader
          ?.version ?? loaders.data[0]?.loader?.version
      if (!loader) {
        return null
      }

      const installers = await this.api.get<IFabricInstaller[]>(
        `https://meta.quiltmc.org/v3/versions/installer`
      )

      const installerUrl = installers.data[0]?.url
      if (!installerUrl) {
        return null
      }

      return { core: ServerCore.QUILT, url: installerUrl, additionalPackage: null }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }

  private static async getForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await this.api.get(`${getApiBaseUrl()}/loaders/forge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      const v = versions[version]
      const first = v?.[0]

      if (!first?.url) {
        return null
      }

      return { core: ServerCore.FORGE, url: first.url, additionalPackage: null }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }

  private static async getNeoForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await this.api.get(`${getApiBaseUrl()}/loaders/neoforge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      const v = versions[version]
      const first = v?.[0]

      if (!first?.url) {
        return null
      }

      return { core: ServerCore.NEOFORGE, url: first.url, additionalPackage: null }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }

  private static async getPurpur(version: string): Promise<IServerOption | null> {
    try {
      const purpurVersion = await this.api.get<IPurpurVersion>(
        `https://api.purpurmc.org/v2/purpur/` + version
      )

      const latest = purpurVersion.data.builds?.latest
      if (!latest) {
        return null
      }

      return {
        core: ServerCore.PURPUR,
        url: `https://api.purpurmc.org/v2/purpur/${version}/${latest}/download`,
        additionalPackage: null
      }
    } catch (error) {
      if (isSourceUnreachable(error)) throw error
      return null
    }
  }
}
