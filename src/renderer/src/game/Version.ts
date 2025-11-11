import { IVersionConf } from '@/types/IVersion'
import { IVersionManifest } from '@/types/IVersionManifest'
import {
  convertMavenCoordinateToJarPath,
  getFullLangCode,
  getJavaAgent,
  getOS,
  removeDuplicatesLibraries
} from '@renderer/utilities/Other'
import { IAssetIndex } from '@/types/IAssetIndex'
import { TSettings } from '@/types/Settings'
import { IAuth, ILocalAccount } from '@/types/Account'
import { Java } from './Java'
import axios from 'axios'
import { IFabricManifest } from '@/types/IFabricManifest'
import { IInstallProfile } from '@/types/IInstallProfile'
import { DownloadItem } from '@/types/Downloader'
import { languages } from '@renderer/components/Settings'

const api = window.api
const fs = api.fs
const path = api.path
const rimraf = api.rimraf
const startDownload = api.startDownload
const getPath = api.getPath
const electron = window.electron
const generateOfflineUUID = api.generateOfflineUUID
const readJSONFromArchive = api.readJSONFromArchive

export class Version {
  public version: IVersionConf
  public manifest: IVersionManifest | undefined

  public launcherPath: string = ''
  public minecraftPath: string = ''
  public versionPath: string = ''
  private javaPath: string = ''
  private settings: TSettings
  public isQuickPlayMultiplayer: boolean = false
  public isQuickPlaySingleplayer: boolean = false

  constructor(settings: TSettings, version: IVersionConf) {
    this.version = version
    this.settings = settings
  }

  public async init() {
    this.launcherPath = path.join(await getPath('appData'), '.grubielauncher')
    this.minecraftPath = path.join(this.launcherPath, 'minecraft')
    this.versionPath = path.join(this.minecraftPath, 'versions', this.version.name)

    try {
      await fs.access(this.versionPath)
    } catch (error) {
      await fs.mkdir(this.versionPath, { recursive: true })
    }

    try {
      await fs.access(path.join(this.versionPath, `${this.version.version.id}.json`))
      await this.readManifest()
      if (this.manifest) {
        const java = new Java(this.manifest.javaVersion.majorVersion)
        await java.init()
        this.javaPath = java.javaPath
      }
    } catch (error) {}
  }

  public async install(account: ILocalAccount, items: DownloadItem[] = []) {
    const downloadItems: DownloadItem[] = [...items]

    const manifestPath = path.join(this.versionPath, `${this.version.version.id}.json`)
    let isNewManifest = false

    try {
      await fs.access(manifestPath)
    } catch (error) {
      isNewManifest = true
      await startDownload(
        [
          {
            url: this.version.version.url,
            destination: manifestPath,
            group: 'manifest'
          }
        ],
        this.settings.downloadLimit
      )
    }

    await this.readManifest()

    if (!this.manifest) return

    const java = new Java(this.manifest.javaVersion.majorVersion)
    await java.init()
    await java.install()

    this.javaPath = java.javaPath

    let isDownloadClient = true

    if (['fabric', 'quilt'].includes(this.version.loader.name) && this.version.loader.version) {
      const fabricManifestPath = path.join(this.versionPath, `${this.version.loader.name}.json`)
      let fabricManifest: IFabricManifest | undefined = undefined

      try {
        await fs.access(fabricManifestPath)
        fabricManifest = await fs.readJSON(fabricManifestPath, {
          encoding: 'utf-8'
        })
      } catch (error) {
        const response = await axios.get<IFabricManifest>(this.version.loader.version.url)
        await fs.writeJSON(fabricManifestPath, response.data, {
          encoding: 'utf-8',
          spaces: 2
        })
        fabricManifest = response.data
      }

      if (isNewManifest && fabricManifest) {
        this.manifest.mainClass = fabricManifest.mainClass
        if (fabricManifest.arguments.jvm && this.manifest.arguments?.jvm)
          this.manifest.arguments.jvm.push(...fabricManifest.arguments.jvm)

        if (fabricManifest.arguments.game && this.manifest.arguments?.game)
          this.manifest.arguments.game.push(...fabricManifest.arguments.game)

        const fabricLibraries: IVersionManifest['libraries'] = []
        for (const lib of fabricManifest.libraries) {
          const baseUrl = lib.url

          const path = convertMavenCoordinateToJarPath(lib.name)

          const library: IVersionManifest['libraries'][0] = {
            name: lib.name,
            downloads: {
              artifact: {
                url: `${baseUrl}/${path}`,
                path,
                size: lib.size,
                sha1: lib.sha1
              }
            }
          }

          fabricLibraries.push(library)
        }

        this.manifest.libraries = this.removeDuplicateLibraries(
          [...fabricLibraries, ...this.manifest.libraries],
          ['org.ow2.asm:asm']
        )
        await this.writeManifest()
      }
    } else if (
      ['forge', 'neoforge'].includes(this.version.loader.name) &&
      this.version.loader.version
    ) {
      const installerPath = path.join(this.versionPath, `${this.version.loader.name}.jar`)

      try {
        await fs.access(installerPath)
      } catch (error) {
        await startDownload(
          [
            {
              url: this.version.loader.version.url,
              destination: installerPath,
              group: this.version.loader.name
            }
          ],
          this.settings.downloadLimit
        )
      }

      if (isNewManifest) {
        const tempPath = path.join(this.versionPath, 'temp')
        await fs.mkdir(tempPath, { recursive: true })
        await this.writeLauncherProfile()

        let forgeInstalled = false
        try {
          await electron.ipcRenderer.invoke(
            'runJar',
            this.javaPath,
            ['-jar', installerPath, '--installClient', '.'],
            tempPath
          )
          forgeInstalled = true
        } catch {}

        if (!forgeInstalled) {
          const installProfile = await readJSONFromArchive<IInstallProfile>(
            installerPath,
            'install_profile.json'
          )

          this.manifest.mainClass = installProfile.versionInfo.mainClass
          this.manifest.minecraftArguments = installProfile.versionInfo.minecraftArguments

          for (const lib of installProfile.versionInfo.libraries) {
            if (!lib.url) lib.url = 'https://libraries.minecraft.net/'

            let path = convertMavenCoordinateToJarPath(lib.name)

            if (path.includes('minecraftforge/forge')) {
              path = path.replace('.jar', `-universal.jar`)
            }

            const library: IVersionManifest['libraries'][0] = {
              name: lib.name,
              downloads: {
                artifact: {
                  url: `${lib.url}/${path}`,
                  path,
                  size: 0,
                  sha1: lib.checksums ? lib.checksums[0] : ''
                }
              }
            }

            this.manifest.libraries.push(library)
          }
        } else {
          isDownloadClient = false
          const versionsPath = path.join(tempPath, 'versions')

          await fs.copyFile(
            path.join(versionsPath, this.version.version.id, `${this.version.version.id}.jar`),
            path.join(this.versionPath, `${this.version.version.id}.jar`)
          )

          const forgeManifestPath = path.join(this.versionPath, `${this.version.loader.name}.json`)
          const forgeManifestName =
            this.version.loader.name == 'forge'
              ? `${this.version.version.id}-forge-${this.version.loader.version.id}`
              : `neoforge-${this.version.loader.version.id}`

          await fs.copyFile(
            path.join(versionsPath, forgeManifestName, `${forgeManifestName}.json`),
            forgeManifestPath
          )

          await fs.move(
            path.join(tempPath, 'libraries'),
            path.join(this.minecraftPath, 'libraries'),
            { overwrite: true }
          )

          const forgeManifest: IVersionManifest = await fs.readJSON(forgeManifestPath, 'utf-8')

          this.manifest.mainClass = forgeManifest.mainClass

          if (forgeManifest.arguments?.jvm && this.manifest.arguments?.jvm)
            this.manifest.arguments.jvm.push(...forgeManifest.arguments.jvm)

          if (forgeManifest.arguments?.game && this.manifest.arguments?.game)
            this.manifest.arguments.game.push(...forgeManifest.arguments.game)

          if (forgeManifest.minecraftArguments && this.manifest.minecraftArguments)
            this.manifest.minecraftArguments = forgeManifest.minecraftArguments

          this.manifest.libraries = this.removeDuplicateLibraries(
            [...forgeManifest.libraries, ...this.manifest.libraries],
            this.version.loader.name == 'forge'
              ? ['com.google.guava:guava', 'com.google.guava:failureaccess']
              : ['org.ow2.asm:asm', 'org.apache.logging.log4j:log4j-slf4j2-impl']
          )
        }

        await this.writeManifest()
        await rimraf(tempPath)
      }
    }

    if (isDownloadClient) {
      const clientPath = path.join(this.versionPath, `${this.version.version.id}.jar`)

      downloadItems.push({
        url: this.manifest.downloads.client.url,
        destination: clientPath,
        sha1: this.manifest.downloads.client.sha1,
        group: 'client'
      })
    }

    if (account.type != 'microsoft' && account.type != 'plain') {
      this.manifest.libraries.push({
        name: 'com.github.yushijinhun:authlib-injector:1.2.5',
        downloads: {
          artifact: {
            url: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar',
            path: 'com/github/yushijinhun/authlib-injector/1.2.5/authlib-injector-1.2.5.jar',
            size: 341970,
            sha1: '1eca6aa7faf7ac6e3211862afa6e43fe2eedd07b'
          }
        }
      })

      await this.writeManifest()
    }

    if (isNewManifest) {
      this.manifest.libraries = removeDuplicatesLibraries(this.manifest.libraries)
      await this.writeManifest()
    }

    const libraries = this.getLibraries()
    downloadItems.push(...libraries.downloadItems)

    const assetsIndex = this.manifest.assetIndex
    const assetsIndexPath = path.join(
      this.minecraftPath,
      'assets',
      'indexes',
      `${assetsIndex.id}.json`
    )

    await startDownload(
      [
        {
          url: assetsIndex.url,
          destination: assetsIndexPath,
          sha1: assetsIndex.sha1,
          group: 'assets'
        }
      ],
      this.settings.downloadLimit
    )

    const assets = await this.getAssets()
    downloadItems.push(...assets.downloadItems)

    await startDownload(downloadItems, this.settings.downloadLimit)

    const optionsPath = path.join(this.versionPath, 'options.txt')
    try {
      await fs.access(optionsPath)
    } catch {
      const lang = languages.find((l) => l.code == this.settings.lang)
      if (!lang) return

      await fs.writeFile(optionsPath, `lang:${getFullLangCode(lang)}`, 'utf-8')
    }
  }

  public async save() {
    this.versionPath = path.join(this.minecraftPath, 'versions', this.version.name)
    await fs.writeJSON(path.join(this.versionPath, 'version.json'), this.version, {
      encoding: 'utf-8',
      spaces: 2
    })
  }

  private getLibraries() {
    if (!this.manifest) return { downloadItems: [], paths: [] }

    const platform = getOS()
    if (!platform) return { downloadItems: [], paths: [] }

    const librariesPath = path.join(this.minecraftPath, 'libraries')

    const downloadItems: DownloadItem[] = []
    const paths: string[] = []

    const libraries = this.manifest.libraries

    for (const library of libraries) {
      let isAllow = true

      if (library.rules) {
        for (const rule of library.rules) {
          if (rule.action == 'allow') {
            if (rule.os && rule.os.name != platform?.os) {
              isAllow = false
              break
            }
          } else {
            if (rule.os && rule.os.name == platform?.os) {
              isAllow = false
              break
            }
          }
        }
      }

      if (!isAllow) continue

      if (library.name.includes('natives')) {
      }

      const natives = library.natives
      const artifact = library.downloads.artifact

      if (!natives) {
        const libraryPath = path.join(librariesPath, artifact.path)
        paths.push(libraryPath)
        downloadItems.push({
          url: artifact.url,
          destination: libraryPath,
          sha1: artifact.sha1,
          group: 'libraries'
        })
      } else {
        const native = natives[platform.os]?.replace('${arch}', '64')
        if (!native) continue

        const classifiers = library.downloads.classifiers
        if (!classifiers) continue

        const classifier = classifiers[native]
        const fileName = classifier.path.split('/').pop()
        if (!fileName) continue

        const classifierPath = path.join(this.versionPath, 'natives', fileName)

        downloadItems.push({
          url: classifier.url,
          destination: classifierPath,
          sha1: classifier.sha1,
          group: 'natives',
          options: { extract: true }
        })
      }
    }

    return { downloadItems, paths }
  }

  private removeDuplicateLibraries(
    libraries: IVersionManifest['libraries'],
    checkLibraries: string[]
  ): IVersionManifest['libraries'] {
    function compareVersions(version1: string, version2: string): number {
      const tokenize = (ver: string): (string | number)[] => {
        const parts = ver.split(/[-.]/)
        return parts.map((part) => {
          if (/^\d+$/.test(part)) return parseInt(part, 10)
          return part.toLowerCase()
        })
      }

      const v1Parts = tokenize(version1)
      const v2Parts = tokenize(version2)

      for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const part1 = v1Parts[i] ?? (typeof v1Parts[0] === 'number' ? 0 : '')
        const part2 = v2Parts[i] ?? (typeof v2Parts[0] === 'number' ? 0 : '')

        if (typeof part1 === 'number' && typeof part2 === 'number') {
          if (part1 < part2) return -1
          if (part1 > part2) return 1
        } else if (typeof part1 === 'string' && typeof part2 === 'string') {
          const cmp = part1.localeCompare(part2)
          if (cmp !== 0) return cmp
        } else if (typeof part1 === 'number') {
          return -1
        } else if (typeof part2 === 'number') {
          return 1
        }
      }

      return 0
    }

    const libraryMap = new Map<string, IVersionManifest['libraries'][0]>()
    const otherLibs: IVersionManifest['libraries'] = []

    for (const lib of libraries) {
      const [groupId, artifactId] = lib.name.split(':')
      const key = `${groupId}:${artifactId}`

      const shouldCheck = checkLibraries.some((checkLib) => lib.name.startsWith(checkLib))

      if (shouldCheck) {
        const existingLib = libraryMap.get(key)

        if (!existingLib) {
          libraryMap.set(key, lib)
        } else {
          const existingVersion = existingLib.name.split(':')[2]
          const currentVersion = lib.name.split(':')[2]
          if (compareVersions(currentVersion, existingVersion) > 0) {
            libraryMap.set(key, lib)
          }
        }
      } else {
        otherLibs.push(lib)
      }
    }

    return [...Array.from(libraryMap.values()), ...otherLibs]
  }

  private async readManifest() {
    const manifestPath = path.join(this.versionPath, `${this.version.version.id}.json`)

    try {
      this.manifest = await fs.readJSON(manifestPath, 'utf-8')

      if (this.manifest?.arguments?.game)
        for (let i = 0; i < this.manifest.arguments.game.length; i++) {
          const a = this.manifest.arguments.game[i]
          if (typeof a != 'object') continue
          if (!a.rules) continue

          const rule = a.rules[0]
          if (rule.action == 'allow' && rule.features.is_quick_play_multiplayer)
            this.isQuickPlayMultiplayer = true

          if (rule.action == 'allow' && rule.features.is_quick_play_singleplayer)
            this.isQuickPlaySingleplayer = true
        }
    } catch (error) {}
  }

  private async writeManifest() {
    if (!this.manifest) return

    const manifestPath = path.join(this.versionPath, `${this.version.version.id}.json`)
    await fs.writeJSON(manifestPath, this.manifest, {
      encoding: 'utf-8',
      spaces: 2
    })
  }

  private async getAssets() {
    if (!this.manifest) return { downloadItems: [], paths: [] }

    const downloadItems: DownloadItem[] = []
    const paths: string[] = []

    const assetsIndex = this.manifest.assetIndex
    const assetsIndexPath = path.join(
      this.minecraftPath,
      'assets',
      'indexes',
      `${assetsIndex.id}.json`
    )

    const assets: IAssetIndex = await fs.readJSON(assetsIndexPath, 'utf-8')

    for (const [_, value] of Object.entries(assets.objects)) {
      const hash = value.hash
      const subHash = hash.substring(0, 2)
      const assetPath = path.join(this.minecraftPath, 'assets', 'objects', subHash, hash)

      paths.push(assetPath)
      downloadItems.push({
        url: `https://resources.download.minecraft.net/${subHash}/${hash}`,
        destination: assetPath,
        sha1: hash,
        group: 'assets'
      })
    }

    return { downloadItems, paths }
  }

  private async getRunArguments(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    quickSingle?: string,
    quickMultiplayer?: string
  ) {
    if (!this.manifest)
      return {
        jvm: [],
        game: []
      }

    const platform = getOS()
    const separator = platform?.os == 'windows' ? ';' : ':'

    const appData = path.join(await getPath('appData'), '.grubielauncher')
    const authinjPath = path.join(
      appData,
      'minecraft',
      'libraries',
      'com',
      'github',
      'yushijinhun',
      'authlib-injector',
      '1.2.5',
      'authlib-injector-1.2.5.jar'
    )
    let jvm: string[] = []
    let game: string[] = []

    if (account.type && account.type != 'microsoft' && account.type != 'plain') {
      jvm.push(getJavaAgent(account.type, authinjPath))
    }

    if (this.isQuickPlaySingleplayer && quickSingle)
      game.push(...['--quickPlaySingleplayer', quickSingle])

    if (this.isQuickPlayMultiplayer && (quickMultiplayer || this.version.quickServer))
      game.push(...['--quickPlayMultiplayer', quickMultiplayer || this.version.quickServer || ''])

    jvm.push(...['-Xms1G', `-Xmx${settings.xmx}M`])

    if (this.manifest.minecraftArguments) {
      jvm.push(...['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'])
      game.push(...this.manifest.minecraftArguments.split(' '))
    }

    if (this.manifest.arguments?.jvm)
      for (const arg of this.manifest.arguments.jvm) {
        if (typeof arg === 'string') {
          jvm.push(arg)
          continue
        }

        if (arg.rules) {
          let isAllow = true

          for (const rule of arg.rules) {
            if (rule.action === 'allow' && rule.os?.name != platform?.os) {
              isAllow = false
              break
            }
          }

          if (!isAllow || !arg.value) continue

          if (typeof arg.value == 'string') jvm.push(arg.value)
          else jvm.push(...arg.value)
        }
      }

    if (this.manifest.arguments?.game)
      for (const arg of this.manifest.arguments.game) {
        if (typeof arg === 'string') {
          game.push(arg)
          continue
        }
      }

    const paths = [
      path.join(this.versionPath, `${this.version.version.id}.jar`),
      ...this.getLibraries().paths
    ]

    jvm = jvm.map((arg) => {
      if (!this.manifest) return ''

      return arg
        .replace(/\${natives_directory}/g, path.join(this.versionPath, 'natives'))
        .replace(/\${launcher_name}/g, 'GrubieLauncher')
        .replace(/\${launcher_version}/g, '0.1')
        .replace(/\${classpath}/g, paths.join(separator))
        .replace(/\${library_directory}/g, path.join(this.minecraftPath, 'libraries'))
        .replace(/\${classpath_separator}/g, separator)
        .replace(/\${version_name}/g, this.version.version.id)
    })

    if (!authData) {
      const uuid = generateOfflineUUID(account.nickname)

      authData = {
        nickname: account.nickname,
        uuid,
        exp: 0,
        sub: uuid,
        auth: {
          accessToken: uuid,
          refreshToken: '',
          expiresAt: 0,
          createdAt: 0
        }
      }
    }

    game = game.map((arg) => {
      if (!this.manifest) return ''

      let accessToken = authData.auth.accessToken
      if (account.type == 'discord') accessToken = account.accessToken || authData.uuid

      return arg
        .replace(/\${auth_player_name}/g, account.nickname || authData.nickname)
        .replace(/\${version_name}/g, this.version.version.id)
        .replace(/\${game_directory}/g, this.versionPath)
        .replace(/\${assets_root}/g, path.join(this.minecraftPath, 'assets'))
        .replace(/\${assets_index_name}/g, this.manifest.assetIndex.id)
        .replace(/\${auth_uuid}/g, authData.uuid)
        .replace(/\${auth_access_token}/g, accessToken)
        .replace(/\${clientid}/g, 'grubie-launcher')
        .replace(/\${auth_xuid}/g, authData.uuid)
        .replace(/\${user_type}/g, account.type == 'microsoft' ? 'msa' : account.type)
        .replace(/\${version_type}/g, this.manifest.type)
        .replace(/\${user_properties}/g, '{}')
    })

    if (this.version.runArguments) {
      jvm.push(...this.version.runArguments.jvm.split(' '))
      game.push(...this.version.runArguments.game.split(' '))
    }

    return { jvm, game }
  }

  public async getRunCommand(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    isRelative: boolean = false,
    quickSingle?: string,
    quickMultiplayer?: string
  ) {
    if (!this.manifest) return null

    const runArguments = await this.getRunArguments(
      account,
      settings,
      authData,
      quickSingle,
      quickMultiplayer
    )

    const command = [
      this.javaPath,
      ...runArguments.jvm,
      this.manifest.mainClass,
      ...runArguments.game
    ]

    const normalizePath = (path: string) => path.replace(/\\/g, '/')

    if (isRelative) {
      command[0] = command[0].replace(this.javaPath, '${javaPath}')
      for (let i = 1; i < command.length; i++) {
        const normalized = normalizePath(command[i])
        const normalizedMinecraftPath = normalizePath(this.minecraftPath)
        command[i] = normalized.replaceAll(normalizedMinecraftPath, '${minecraftPath}')
      }
    }

    return command.filter((arg) => arg != '')
  }

  public async run(
    account: ILocalAccount,
    settings: TSettings,
    authData: IAuth | null,
    instance: number,
    quick: {
      single?: string
      multiplayer?: string
    }
  ) {
    const command = await this.getRunCommand(
      account,
      settings,
      authData,
      false,
      quick.single,
      quick.multiplayer
    )
    if (!command) return

    await electron.ipcRenderer.invoke(
      'runGame',
      command[0],
      command.slice(1),
      this.versionPath,
      this.version.name,
      instance
    )
  }

  private async writeLauncherProfile() {
    const data = {
      profiles: {},
      clientToken: '',
      authenticationDatabase: {},
      selectedUser: '',
      launcherVersion: {
        name: '1.5.3',
        format: 17
      }
    }

    await fs.writeJSON(path.join(this.versionPath, 'temp', 'launcher_profiles.json'), data, {
      encoding: 'utf-8',
      spaces: 2
    })
  }

  public async delete(isFull: boolean = false) {
    if (!isFull) return await rimraf(this.versionPath)

    const libraries = this.getLibraries()
    const assets = await this.getAssets()

    await rimraf([...libraries.paths, ...assets.paths])
    await rimraf(this.versionPath)

    return true
  }
}
