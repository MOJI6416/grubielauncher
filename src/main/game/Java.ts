import { IPlatform } from '@/types/OS'
import axios from 'axios'
import { app } from 'electron'
import path from 'path'
import fs from 'fs-extra'
import { Downloader } from '../utilities/downloader'
import { getOS } from '../utilities/other'

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

  private resolvedAsset: IJavaAsset | null = null
  private static readonly apiUrl = 'https://api.adoptium.net/v3/assets/latest'
  private static readonly preferredImageTypes: IAdoptiumImageType[] = ['jre', 'jdk']

  constructor(version: number) {
    this.majorVersion = version
    this.platform = getOS()
  }

  async init() {
    if (!this.platform) return

    await this.ensureAppReady()

    const installedJavaRoot = await this.findInstalledJavaRoot()
    if (installedJavaRoot) {
      this.setJavaPaths(installedJavaRoot)
      return
    }

    const asset = await this.resolveJavaAsset()
    if (!asset) return

    this.setJavaPaths(this.getExpectedJavaRoot(asset))
  }

  async install() {
    if (!this.platform) return

    await this.init()

    if (this.javaPath && (await fs.pathExists(this.javaPath))) return
    if (this.javaServerPath && (await fs.pathExists(this.javaServerPath))) return

    const asset = await this.resolveJavaAsset()
    if (!asset) return

    const javaBaseDir = this.getJavaBaseDir()
    await fs.ensureDir(javaBaseDir)

    this.setJavaPaths(this.getJavaRoot(asset.id))

    const downloader = new Downloader()

    await downloader.downloadFiles([
      {
        url: asset.url,
        destination: path.join(javaBaseDir, asset.fileName),
        checksum: asset.checksum,
        checksumType: asset.checksumType,
        size: asset.size,
        group: 'java',
        options: { extract: true }
      }
    ])

    const installedJavaRoot = await this.findInstalledJavaRoot()
    if (installedJavaRoot) {
      this.setJavaPaths(installedJavaRoot)
    }
  }

  private async resolveJavaAsset(): Promise<IJavaAsset | null> {
    if (this.resolvedAsset) return this.resolvedAsset

    const cachedAsset = await this.readCachedAsset()

    try {
      const asset = await this.fetchJavaAsset()
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

  private async fetchJavaAsset(): Promise<IJavaAsset> {
    const apiOs = this.getAdoptiumOs()
    const apiArch = this.getAdoptiumArch()

    if (!apiOs || !apiArch) {
      throw new Error('Unsupported operating system or architecture')
    }

    for (const imageType of Java.preferredImageTypes) {
      const response = await axios.get<IAdoptiumRelease[]>(
        `${Java.apiUrl}/${this.majorVersion}/hotspot`,
        {
          timeout: 30000,
          params: {
            architecture: apiArch,
            heap_size: 'normal',
            image_type: imageType,
            os: apiOs,
            vendor: 'eclipse'
          }
        }
      )

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

    throw new Error(
      `No Adoptium JRE or JDK package found for Java ${this.majorVersion} on ${apiOs}/${apiArch}`
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

  private async findInstalledJavaRoot(): Promise<string | null> {
    const javaBaseDir = this.getJavaBaseDir()
    if (!(await fs.pathExists(javaBaseDir))) return null

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

      candidates.push({ root: javaRoot, mtimeMs: stats.mtimeMs })
    }

    if (candidates.length === 0) return null

    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
    return candidates[0].root
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

  private getJavaRoot(releaseName: string): string {
    return path.join(this.getJavaBaseDir(), releaseName)
  }

  private getExpectedJavaRoot(asset: IJavaAsset): string {
    if (asset.imageType === 'jre') {
      return this.getJavaRoot(`${asset.id}-jre`)
    }

    return this.getJavaRoot(asset.id)
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

  private getAdoptiumArch(): IAdoptiumArch | null {
    if (!this.platform) return null

    switch (this.platform.arch) {
      case 'x64':
        return 'x64'
      case 'arm64':
        return 'aarch64'
      default:
        return null
    }
  }

  private async ensureAppReady() {
    if (!app.isReady()) {
      await app.whenReady()
    }
  }
}
