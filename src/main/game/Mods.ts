import { Version } from './Version'
import { IServerConf, ServerCore } from '@/types/Server'
import { ProjectType } from '@/types/Modrinth'
import { DownloadItem } from '@/types/Downloader'
import path from 'path'
import fs from 'fs-extra'
import { Downloader } from '../utilities/downloader'
import { rimraf } from 'rimraf'
import { IVersionConf } from '@/types/IVersion'
import { TSettings } from '@/types/Settings'
import { projetTypeToFolder } from '../utilities/modManager'
import { getWorldName } from '../utilities/worlds'

export class Mods {
  private conf: IVersionConf
  private version: Version
  private server: IServerConf | undefined
  private files: {
    filename: string
    type: ProjectType
  }[] = []
  private downloadLimit = 6
  private downloader: Downloader

  constructor(settings: TSettings, version: IVersionConf, server?: IServerConf) {
    this.conf = version
    this.server = server
    this.downloadLimit = settings.downloadLimit
    this.downloader = new Downloader(this.downloadLimit)

    this.version = new Version(settings, this.conf)
    this.version.init()
  }

  async check() {
    const storagePath = path.join(this.version.versionPath, 'storage')

    const downloadFiles: DownloadItem[] = []
    const worlds: string[] = []

    for (const mod of this.version.version.loader.mods) {
      if (!mod.version || mod.id == 'sponge-core') continue

      const folderName = projetTypeToFolder(mod.projectType)
      let folderPath = path.join(this.version.versionPath, folderName)

      if (mod.projectType == ProjectType.PLUGIN) {
        if (!this.server) continue

        const serverPath = path.join(this.version.versionPath, 'server')
        folderPath = path.join(serverPath, folderName)

        if (this.server.core == ServerCore.SPONGE) {
          folderPath = path.join(serverPath, 'mods', folderName)
        }
      }

      for (const file of mod.version.files) {
        let filepath = path.join(folderPath, file.filename)

        if (mod.projectType == ProjectType.WORLD) {
          filepath = path.join(storagePath, 'worlds', file.filename)
          const existsStorage = (await fs.pathExists(filepath)) ? filepath : null
          const existsUrl = file.localPath
            ? (await fs.pathExists(file.localPath))
              ? file.localPath
              : null
            : null

          const zipPath = existsStorage || existsUrl
          if (zipPath) {
            const worldName = await getWorldName(zipPath)
            if (worldName) {
              worlds.push(worldName)

              this.files.push({
                filename: worldName,
                type: ProjectType.WORLD
              })
            }
          }
        }

        this.files.push({
          filename: file.filename,
          type: mod.projectType
        })

        downloadFiles.push({
          destination: filepath,
          url: file.localPath ? `file://${file.localPath}` : file.url,
          group: 'mods',
          sha1: file.sha1,
          size: file.size,
          options:
            mod.projectType == ProjectType.WORLD
              ? {
                  extract: true,
                  extractFolder: folderPath,
                  extractDelete: false
                }
              : undefined
        })

        if (
          this.server &&
          [
            ServerCore.FABRIC,
            ServerCore.QUILT,
            ServerCore.FORGE,
            ServerCore.NEOFORGE,
            ServerCore.SPONGE
          ].includes(this.server.core) &&
          ProjectType.MOD == mod.projectType &&
          file.isServer
        ) {
          const fileServerPath = path.join(
            this.version.versionPath,
            'server',
            folderName,
            file.filename
          )

          downloadFiles.push({
            destination: fileServerPath,
            url: file.url,
            group: 'mods',
            sha1: file.sha1,
            size: file.size
          })
        }
      }
    }

    await this.downloader.downloadFiles(downloadFiles)

    for (const world of worlds) {
      const worldPath = path.join(this.version.versionPath, 'saves', world)
      if (await fs.pathExists(worldPath)) {
        const dlFilePath = path.join(worldPath, '.downloaded')
        if (!(await fs.pathExists(dlFilePath))) await fs.writeFile(dlFilePath, '')
      }
    }

    this.comparison(ProjectType.MOD)
    this.comparison(ProjectType.RESOURCEPACK)
    this.comparison(ProjectType.SHADER)
    this.comparison(ProjectType.WORLD)
    this.comparison(ProjectType.DATAPACK)

    if (
      this.server &&
      [ServerCore.BUKKIT, ServerCore.SPIGOT, ServerCore.PAPER, ServerCore.SPONGE].includes(
        this.server.core
      )
    )
      this.comparison(ProjectType.PLUGIN)
  }

  private async comparison(projectType: ProjectType) {
    const storagePath = path.join(this.version.versionPath, 'storage')
    const folderName = projetTypeToFolder(projectType)

    let folderPath = path.join(this.version.versionPath, folderName)
    if (this.server && projectType == ProjectType.PLUGIN) {
      const serverPath = path.join(this.version.versionPath, 'server')

      folderPath = path.join(serverPath, folderName)
      if (this.server.core == ServerCore.SPONGE) {
        folderPath = path.join(serverPath, 'mods', folderName)
      }
    }

    const isExists = await fs.pathExists(folderPath)
    if (!isExists) return

    const filenames = this.files.filter((f) => f.type == projectType).map((f) => f.filename)
    const files = await fs.readdir(folderPath)
    const deleteFiles: string[] = []

    for (const file of files) {
      const filePath = path.join(folderPath, file)
      const isDirectory = fs.lstatSync(filePath).isDirectory()

      if (
        projectType == ProjectType.WORLD &&
        isDirectory &&
        !(await fs.pathExists(path.join(filePath, '.downloaded')))
      )
        continue

      if (
        (isDirectory && projectType != ProjectType.WORLD) ||
        filenames.includes(file.replace('.disabled', ''))
      )
        continue

      deleteFiles.push(filePath)
    }

    if (projectType == ProjectType.WORLD) {
      const worldsPath = path.join(storagePath, 'worlds')
      const files = await fs.readdir(worldsPath)

      for (const file of files)
        if (!filenames.includes(file)) deleteFiles.push(path.join(worldsPath, file))
    }

    await rimraf(deleteFiles)
  }

  async downloadOther() {
    if (!this.version.version.loader.other) return

    const tempPath = path.join(this.version.versionPath, 'temp')

    await this.downloader.downloadFiles([
      {
        destination: path.join(tempPath, 'other.zip'),
        group: 'other',
        url: this.version.version.loader.other.url,
        options: {
          extract: true,
          extractFolder: this.version.versionPath
        }
      }
    ])
    await rimraf(tempPath)
  }
}
