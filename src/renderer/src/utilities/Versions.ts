import { getDirectories } from './Files'
import { ILocalProject } from '@/types/ModManager'
import { Backend } from '@renderer/services/Backend'
import { IArguments } from '@/types/IArguments'
import { checkModpack, compareMods } from './ModManager'
import { forbiddenSymbols } from './Other'
import { Version } from '@renderer/game/Version'
import { Mods } from '@renderer/game/Mods'
import { readNBT, writeNBT } from './Nbt'
import { IImportModpack, IVersionConf } from '@/types/IVersion'
import { TSettings } from '@/types/Settings'
import { ILocalAccount } from '@/types/Account'
import { IServer } from '@/types/ServersList'
import { compareServers } from './ServerList'

const api = window.api
const fs = api.fs
const path = api.path
const rimraf = api.rimraf
const extractAll = api.extractAll

export async function importVersion(filePath: string, tempPath: string): Promise<IImportModpack> {
  const versionName = path.basename(filePath, path.extname(filePath))
  const versionPath = path.join(tempPath, versionName)

  await extractAll(filePath, versionPath)
  console.log(versionPath, 'version path')

  const confPath = path.join(versionPath, 'version.json')
  if (!fs.pathExistsSync(confPath)) {
    const modpack = await checkModpack(versionPath)

    if (!modpack) {
      await rimraf(versionPath)
      throw Error('not modpack')
    }

    return {
      type: 'other',
      other: modpack
    }
  }

  const conf: IVersionConf = await fs.readJSON(confPath, 'utf-8')

  if (conf.image.includes('file://')) {
    conf.image = `file://${path.join(versionPath, 'logo.png')}`
  }

  const servers = await readNBT(path.join(versionPath, 'servers.dat'))
  console.log(servers)

  const optionsPath = path.join(versionPath, 'options.txt')
  let options = ''

  if (await fs.pathExists(optionsPath)) options = await fs.readFile(optionsPath, 'utf-8')

  return {
    type: 'gl',
    gl: {
      path: versionPath,
      conf,
      servers,
      options
    }
  }
}

export async function readVerions(
  launcherPath: string,
  settings: TSettings,
  account: ILocalAccount | null
) {
  const versionsPath = path.join(launcherPath, 'minecraft', 'versions')
  const directories = await getDirectories(versionsPath)
  const versions: Version[] = []

  for (let index = 0; index < directories.length; index++) {
    const directory = directories[index]

    const confPath = path.join(versionsPath, directory, 'version.json')

    if (!(await fs.pathExists(confPath))) continue

    const conf: IVersionConf = await fs.readJSON(confPath, 'utf-8')

    if (conf.name != directory) conf.name = directory

    const version = new Version(settings, conf)

    await version.init()

    if (!version.manifest) continue

    let isUpdated = false

    if (!conf.owner && account) {
      version.version.owner = `${account.type}_${account.nickname}`
      isUpdated = true
    }

    if (isUpdated) await version.save()

    versions.push(version)
  }

  return versions
}

export async function checkDiffenceUpdateData({
  version,
  versionPath,
  servers,
  mods,
  runArguments,
  logo,
  quickServer
}: {
  version: IVersionConf
  versionPath: string
  servers: IServer[]
  mods: ILocalProject[]
  runArguments: IArguments
  logo: string
  quickServer: string | undefined
}) {
  if (!version.shareCode) return ''

  const isOwner = !version.downloadedVersion && version.shareCode

  let diff = ''
  const backend = new Backend()

  const modpackData = await backend.getModpack(version.shareCode)
  if (!modpackData.data) throw Error('not found')

  const modpack = modpackData.data

  if (isOwner && modpack.conf.name != version.name) diff += 'name' + ', '

  if (modpack.conf.image !== logo) diff += 'logo' + ', '

  if (!compareMods(modpack.conf.loader.mods, mods)) diff += 'mods' + ', '
  if (
    !compareServers(modpack.conf.servers, servers) ||
    modpack.conf.quickServer != (quickServer || '')
  )
    diff += 'servers' + ', '

  if (
    (modpack.conf?.runArguments?.game || '') != runArguments.game ||
    (modpack.conf?.runArguments?.jvm || '') != runArguments.jvm
  )
    diff += 'arguments' + ', '

  const optionsPath = path.join(versionPath, 'options.txt')
  let options = ''

  if (await fs.pathExists(optionsPath)) options = await fs.readFile(optionsPath, 'utf-8')

  if (isOwner && modpack.conf.options != options) diff += 'options' + ', '

  if (isOwner) diff += 'other' + ', '
  else {
    if (modpack.conf.loader.other?.size != version.loader.other?.size) diff += 'other' + ', '
  }

  console.log(diff, 'diff')

  return diff
}

export function checkVersionName(
  versionName: string,
  versions: Version[],
  selectedVersion?: IVersionConf,
  isDownloaded?: boolean
) {
  const name = versionName.trim()

  if (name == '' && selectedVersion) return false

  if (name.length > 32) return false

  if (
    !!versions.find((v) => v.version.name.toLocaleLowerCase() == name.toLocaleLowerCase()) &&
    (selectedVersion ? name != selectedVersion?.name || (!selectedVersion && isDownloaded) : true)
  )
    return false

  for (let index = 0; index < forbiddenSymbols.length; index++) {
    const s = forbiddenSymbols[index]
    if (name.trim().includes(s)) return false
  }

  return true
}

export async function syncShare(version: Version, servers: IServer[], downloadLimit: number) {
  if (!version || !version.version.shareCode) throw Error('not selected version')

  const backend = new Backend()
  const modpackData = await backend.getModpack(version.version.shareCode)
  if (!modpackData.data) throw Error('not share version')

  const modpack = modpackData.data

  let isOther = false
  if (modpack.conf.loader.other?.size != version.version.loader.other?.size) {
    version.version.loader.other = modpack.conf.loader.other
    isOther = true
  }

  if (!compareMods(version.version.loader.mods, modpack.conf.loader.mods) || isOther) {
    version.version.loader.mods = modpack.conf.loader.mods

    const versionMods = new Mods(downloadLimit, version)

    await versionMods.check()
    if (isOther) await versionMods.downloadOther()
  }

  if (!compareServers(modpack.conf.servers, servers)) {
    const serversPath = path.join(version.versionPath, 'servers.dat')
    await writeNBT(modpack.conf.servers, serversPath)
  }

  if (modpack.build != version.version.build) {
    version.version.build = modpack.build
  }

  if (modpack.conf.image != version.version.image) {
    const logoPath = path.join(version.versionPath, 'logo.png')
    version.version.image = modpack.conf.image
    if (modpack.conf.image) {
      const newFile = await fetch(modpack.conf.image).then((r) => r.blob())
      await fs.writeFile(logoPath, new Uint8Array(await newFile.arrayBuffer()))
    } else {
      await rimraf(logoPath)
    }
  }

  if (modpack.conf.runArguments != version.version.runArguments) {
    version.version.runArguments = modpack.conf.runArguments
  }

  if (modpack.conf.quickServer != version.version.quickServer) {
    version.version.quickServer = modpack.conf.quickServer
  }

  await version.save()
  return version
}
