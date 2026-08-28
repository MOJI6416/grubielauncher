import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { isSourceUnreachable } from '@/shared/errors'
import { Loader } from '@/types/Loader'
import { IVersion } from '@/types/IVersion'
import { LoaderVersion } from '@/types/VersionsService'
import { resolveDownloadCandidates } from '../utilities/mirrors'
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled
} from '../utilities/mirrorState'
import { attachApiHostFallback, getApiBaseUrl } from '../utilities/apiHost'

export interface IVersionsManifest {
  latest: {
    release: string
    snapshot: string
  }
  versions: IVersion[]
}

export class VersionsService {
  private static api = attachApiHostFallback(
    axios.create({
      timeout: 30000
    })
  )

  private static async mirroredGet<T>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    const candidates = resolveDownloadCandidates(
      url,
      getDownloadSource(),
      getMojangReachable(),
      isMirrorDisabled()
    )

    let firstError: unknown
    let lastError: unknown

    for (const candidate of candidates) {
      try {
        return await VersionsService.api.get<T>(candidate, config)
      } catch (error) {
        if (firstError === undefined) firstError = error
        lastError = error

        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        if (status !== undefined && status < 500 && status !== 408 && status !== 429) {
          break
        }
      }
    }

    throw isSourceUnreachable(firstError) ? firstError : lastError
  }

  private static readonly CACHE_TTL = 10 * 60 * 1000

  private static cache = new Map<string, { expires: number; value: Promise<unknown> }>()

  private static async cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const entry = VersionsService.cache.get(key)
    if (entry && entry.expires > now) {
      return entry.value as Promise<T>
    }

    const value = producer()
    VersionsService.cache.set(key, { expires: now + VersionsService.CACHE_TTL, value })

    try {
      const resolved = await value
      if (Array.isArray(resolved) && resolved.length == 0) {
        VersionsService.cache.delete(key)
      }
      return resolved
    } catch (error) {
      VersionsService.cache.delete(key)
      throw error
    }
  }

  public static async getVersions(loader: Loader, snapshots = false) {
    return VersionsService.cached(`versions:${loader}:${snapshots}`, async () => {
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
    })
  }

  public static async getLoaderVersions(loader: Loader, versionId: string) {
    return VersionsService.cached(`loaders:${loader}:${versionId}`, async () => {
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
    })
  }

  private static async getVersionsVanilla(snapshots: boolean = false): Promise<IVersion[]> {
    return VersionsService.cached(`vanilla:${snapshots}`, async () => {
      const response = await this.mirroredGet<IVersionsManifest>(
        'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
      )

      const versionsManifest: IVersionsManifest = response.data

      const versions: IVersion[] = []

      let serverManager = true

      for (let index = 0; index < versionsManifest.versions.length; index++) {
        const version = versionsManifest.versions[index]

        if (version.type != 'release' && !snapshots) continue

        version.serverManager = serverManager

        versions.push(version)

        if (version.id == '1.8') {
          serverManager = false
        }
      }

      return versions
    })
  }

  private static async getVersionsForge(): Promise<IVersion[]> {
    const response = await this.api.get(`${getApiBaseUrl()}/loaders/forge.json`)

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
    const response = await this.api.get(`${getApiBaseUrl()}/loaders/neoforge.json`)

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
    const response = await this.api.get(`${getApiBaseUrl()}/loaders/neoforge.json`)

    const versionsNeoForged: {
      [key: string]: LoaderVersion[]
    } = response.data

    const neoForged = versionsNeoForged[version]
    if (neoForged == undefined) return []

    return neoForged
  }

  private static async getLoadersForge(version: string): Promise<LoaderVersion[]> {
    const response = await this.api.get(`${getApiBaseUrl()}/loaders/forge.json`)

    const versionsForge: {
      [key: string]: LoaderVersion[]
    } = response.data

    const forge = versionsForge[version]
    if (forge == undefined) return []

    return forge
  }

  private static async getVersionsFabric(): Promise<IVersion[]> {
    const response = await this.mirroredGet<{ version: string; stable: boolean }[]>(
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
  }

  private static async getLoadersFabric(version: string): Promise<LoaderVersion[]> {
    type FabricLoaderForGame = {
      loader: { version: string; stable: boolean }
    }

    const response = await this.mirroredGet<FabricLoaderForGame[]>(
      `https://meta.fabricmc.net/v2/versions/loader/${version}`
    )

    return response.data
      .map((item) => item.loader)
      .filter((l) => l?.version)
      .map((loader) => ({
        id: loader.version,
        url: `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader.version}/profile/json`
      }))
  }

  private static async getVersionsQuilt(): Promise<IVersion[]> {
    const response = await this.mirroredGet<{ version: string; stable: boolean }[]>(
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
  }

  private static async getLoadersQuilt(version: string): Promise<LoaderVersion[]> {
    type QuiltLoaderForGame = {
      loader: { version: string }
    }

    const response = await this.mirroredGet<QuiltLoaderForGame[]>(
      `https://meta.quiltmc.org/v3/versions/loader/${version}`
    )

    return response.data
      .map((item) => item.loader)
      .filter((l) => l?.version)
      .map((loader) => ({
        id: loader.version,
        url: `https://meta.quiltmc.org/v3/versions/loader/${version}/${loader.version}/profile/json`
      }))
  }
}
