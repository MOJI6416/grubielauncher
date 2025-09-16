import { IServer } from '@/types/ServersList'
import { deserialize } from '@xmcl/nbt'

const api = window.api
const fs = api.fs
const nbt = api.nbt

export async function writeNBT(servers: IServer[], path: string) {
  try {
    const tag = nbt.comp({
      servers: nbt.list(
        nbt.comp([
          ...servers.map((s) => {
            const server: { [key: string]: any } = {
              name: nbt.string(s.name),
              ip: nbt.string(s.ip),
              icon: nbt.string(s.icon || '')
            }

            if (s.acceptTextures !== null) {
              server.acceptTextures = nbt.byte(s.acceptTextures)
            }

            return {
              ...server
            }
          })
        ])
      )
    })

    // @ts-ignore
    const buffer = nbt.writeUncompressed(tag)
    const u = new Uint8Array(buffer)

    await fs.writeFile(path, u)
  } catch (err) {
    console.log(err)
  }
}

export async function readNBT(path: string) {
  try {
    const fileData = await fs.readFile(path)
    const u = new Uint8Array(fileData)
    const readed: { servers: IServer[] } = await deserialize(u)
    console.log(readed.servers)

    return readed.servers
  } catch (err) {
    console.log(err)
    return []
  }
}
