import { IServer } from '@/types/ServersList'
import { deserialize, serialize, setPrototypeOf, TagType } from '@xmcl/nbt'
import fs from 'fs-extra'
import path from 'path'
import { randomUUID } from 'crypto'

const serverInfoSchema = {
  name: TagType.String,
  ip: TagType.String,
  icon: TagType.String,
  acceptTextures: TagType.Byte,
  hidden: TagType.Byte
}

const serversDatSchema = {
  servers: [serverInfoSchema]
}

export class ServersDatParseError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Failed to parse servers.dat: ${filePath}`)
    this.name = 'ServersDatParseError'
    this.cause = cause
  }
}

function normalizeByteFlag(value: unknown): number | null {
  return value === 0 || value === 1 ? value : null
}

export async function writeNBT(servers: IServer[], filePath: string) {
  const data = {
    servers: servers.map((s) => {
      const server: {
        name: string
        ip: string
        icon: string
        acceptTextures?: number
        hidden?: number
      } = {
        name: s.name,
        ip: s.ip,
        icon: s.icon || ''
      }

      const acceptTextures = normalizeByteFlag(s.acceptTextures)
      if (acceptTextures !== null) {
        server.acceptTextures = acceptTextures
      }

      const hidden = normalizeByteFlag(s.hidden)
      if (hidden !== null) {
        server.hidden = hidden
      }

      return server
    })
  }

  setPrototypeOf(data, serversDatSchema as any)

  const buffer = await serialize(data)
  const tmpPath = `${filePath}.${randomUUID()}.tmp`

  await fs.ensureDir(path.dirname(filePath))

  try {
    await fs.writeFile(tmpPath, buffer)
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    await fs.remove(tmpPath).catch(() => {})
    throw err
  }
}

export async function readNBT(filePath: string) {
  if (!(await fs.pathExists(filePath))) return []

  let readed: { servers?: IServer[] }
  try {
    const fileData = await fs.readFile(filePath)
    readed = await deserialize(new Uint8Array(fileData))
  } catch (err) {
    console.error(`Error reading NBT file:`, err)
    throw new ServersDatParseError(filePath, err)
  }

  if (!Array.isArray(readed?.servers)) return []

  return readed.servers.map((s) => ({
    name: s.name,
    ip: s.ip,
    icon: s.icon,
    acceptTextures: normalizeByteFlag(s.acceptTextures),
    hidden: normalizeByteFlag(s.hidden)
  }))
}
