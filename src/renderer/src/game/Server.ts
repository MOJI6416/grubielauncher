import { IServerConf, ServerCore } from '@/types/Server'
import { Java } from './Java'
import { IVersionConf } from '@/types/IVersion'
import { ILocalAccount } from '@/types/Account'
import { getJavaAgent } from '@renderer/utilities/Other'

const api = window.api
const fs = api.fs
const path = api.path
const rimraf = api.rimraf
const startDownload = api.startDownload
const electron = window.electron

export class ServerGame {
  private serverPath: string = ''
  private version: IVersionConf | undefined = undefined
  private serverConf: IServerConf | null = null
  private versionPath: string = ''
  private downloadLimit: number = 6
  private account: ILocalAccount | undefined = undefined

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
  }

  async runServer(isInstall: boolean = false) {
    if (!this.serverConf) return

    const java = new Java(this.serverConf.javaMajorVersion)
    await java.init()

    if (!isInstall) {
      return await electron.ipcRenderer.invoke('runServer', this.serverPath, this.version?.name)
    } else {
      if (!this.version || !this.account) return

      const jar = `${this.serverConf.core}.jar`

      let cwd = this.serverPath
      const injectorPath = path.join(
        'libraries',
        'com',
        'github',
        'yushijinhun',
        'authlib-injector',
        '1.2.5',
        'authlib-injector-1.2.5.jar'
      )
      let javaagent = ''

      let params = ['-jar', jar]
      if (this.serverConf.core == ServerCore.QUILT) {
        params.push(...['install', 'server', this.version.version.id, '--download-server'])
        cwd = this.versionPath
      } else if (
        this.serverConf.core == ServerCore.FORGE ||
        this.serverConf.core == ServerCore.NEOFORGE ||
        (this.serverConf.core == ServerCore.SPONGE && this.version?.loader.name == 'forge')
      ) {
        params.push('--installServer')
      }

      await electron.ipcRenderer.invoke('installServer', java.javaServerPath, params, cwd)

      if (this.account.type != 'microsoft' && this.account.type != 'plain') {
        javaagent = `${getJavaAgent(this.account.type, `${injectorPath}`, true)} `

        await startDownload(
          [
            {
              url: 'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar',
              destination: path.join(this.serverPath, injectorPath),
              group: 'server'
            }
          ],
          this.downloadLimit
        )
      }

      const batPath = path.join(this.serverPath, 'run.bat')
      const shPath = path.join(this.serverPath, 'run.sh')

      let isCreateRunFiles = true
      if (this.serverConf.core == ServerCore.QUILT) {
        await rimraf(jar)
        await fs.rename(path.join(this.serverPath, 'quilt-server-launch.jar'), jar)
      } else if (
        this.serverConf.core == ServerCore.FORGE ||
        this.serverConf.core == ServerCore.NEOFORGE ||
        (this.serverConf.core == ServerCore.SPONGE && this.version?.loader.name == 'forge')
      ) {
        const version = this.version?.version.id
        const serverJar = path.join(this.serverPath, `minecraft_server.${version}.jar`)

        try {
          await fs.access(serverJar)
          await rimraf(jar)
          await fs.rename(serverJar, jar)
        } catch {
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
        }

        if (
          this.serverConf.downloads.additionalPackage &&
          this.serverConf.core == ServerCore.SPONGE &&
          this.version?.loader.name == 'forge'
        ) {
          const urlParts = this.serverConf.downloads.additionalPackage.split('/')
          const fileName = urlParts[urlParts.length - 1]

          await startDownload(
            [
              {
                url: this.serverConf.downloads.additionalPackage,
                destination: path.join(this.serverPath, 'mods', fileName),
                group: 'server'
              }
            ],
            this.downloadLimit
          )
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
}
