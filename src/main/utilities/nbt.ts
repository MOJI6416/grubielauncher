import { IServer } from '@/types/ServersList'
import { deserialize, serialize, setPrototypeOf, TagType } from '@xmcl/nbt'
import fs from 'fs-extra'

const serverInfoSchema = {
  name: TagType.String,
  ip: TagType.String,
  icon: TagType.String,
  acceptTextures: TagType.Byte
}

const serversDatSchema = {
  servers: [serverInfoSchema]
}

function normalizeAcceptTextures(value: unknown): number | null {
  return value === 0 || value === 1 ? value : null
}

export async function writeNBT(servers: IServer[], path: string) {
  try {
    const data = {
      servers: servers.map((s) => {
        const server: {
          name: string
          ip: string
          icon: string
          acceptTextures?: number
        } = {
          name: s.name,
          ip: s.ip,
          icon: s.icon || ''
        }

        const acceptTextures = normalizeAcceptTextures(s.acceptTextures)
        if (acceptTextures !== null) {
          server.acceptTextures = acceptTextures
        }

        return server
      })
    }

    setPrototypeOf(data, serversDatSchema as any)

    const buffer = await serialize(data)

    await fs.writeFile(path, buffer)
  } catch (err) {
    console.error(`Error writing NBT file:`, err)
  }
}

export async function readNBT(path: string) {
  try {
    if (!(await fs.pathExists(path))) return []

    const fileData = await fs.readFile(path)
    const u = new Uint8Array(fileData)
    const readed: { servers: IServer[] } = await deserialize(u)
    
    return readed.servers.map((s) => ({
      name: s.name,
      ip: s.ip,
      icon: s.icon,
      acceptTextures: normalizeAcceptTextures(s.acceptTextures)
    }))
  } catch (err) {
    console.error(`Error reading NBT file:`, err)
    return []
  }
}
