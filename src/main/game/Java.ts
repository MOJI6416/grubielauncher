import { IPlatform } from '@/types/OS'
import axios from 'axios'
import { execFile } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { DownloadItem } from '@/types/Downloader'
import { Downloader } from '../utilities/downloader'
import { findSystemJava } from './systemJava'
import { resolveDownloadCandidates } from '../utilities/mirrors'
import {
  getDownloadSource,
  getMojangReachable,
  isMirrorDisabled
} from '../utilities/mirrorState'
import { getOS } from '../utilities/other'

const JAVA_VERIFIED_MARKER = '.grubie-java-verified'
const JAVA_ASSET_HOSTS = ['github.com', 'objects.githubusercontent.com']

const installedRootCache = new Map<number, { root: string; mtimeMs: number }>()

interface IJavaAsset {
  id: string
  fileName: string
  url: string
  size: number
  checksum: string
  imageType: IAdoptiumImageType
  checksumType: 'sha256'
}

interface IAdoptiumPackage {
  name: string
  link: string
  size: number
  checksum: string
}

interface IAdoptiumRelease {
  release_name: string
  binary?: {
    package?: IAdoptiumPackage
  }
}

type IAdoptiumArch = 'x64' | 'aarch64'
type IAdoptiumImageType = 'jre' | 'jdk'
type IAdoptiumOs = 'windows' | 'mac' | 'linux'

export class Java {
  public javaPath: string = ''
  public javaServerPath: string = ''
  public majorVersion: number = 21
  public platform: IPlatform | null = null

  public usingSystemJava = false

  private resolvedAsset: IJavaAsset | null = null
  private static readonly apiUrl = 'https://api.adoptium.net/v3/assets/latest'
  private static readonly preferredImageTypes: IAdoptiumImageType[] = ['jre', 'jdk']

  constructor(version: number) {
    this.majorVersion = version
    this.platform = getOS()
  }

  async init(signal?: AbortSignal) {
    if (!this.platform) return

    await this.ensureAppReady()
    this.throwIfAborted(signal)

    const installedJavaRoot = await this.findInstalledJavaRoot()
    if (installedJavaRoot) {
      this.setJavaPaths(installedJavaRoot)
    }

  }

  async useSystemJava(): Promise<boolean> {
    if (!this.platform) return false

    const system = await findSystemJava(this.majorVersion, this.platform)
    if (!system) return false

    this.javaPath = system.client
    this.javaServerPath = system.server
    this.usingSystemJava = true

    return true
  }

  private throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new Error('AbortError')
  }

  async install(signal?: AbortSignal) {
    const item = await this.prepareInstallItem(signal)
    if (!item) return

    const downloader = new Downloader()
    await downloader.downloadFiles([item], signal)
    this.throwIfAborted(signal)

    await this.finalizeInstall()
  }

  async prepareInstallItem(signal?: AbortSignal): Promise<DownloadItem | null> {
    if (!this.platform) return null

    this.throwIfAborted(signal)
    await this.init(signal)
    this.throwIfAborted(signal)

    if (this.javaPath && (await fs.pathExists(this.javaPath))) return null
    if (this.javaServerPath && (await fs.pathExists(this.javaServerPath))) return null

    const asset = await this.resolveJavaAsset(signal)
    if (!asset) {
      if (await this.useSystemJava()) return null

      throw new Error(
        `Failed to resolve a Java ${this.majorVersion} build for ${this.platform.os}/${this.platform.arch}. Check your internet connection and try again.`
      )
    }
    this.throwIfAborted(signal)

    const javaBaseDir = this.getJavaBaseDir()
    await fs.ensureDir(javaBaseDir)

    return {
      url: asset.url,
      destination: path.join(javaBaseDir, asset.fileName),
      checksum: asset.checksum,
      checksumType: asset.checksumType,
      size: asset.size,
      group: 'java',
      options: { extract: true }
    }
  }

  async finalizeInstall(): Promise<void> {
    installedRootCache.delete(this.majorVersion)

    const installedJavaRoot = await this.findInstalledJavaRoot()
    if (!installedJavaRoot) {
      throw new Error(
        `Java ${this.majorVersion} installation failed verification. Try reinstalling.`
      )
    }

    this.setJavaPaths(installedJavaRoot)
  }

  private async requestAdoptiumIndex(
    urls: string[],
    signal: AbortSignal | undefined,
    params: Record<string, string>
  ) {
    let lastError: unknown = null

    for (const url of urls) {
      try {
        return await axios.get<IAdoptiumRelease[]>(url, {
          signal,
          timeout: 30000,
          params
        })
      } catch (error) {
        this.throwIfAborted(signal)
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Adoptium release index is unreachable')
  }

  private async resolveJavaAsset(signal?: AbortSignal): Promise<IJavaAsset | null> {
    if (this.resolvedAsset) return this.resolvedAsset

    const cachedAsset = await this.readCachedAsset()

    try {
      this.throwIfAborted(signal)
      const asset = await this.fetchJavaAsset(signal)
      this.resolvedAsset = asset
      await this.writeCachedAsset(asset)
      return asset
    } catch (error) {
      if (cachedAsset) {
        this.resolvedAsset = cachedAsset
        return cachedAsset
      }

      console.error(
        `Failed to resolve Java ${this.majorVersion} build from Adoptium API:`,
        error
      )
      return null
    }
  }

  private async fetchJavaAsset(signal?: AbortSignal): Promise<IJavaAsset> {
    const apiOs = this.getAdoptiumOs()
    const archCandidates = this.getAdoptiumArchCandidates()

    if (!apiOs || archCandidates.length === 0) {
      throw new Error('Unsupported operating system or architecture')
    }

    const indexUrls = resolveDownloadCandidates(
      `${Java.apiUrl}/${this.majorVersion}/hotspot`,
      getDownloadSource(),
      getMojangReachable(),
      isMirrorDisabled()
    )

    for (const apiArch of archCandidates) {
      for (const imageType of Java.preferredImageTypes) {
        const response = await this.requestAdoptiumIndex(indexUrls, signal, {
          architecture: apiArch,
          heap_size: 'normal',
          image_type: imageType,
          os: apiOs,
          vendor: 'eclipse'
        })

        const release = response.data.find((item) => item.binary?.package?.link)
        const javaPackage = release?.binary?.package

        if (!release || !javaPackage) {
          continue
        }

        return {
          id: release.release_name,
          fileName: javaPackage.name,
          url: javaPackage.link,
          size: javaPackage.size,
          checksum: javaPackage.checksum,
          imageType,
          checksumType: 'sha256'
        }
      }
    }

    throw new Error(
      `No Adoptium JRE or JDK package found for Java ${this.majorVersion} on ${apiOs}/${archCandidates.join(', ')}`
    )
  }

  private async readCachedAsset(): Promise<IJavaAsset | null> {
    const cachePath = this.getCachePath()
    if (!cachePath || !(await fs.pathExists(cachePath))) return null

    try {
      const cachedAsset = (await fs.readJSON(cachePath)) as Partial<IJavaAsset>
      if (
        !cachedAsset ||
        typeof cachedAsset.id !== 'string' ||
        typeof cachedAsset.fileName !== 'string' ||
        typeof cachedAsset.url !== 'string' ||
        typeof cachedAsset.size !== 'number' ||
        typeof cachedAsset.checksum !== 'string'
      ) {
        return null
      }

      if (!this.isTrustedAssetUrl(cachedAsset.url)) return null

      return {
        id: cachedAsset.id,
        fileName: cachedAsset.fileName,
        url: cachedAsset.url,
        size: cachedAsset.size,
        checksum: cachedAsset.checksum,
        imageType:
          cachedAsset.imageType === 'jre' || cachedAsset.imageType === 'jdk'
            ? cachedAsset.imageType
            : 'jdk',
        checksumType: 'sha256'
      }
    } catch (error) {
      console.error(`Failed to read cached Java asset ${cachePath}:`, error)
      return null
    }
  }

  private async writeCachedAsset(asset: IJavaAsset): Promise<void> {
    const cachePath = this.getCachePath()
    if (!cachePath) return

    try {
      await fs.ensureDir(path.dirname(cachePath))
      await fs.writeJSON(cachePath, asset, { spaces: 2 })
    } catch (error) {
      console.error(`Failed to cache Java asset ${cachePath}:`, error)
    }
  }

  private isTrustedAssetUrl(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl)
      if (url.protocol !== 'https:') return false

      return JAVA_ASSET_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
      )
    } catch {
      return false
    }
  }

  private async findInstalledJavaRoot(): Promise<string | null> {
    const javaBaseDir = this.getJavaBaseDir()

    let baseStats
    try {
      baseStats = await fs.stat(javaBaseDir)
    } catch {
      installedRootCache.delete(this.majorVersion)
      return null
    }

    const cached = installedRootCache.get(this.majorVersion)
    if (cached && cached.mtimeMs === baseStats.mtimeMs) {
      if (await fs.pathExists(cached.root)) return cached.root
      installedRootCache.delete(this.majorVersion)
    }

    const entries = await fs.readdir(javaBaseDir)
    const candidates: { root: string; mtimeMs: number }[] = []

    for (const entry of entries) {
      if (!this.isJavaDirectoryForMajor(entry)) continue

      const javaRoot = path.join(javaBaseDir, entry)
      let stats

      try {
        stats = await fs.stat(javaRoot)
      } catch {
        continue
      }

      if (!stats.isDirectory()) continue

      const paths = this.buildJavaPaths(javaRoot)
      if (!(await fs.pathExists(paths.client)) && !(await fs.pathExists(paths.server))) continue

      if (!(await this.isJavaRootHealthy(javaRoot))) continue

      candidates.push({ root: javaRoot, mtimeMs: stats.mtimeMs })
    }

    if (candidates.length === 0) {
      installedRootCache.delete(this.majorVersion)
      return null
    }

    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
    installedRootCache.set(this.majorVersion, {
      root: candidates[0].root,
      mtimeMs: baseStats.mtimeMs
    })

    return candidates[0].root
  }

  private async isJavaRootHealthy(javaRoot: string): Promise<boolean> {
    const paths = this.buildJavaPaths(javaRoot)
    const binary = (await fs.pathExists(paths.client))
      ? paths.client
      : (await fs.pathExists(paths.server))
        ? paths.server
        : null
    if (!binary) return false

    const markerPath = path.join(javaRoot, JAVA_VERIFIED_MARKER)
    if (await fs.pathExists(markerPath)) return true

    const ok = await new Promise<boolean>((resolve) => {
      execFile(binary, ['-version'], { timeout: 15000, windowsHide: true }, (error) => {
        resolve(!error)
      })
    })

    if (ok) {
      await fs.writeFile(markerPath, '').catch(() => {})
    }

    return ok
  }

  private isJavaDirectoryForMajor(dirName: string): boolean {
    if (this.majorVersion === 8) {
      return /^jdk8u/i.test(dirName)
    }

    return new RegExp(`^jdk-${this.majorVersion}(?:[.+-]|$)`, 'i').test(dirName)
  }

  private setJavaPaths(javaRoot: string) {
    const paths = this.buildJavaPaths(javaRoot)
    this.javaPath = paths.client
    this.javaServerPath = paths.server
  }

  private buildJavaPaths(javaRoot: string) {
    const javaBinDir =
      this.platform?.os === 'osx'
        ? path.join(javaRoot, 'Contents', 'Home', 'bin')
        : path.join(javaRoot, 'bin')

    const ext = this.platform?.os === 'windows' ? '.exe' : ''
    const clientBinary = this.platform?.os === 'windows' ? 'javaw' : 'java'

    return {
      client: path.join(javaBinDir, clientBinary + ext),
      server: path.join(javaBinDir, 'java' + ext)
    }
  }

  private getJavaBaseDir(): string {
    return path.join(app.getPath('appData'), '.grubielauncher', 'java')
  }

  private getCachePath(): string | null {
    if (!this.platform) return null

    return path.join(
      this.getJavaBaseDir(),
      'cache',
      `${this.majorVersion}-${this.platform.os}-${this.platform.arch}.json`
    )
  }

  private getAdoptiumOs(): IAdoptiumOs | null {
    if (!this.platform) return null

    switch (this.platform.os) {
      case 'windows':
        return 'windows'
      case 'osx':
        return 'mac'
      case 'linux':
        return 'linux'
      default:
        return null
    }
  }

  private getAdoptiumArchCandidates(): IAdoptiumArch[] {
    if (!this.platform) return []

    switch (this.platform.arch) {
      case 'x64':
        return ['x64']
      case 'arm64':
        return this.platform.os === 'linux' ? ['aarch64'] : ['aarch64', 'x64']
      default:
        return []
    }
  }

  private async ensureAppReady() {
    if (!app.isReady()) {
      await app.whenReady()
    }
  }
}
