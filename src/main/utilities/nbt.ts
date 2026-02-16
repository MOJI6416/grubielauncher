import { IServer } from '@/types/ServersList'
import { deserialize } from '@xmcl/nbt'
import prismNbt from 'prismarine-nbt'
import fs from 'fs-extra'

export async function writeNBT(servers: IServer[], path: string) {
  try {
    const tag = prismNbt.comp({
      servers: prismNbt.list(
        prismNbt.comp([
          ...servers.map((s) => {
            const server: { [key: string]: any } = {
              name: prismNbt.string(s.name),
              ip: prismNbt.string(s.ip),
              icon: prismNbt.string(s.icon || '')
            }

            if (s.acceptTextures !== null) {
              server.acceptTextures = prismNbt.byte(s.acceptTextures)
            }

            return {
              ...server
            }
          })
        ])
      )
    })

    // @ts-ignore
    const buffer = prismNbt.writeUncompressed(tag)
    const u = new Uint8Array(buffer)

    await fs.writeFile(path, u)
  } catch (err) {
    console.log(`Error writing NBT file:`, err)
  }
}

export async function readNBT(path: string) {
  try {
    const fileData = await fs.readFile(path)
    const u = new Uint8Array(fileData)
    const readed: { servers: IServer[] } = await deserialize(u)
    
    return readed.servers.map((s) => ({
      name: s.name,
      ip: s.ip,
      icon: s.icon,
      acceptTextures: s.acceptTextures ?? null
    }))
  } catch (err) {
    console.log(`Error reading NBT file:`, err)
    return []
  }
}
