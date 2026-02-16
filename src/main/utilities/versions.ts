import { checkModpack } from './modManager'
import { readNBT } from './nbt'
import { IImportModpack, IVersionConf } from '@/types/IVersion'
import path from 'path'
import fs from 'fs-extra'
import { rimraf } from 'rimraf'
import { extractZip } from './archiver'
import { pathToFileURL } from 'url'

export async function importVersion(filePath: string, tempPath: string): Promise<IImportModpack> {
  const versionName = path.basename(filePath, path.extname(filePath))
  if (!versionName) {
    throw Error('invalid file name')
  }

  await fs.ensureDir(tempPath)

  const versionPath = path.join(tempPath, versionName)

  if (await fs.pathExists(versionPath)) {
    await rimraf(versionPath).catch(() => {})
  }

  try {
    await extractZip(filePath, versionPath)

    const confPath = path.join(versionPath, 'version.json')
    const hasConf = await fs.pathExists(confPath)

    if (!hasConf) {
      const modpack = await checkModpack(versionPath)

      if (!modpack) {
        await rimraf(versionPath).catch(() => {})
        throw Error('not modpack')
      }

      return {
        type: 'other',
        other: modpack
      }
    }

    const conf: IVersionConf = await fs.readJSON(confPath, 'utf-8')

    if (typeof conf.image === 'string' && conf.image.startsWith('file://')) {
      conf.image = pathToFileURL(path.join(versionPath, 'logo.png')).href
    }

    const servers = await readNBT(path.join(versionPath, 'servers.dat'))

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
  } catch (err) {
    if (await fs.pathExists(versionPath)) {
      await rimraf(versionPath).catch(() => {})
    }
    throw err
  }
}
