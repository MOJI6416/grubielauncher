import axios from 'axios'
import { BaseService } from './Base'
import { Loader } from '@/types/Loader'
import { IVersion } from '@/types/IVersion'
import { LoaderVersion } from '@/types/VersionsService'
import { BACKEND_URL } from '@/shared/config'

export interface IVersionsManifest {
  latest: {
    realese: string
    snapshot: string
  }
  versions: IVersion[]
}

export interface IFabricQuiltLoader {
  separator: string
  build: number
  maven: string
  version: string
  stable?: boolean
}

export class VersionsService extends BaseService {
  private static api = axios.create({
    timeout: 30000
  })

  public static async getVersions(loader: Loader, snapshots = false) {
    try {
      let versions: IVersion[] = []
      if (loader == 'vanilla') {
        versions = await VersionsService.getVersionsVanilla(snapshots)
      } else if (loader == 'forge') {
        versions = await VersionsService.getVersionsForge()
      } else if (loader == 'neoforge') {
        versions = await VersionsService.getVersionsNeoForge()
      } else if (loader == 'fabric') {
        versions = await VersionsService.getVersionsFabric()
      } else if (loader == 'quilt') {
        versions = await VersionsService.getVersionsQuilt()
      }

      return versions
    } catch {
      return []
    }
  }

  public static async getLoaderVersions(loader: Loader, versionId: string) {
    try {
      let versions: LoaderVersion[] = []
      if (loader == 'forge') {
        versions = await VersionsService.getLoadersForge(versionId)
      } else if (loader == 'neoforge') {
        versions = await VersionsService.getLoadersNeoForge(versionId)
      } else if (loader == 'fabric') {
        versions = await VersionsService.getLoadersFabric(versionId)
      } else if (loader == 'quilt') {
        versions = await VersionsService.getLoadersQuilt(versionId)
      }

      return versions
    } catch {
      return []
    }
  }

  private static async getVersionsVanilla(snapshots: boolean = false): Promise<IVersion[]> {
    try {
      const response = await this.api.get('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')

      const versionsManifest: IVersionsManifest = response.data

      const versions: IVersion[] = []

      let serverMangaer = true

      for (let index = 0; index < versionsManifest.versions.length; index++) {
        const version = versionsManifest.versions[index]

        if (version.type != 'release' && !snapshots) continue

        version.serverManager = serverMangaer

        versions.push(version)

        if (version.id == '1.8.0') {
          serverMangaer = false
        }
      }

      return versions
    } catch {
      return []
    }
  }

  private static async getVersionsForge(): Promise<IVersion[]> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/forge.json`)

      const versionsVanilla = await this.getVersionsVanilla()
      const versionsForge: {
        [key: string]: LoaderVersion[]
      } = response.data

      const versions: IVersion[] = []
      const notSupported: string[] = ['1.15.2', '1.16.1', '1.16.2', '1.16.3', '1.16.4', '1.16.5']

      for (let index = 0; index < versionsVanilla.length; index++) {
        const version = versionsVanilla[index]
        const forge = versionsForge[version.id]

        if (!forge) continue

        if (notSupported.includes(version.id)) continue
        versions.push(version)
      }

      return versions
    } catch {
      return []
    }
  }

  private static async getVersionsNeoForge(): Promise<IVersion[]> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/neoforge.json`)

      const versionsVanilla = await this.getVersionsVanilla()
      const versionsNeoForged: {
        [key: string]: LoaderVersion[]
      } = response.data

      const versions: IVersion[] = []

      for (let index = 0; index < versionsVanilla.length; index++) {
        const version = versionsVanilla[index]
        const neoForge = versionsNeoForged[version.id]

        if (neoForge == undefined) continue
        versions.push(version)
      }

      return versions
    } catch {
      return []
    }
  }

  private static async getLoadersNeoForge(version: string): Promise<LoaderVersion[]> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/neoforge.json`)

      const versionsNeoForged: {
        [key: string]: LoaderVersion[]
      } = response.data

      const neoForged = versionsNeoForged[version]
      if (neoForged == undefined) return []

      return neoForged
    } catch {
      return []
    }
  }

  private static async getLoadersForge(version: string): Promise<LoaderVersion[]> {
    try {
      const response = await this.api.get(`${BACKEND_URL}/loaders/forge.json`)

      const versionsForge: {
        [key: string]: LoaderVersion[]
      } = response.data

      const forge = versionsForge[version]
      if (forge == undefined) return []

      return forge
    } catch {
      return []
    }
  }

  private static async getVersionsFabric(): Promise<IVersion[]> {
    try {
      const response = await this.api.get<{ version: string; stable: boolean }[]>(
        'https://meta.fabricmc.net/v2/versions/game'
      )

      const versionsVanilla = await this.getVersionsVanilla()
      const versionsFabric: IVersion[] = []

      const vanillaById = new Map(versionsVanilla.map((v) => [v.id, v]))

      for (let index = 0; index < response.data.length; index++) {
        const version = response.data[index]
        if (!version.stable) continue

        const v = vanillaById.get(version.version)
        if (v) versionsFabric.push(v)
      }

      return versionsFabric
    } catch {
      return []
    }
  }

  private static async getLoadersFabric(version: string): Promise<LoaderVersion[]> {
    try {
      type FabricLoaderForGame = {
        loader: { version: string; stable: boolean }
      }

      const response = await this.api.get<FabricLoaderForGame[]>(
        `https://meta.fabricmc.net/v2/versions/loader/${version}`
      )

      return response.data
        .map((item) => item.loader)
        .filter((l) => l?.version)
        .map((loader) => ({
          id: loader.version,
          url: `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader.version}/profile/json`
        }))
    } catch {
      return []
    }
  }

  private static async getVersionsQuilt(): Promise<IVersion[]> {
    try {
      const response = await this.api.get<{ version: string; stable: boolean }[]>(
        'https://meta.quiltmc.org/v3/versions/game'
      )

      const versionsVanilla = await this.getVersionsVanilla()
      const versionsQuilt: IVersion[] = []

      const vanillaById = new Map(versionsVanilla.map((v) => [v.id, v]))

      for (let index = 0; index < response.data.length; index++) {
        const version = response.data[index]
        if (!version.stable) continue

        const v = vanillaById.get(version.version)
        if (v) versionsQuilt.push(v)
      }

      return versionsQuilt
    } catch {
      return []
    }
  }

  private static async getLoadersQuilt(version: string): Promise<LoaderVersion[]> {
    try {
      type QuiltLoaderForGame = {
        loader: { version: string }
      }

      const response = await this.api.get<QuiltLoaderForGame[]>(
        `https://meta.quiltmc.org/v3/versions/loader/${version}`
      )

      return response.data
        .map((item) => item.loader)
        .filter((l) => l?.version)
        .map((loader) => ({
          id: loader.version,
          url: `https://meta.quiltmc.org/v3/versions/loader/${version}/${loader.version}/profile/json`
        }))
    } catch {
      return []
    }
  }
}
