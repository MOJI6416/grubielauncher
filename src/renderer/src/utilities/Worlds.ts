import { IWorld, IWorldStatistics } from '@/types/World'
import { toUUID } from './Other'
import { IAuth, ILocalAccount } from '@/types/Account'
import { jwtDecode } from 'jwt-decode'
import { deserialize, serialize } from '@xmcl/nbt'

const api = window.api
const fs = api.fs
const path = api.path
const generateOfflineUUID = api.generateOfflineUUID
const zlib = api.zlib

export async function loadStatistics(
  worldPath: string,
  account: ILocalAccount
): Promise<IWorldStatistics | undefined> {
  let accountUUID: string

  if (account.accessToken) {
    const decode = jwtDecode<IAuth>(account.accessToken)

    if (decode.uuid.includes('-')) accountUUID = decode.uuid
    else accountUUID = toUUID(decode.uuid)
  } else accountUUID = toUUID(generateOfflineUUID(account.nickname))

  const statisticsPath = path.join(worldPath, 'stats', `${accountUUID}.json`)
  if (!(await fs.pathExists(statisticsPath))) return

  try {
    const stats: IWorldStatistics = await fs.readJSON(statisticsPath)
    return stats
  } catch (error) {
    console.error('Failed to load world statistics:', error)
    return
  }
}

export async function readWorld(worldPath: string, account: ILocalAccount): Promise<IWorld | null> {
  try {
    const levelDatPath = path.join(worldPath, 'level.dat')
    const datapacksPath = path.join(worldPath, 'datapacks')
    const iconPath = path.join(worldPath, 'icon.png')

    const levelData = await fs.readFile(levelDatPath)
    const u = new Uint8Array(levelData)

    const decompressed = zlib.gunzipSync(u)
    const nbtData: any = await deserialize(decompressed)

    const name = nbtData?.Data?.LevelName ?? null
    const seed = String(nbtData?.Data?.WorldGenSettings?.seed ?? nbtData?.Data?.RandomSeed ?? null)
    if (!name || !seed) {
      return null
    }

    let icon: string | undefined
    if (await fs.pathExists(iconPath)) icon = `file://${iconPath}`

    const datapacks = await fs.readdir(datapacksPath)

    return {
      name,
      seed,
      icon,
      datapacks,
      statistics: await loadStatistics(worldPath, account),
      isDownloaded: await fs.pathExists(path.join(worldPath, '.downloaded')),
      path: worldPath,
      folderName: path.basename(worldPath)
    }
  } catch (err) {
    console.error('Ошибка чтения названия мира:', err)
    return null
  }
}

export async function writeWorldName(worldPath: string, newName: string): Promise<string | null> {
  try {
    const levelDatPath = path.join(worldPath, 'level.dat')
    const fileData = await fs.readFile(levelDatPath)
    const u = new Uint8Array(fileData)

    const decompressed = zlib.gunzipSync(u)
    const nbtData: any = await deserialize(decompressed)

    if (nbtData?.Data) {
      nbtData.Data.LevelName = newName
    } else {
      console.error('Не найдена секция Data в level.dat')
      return null
    }

    const modifiedBuffer = await serialize(nbtData)
    const compressed = zlib.gzipSync(new Uint8Array(modifiedBuffer))

    await fs.writeFile(levelDatPath, compressed)

    const newFolderName = newName.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
    const newWorldPath = path.join(path.dirname(worldPath), newFolderName)

    if (await fs.pathExists(newWorldPath)) return worldPath

    if (newWorldPath !== worldPath) {
      await fs.rename(worldPath, newWorldPath)
    }

    return newWorldPath
  } catch (err) {
    console.error('Ошибка изменения названия мира:', err)
    return null
  }
}
