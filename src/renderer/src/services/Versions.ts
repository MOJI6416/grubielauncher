import axios from 'axios'
import { BaseService, baseUrl } from './Base'
import { Loader } from '@/types/Loader'
import { IVersion } from '@/types/IVersion'
import { LoaderVersion } from '@/types/VersionsService'

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
  public static async getVersions(loader: Loader, snapshots = false) {
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
  }

  public static async getLoaderVersions(loader: Loader, version: IVersion) {
    let versions: LoaderVersion[] = []
    if (loader == 'forge') {
      versions = await VersionsService.getLoadersForge(version.id)
    } else if (loader == 'neoforge') {
      versions = await VersionsService.getLoadersNeoForge(version.id)
    } else if (loader == 'fabric') {
      versions = await VersionsService.getLoadersFabric(version.id)
    } else if (loader == 'quilt') {
      versions = await VersionsService.getLoadersQuilt(version.id)
    }

    return versions
  }

  private static async getVersionsVanilla(snapshots: boolean = false): Promise<IVersion[]> {
    const response = await axios.get(
      'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
    )

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
  }

  private static async getVersionsForge(): Promise<IVersion[]> {
    const response = await axios.get(`${baseUrl}/loaders/forge.json`)

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
  }

  private static async getVersionsNeoForge(): Promise<IVersion[]> {
    const response = await axios.get(`${baseUrl}/loaders/neoforge.json`)

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
  }

  private static async getLoadersNeoForge(version: string): Promise<LoaderVersion[]> {
    const response = await axios.get(`${baseUrl}/loaders/neoforge.json`)

    const versionsNeoForged: {
      [key: string]: LoaderVersion[]
    } = response.data

    const neoForged = versionsNeoForged[version]
    if (neoForged == undefined) return []

    return neoForged
  }

  private static async getLoadersForge(version: string): Promise<LoaderVersion[]> {
    const response = await axios.get(`${baseUrl}/loaders/forge.json`)

    const versionsForge: {
      [key: string]: LoaderVersion[]
    } = response.data

    const forge = versionsForge[version]
    if (forge == undefined) return []

    return forge
  }

  private static async getVersionsFabric(): Promise<IVersion[]> {
    const response = await axios.get<{ version: string; stable: boolean }[]>(
      'https://meta.fabricmc.net/v2/versions/game'
    )

    const versionsVanilla = await this.getVersionsVanilla()
    const versionsFabric: IVersion[] = []

    for (let index = 0; index < response.data.length; index++) {
      const version = response.data[index]

      if (!version.stable) continue
      for (let index = 0; index < versionsVanilla.length; index++) {
        const versionVanilla = versionsVanilla[index]

        if (versionVanilla.id == version.version) {
          versionsFabric.push(versionVanilla)
        }
      }
    }

    return versionsFabric
  }

  private static async getLoadersFabric(version: string): Promise<LoaderVersion[]> {
    const response = await axios.get<IFabricQuiltLoader[]>(
      'https://meta.fabricmc.net/v2/versions/loader'
    )

    return response.data.map((loader) => ({
      id: loader.version,
      url: `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader.version}/profile/json`
    }))
  }

  private static async getVersionsQuilt(): Promise<IVersion[]> {
    const response = await axios.get<{ version: string; stable: boolean }[]>(
      'https://meta.quiltmc.org/v3/versions/game'
    )

    const versionsVanilla = await this.getVersionsVanilla()
    const versionsQuilt: IVersion[] = []

    for (let index = 0; index < response.data.length; index++) {
      const version = response.data[index]

      if (!version.stable) continue
      for (let index = 0; index < versionsVanilla.length; index++) {
        const versionVanilla = versionsVanilla[index]

        if (versionVanilla.id == version.version) versionsQuilt.push(versionVanilla)
      }
    }

    return versionsQuilt
  }

  private static async getLoadersQuilt(version: string): Promise<LoaderVersion[]> {
    const response = await axios.get<IFabricQuiltLoader[]>(
      'https://meta.quiltmc.org/v3/versions/loader'
    )

    return response.data.map((loader) => ({
      id: loader.version,
      url: `https://meta.quiltmc.org/v3/versions/loader/${version}/${loader.version}/profile/json`
    }))
  }
}
