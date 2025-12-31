import {
  IFablicLoader,
  IFabricInstaller,
  IPaper,
  IPurpurVersion,
  IServerOption,
  IServerVersion,
  ISpongeSearchResult,
  ISpongeVersion,
  IVanillaCores,
  ServerCore
} from '@/types/Server'
import axios from 'axios'
import { Loader } from '@/types/Loader'
import { LoaderVersion } from '@/types/VersionsService'
import { BACKEND_URL } from '@/shared/config'

export class Server {
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
          const response = await axios.get<IVanillaCores>(`${BACKEND_URL}/server/vanilla.json`)
          const vanilla = this.checkVersion(version, response.data.vanilla, ServerCore.VANILLA)
          if (vanilla) cores.push(vanilla)

          const spigot = this.checkVersion(version, response.data.spigot, ServerCore.SPIGOT)
          if (spigot) cores.push(spigot)

          const bukkit = this.checkVersion(version, response.data.bukkit, ServerCore.BUKKIT)
          if (bukkit) cores.push(bukkit)
        } catch {}

        const paper = await this.getPaper(version)
        if (paper) cores.push(paper)

        const purpur = await this.getPurpur(version)
        if (purpur) cores.push(purpur)

        const sponge = await this.getSponge(version)
        if (sponge) cores.push(sponge)
      } else if (loader == 'fabric') {
        const fabric = await this.getFabric(version)
        if (fabric) return [fabric]
      } else if (loader == 'quilt') {
        const quilt = await this.getQuilt(version)
        if (quilt) return [quilt]
      } else if (loader == 'forge') {
        const forge = await this.getForge(version)
        if (!forge) return []

        cores.push(forge)
        const spongeForge = await this.getSponge(version, forge.url)
        if (spongeForge) cores.push(spongeForge)
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
      const response = await axios.get<IPaper>(
        `https://api.papermc.io/v2/projects/paper/versions/${version}/builds`
      )

      const builds = response.data.builds
      const lastBuild = builds[builds.length - 1]

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
      const loaders = await axios.get<IFablicLoader[]>(
        `https://meta.fabricmc.net/v2/versions/loader/` + version
      )
      const installers = await axios.get<IFabricInstaller[]>(
        `https://meta.fabricmc.net/v2/versions/installer`
      )

      const loader = loaders.data[0].loader.version
      const installer = installers.data[0].version

      const url = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader}/${installer}/server/jar`
      axios.get(url)

      return { core: ServerCore.FABRIC, url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getQuilt(version: string): Promise<IServerOption | null> {
    try {
      const loaders = await axios.get<IFablicLoader[]>(
        `https://meta.quiltmc.org/v3/versions/loader/` + version
      )

      const loader = loaders.data[0].loader.version

      const url = `https://meta.quiltmc.org/v3/versions/loader/${version}/${loader}/server/json`
      axios.get(url)

      const installers = await axios.get<IFabricInstaller[]>(
        `https://meta.quiltmc.org/v3/versions/installer`
      )

      return { core: ServerCore.QUILT, url: installers.data[0].url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await axios.get(`${BACKEND_URL}/loaders/forge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      return { core: ServerCore.FORGE, url: versions[version][0].url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getNeoForge(version: string): Promise<IServerOption | null> {
    try {
      const response = await axios.get(`${BACKEND_URL}/loaders/neoforge.json`)

      const versions: {
        [key: string]: LoaderVersion[]
      } = response.data

      return { core: ServerCore.NEOFORGE, url: versions[version][0].url, additionalPackage: null }
    } catch {
      return null
    }
  }

  private static async getPurpur(version: string): Promise<IServerOption | null> {
    try {
      const purpurVersion = await axios.get<IPurpurVersion>(
        `https://api.purpurmc.org/v2/purpur/` + version
      )

      return {
        core: ServerCore.PURPUR,
        url: `https://api.purpurmc.org/v2/purpur/${version}/${purpurVersion.data.builds.latest}/download`,
        additionalPackage: null
      }
    } catch {
      return null
    }
  }

  private static async getSponge(
    version: string,
    forge: string | null = null
  ): Promise<IServerOption | null> {
    try {
      const projectType = forge ? 'spongeforge' : 'spongevanilla'
      const url = `https://dl-api.spongepowered.org/v2/groups/org.spongepowered/artifacts/${projectType}/versions?tags=,minecraft:${version}&offset=0&limit=1`

      let search: ISpongeSearchResult | null = null
      try {
        const response = await axios.get<ISpongeSearchResult>(url + '&recommended=true')
        search = response.data
      } catch {
        const response = await axios.get<ISpongeSearchResult>(url)
        search = response.data
      }

      if (!search) return null

      const versionKey = Object.keys(search.artifacts)[0]

      const spongeVersion = await axios.get<ISpongeVersion>(
        `https://dl-api.spongepowered.org/v2/groups/org.spongepowered/artifacts/${projectType}/versions/` +
          versionKey
      )

      const downloadUrl = spongeVersion.data.assets.find(
        (asset) => asset.classifier == 'universal'
      )?.downloadUrl

      if (!downloadUrl) return null

      if (!forge) return { core: ServerCore.SPONGE, url: downloadUrl, additionalPackage: null }

      return { core: ServerCore.SPONGE, url: forge, additionalPackage: downloadUrl }
    } catch {
      return null
    }
  }
}
