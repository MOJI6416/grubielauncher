import { IServerConf, ServerCore } from '@/types/Server'
import { Java } from './Java'
import { IVersionConf } from '@/types/IVersion'
import { ILocalAccount } from '@/types/Account'
import path from 'path'
import { getJavaAgent } from '../utilities/other'
import { Downloader } from '../utilities/downloader'
import { rimraf } from 'rimraf'
import fs from 'fs-extra'
import { installServer } from '../utilities/game'
import { Backend } from '../services/Backend'

export class ServerGame {
  private serverPath: string = ''
  private version: IVersionConf | undefined = undefined
  private serverConf: IServerConf | null = null
  private versionPath: string = ''
  private downloadLimit: number = 6
  private account: ILocalAccount | undefined = undefined
  private downloader: Downloader

  constructor(
    account: ILocalAccount | undefined,
    downloadLimit: number,
    versionPath: string,
    serverPath: string,
    conf: IServerConf,
    version?: IVersionConf
  ) {
    this.account = account
    this.versionPath = versionPath
    this.serverPath = serverPath
    this.version = version
    this.serverConf = conf
    this.downloadLimit = downloadLimit
    this.downloader = new Downloader(this.downloadLimit)
  }

  async install() {
    if (!this.serverConf) return

    const java = new Java(this.serverConf.javaMajorVersion)
    await java.init()

    if (!this.version || !this.account) return

    const jar = `${this.serverConf.core}.jar`

    let cwd = this.serverPath
    const backend = new Backend()
    const authlib = await backend.getAuthlib()

    let javaagent = ''

    let params = ['-jar', jar]
    if (this.serverConf.core == ServerCore.QUILT) {
      params.push(...['install', 'server', this.version.version.id, '--download-server'])
      cwd = this.versionPath
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      params.push('--installServer')
    }

    await installServer(java.javaServerPath, params, cwd)

    if (this.account.type != 'microsoft' && this.account.type != 'plain' && authlib) {
      javaagent = `${getJavaAgent(this.account.type, `${path.join('libraries', authlib.path)}`, true)} `

      await this.downloader.downloadFiles([
        {
          url: authlib.url,
          destination: path.join(this.serverPath, 'libraries', authlib.path),
          group: 'server',
          sha1: authlib.sha1,
          size: authlib.size
        }
      ])
    }

    const batPath = path.join(this.serverPath, 'run.bat')
    const shPath = path.join(this.serverPath, 'run.sh')

    let isCreateRunFiles = true
    if (this.serverConf.core == ServerCore.QUILT) {
      await rimraf(jar)
      await fs.rename(path.join(this.serverPath, 'quilt-server-launch.jar'), jar)
    } else if (
      this.serverConf.core == ServerCore.FORGE ||
      this.serverConf.core == ServerCore.NEOFORGE
    ) {
      const version = this.version?.version.id
      const serverJar = path.join(this.serverPath, `minecraft_server.${version}.jar`)

      const isExists = await fs.pathExists(serverJar)
      if (!isExists) {
        isCreateRunFiles = false

        const batData = await fs.readFile(batPath, 'utf-8')
        await fs.writeFile(
          batPath,
          batData.replaceAll('java', java.javaServerPath).replaceAll('%*', 'nogui %*'),
          'utf-8'
        )

        const shData = await fs.readFile(shPath, 'utf-8')
        await fs.writeFile(
          shPath,
          shData.replaceAll('java', java.javaServerPath).replaceAll('"$@"', 'nogui "$@"'),
          'utf-8'
        )

        const jvmArgs = path.join(this.serverPath, 'user_jvm_args.txt')
        await fs.writeFile(jvmArgs, `${javaagent}-Xmx${this.serverConf.memory}M`, 'utf-8')
      } else {
        await rimraf(jar)
        await fs.rename(serverJar, jar)
      }
    }

    if (isCreateRunFiles) {
      const batData = `@echo off
${java.javaServerPath} ${javaagent} -Xmx${this.serverConf.memory}M -jar ${jar} nogui
pause`

      const shData = `#!/bin/sh
${java.javaServerPath} ${javaagent} -Xmx${this.serverConf.memory}M -jar ${jar} nogui
read -p "Press [Enter] key to continue..."`

      await fs.writeFile(batPath, batData, 'utf-8')
      await fs.writeFile(shPath, shData, 'utf-8')
      await fs.chmod(shPath, 0o755)
    }

    return
  }
}
