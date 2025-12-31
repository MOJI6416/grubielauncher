import { checkModpack } from './modManager'
import { readNBT } from './nbt'
import { IImportModpack, IVersionConf } from '@/types/IVersion'
import path from 'path'
import fs from 'fs-extra'
import { rimraf } from 'rimraf'
import { extractZip } from './archiver'

export async function importVersion(filePath: string, tempPath: string): Promise<IImportModpack> {
  const versionName = path.basename(filePath, path.extname(filePath))
  const versionPath = path.join(tempPath, versionName)

  await extractZip(filePath, versionPath)

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
