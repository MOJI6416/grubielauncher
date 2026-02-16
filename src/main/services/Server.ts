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
import { BACKEND_URL } from '@/shared/config'

export class Server {
  private static api = axios.create({
    timeout: 30000
  })

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
    try {
      const cores: IServerOption[] = []

      if (loader == 'vanilla') {
        try {
          const response = await this.api.get<IVanillaCores>(`${BACKEND_URL}/server/vanilla.json`)
          const vanilla = this.checkVersion(version, response.data.vanilla, ServerCore.VANILLA)
          if (vanilla) cores.push(vanilla)

          const spigot = this.checkVersion(version, response.data.spigot, ServerCore.SPIGOT)
          if (spigot) cores.push(spigot)

          const bukkit = this.checkVersion(version, response.data.bukkit, ServerCore.BUKKIT)
          if (bukkit) cores.push(bukkit)
        } catch { }

        const paper = await this.getPaper(version)
        if (paper) cores.push(paper)

        const purpur = await this.getPurpur(version)
        if (purpur) cores.push(purpur)
      } else if (loader == 'fabric') {
        const fabric = await this.getFabric(version)
        if (fabric) return [fabric]
      } else if (loader == 'quilt') {
        const quilt = await this.getQuilt(version)
        if (quilt) return [quilt]
      } else if (loader == 'forge') {
        const forge = await this.getForge(version)
        if (forge) return [forge]
      } else if (loader == 'neoforge') {
        const neoForge = await this.getNeoForge(version)
        if (neoForge) return [neoForge]
      }

      return cores
    } catch {
      return []
    }
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
    } catch {
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

      const loader = loaders.data[0]?.loader?.version
      const installer = installers.data[0]?.version

      if (!loader || !installer) {
        return null
      }

      const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader}/${installer}/server/jar`

      return { core: ServerCore.FABRIC, url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getQuilt(version: string): Promise<IServerOption | null> {
    try {
      const loaders = await this.api.get<IFablicLoader[]>(
        `https://meta.quiltmc.org/v3/versions/loader/` + version
      )

      const loader = loaders.data[0]?.loader?.version
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
    } catch {
      return null
    }
  }

  private static async getForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/forge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      const v = versions[version]
      const first = v?.[0]

      if (!first?.url) {
        return null
      }

      return { core: ServerCore.FORGE, url: first.url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getNeoForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/neoforge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      const v = versions[version]
      const first = v?.[0]

      if (!first?.url) {
        return null
      }

      return { core: ServerCore.NEOFORGE, url: first.url, additionalPackage: null }
    } catch {
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
    } catch {
      return null
    }
  }
}
