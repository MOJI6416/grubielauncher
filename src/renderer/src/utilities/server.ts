import { IServer } from '@/types/ServersList'

export function compareServers(servers1: IServer[], servers2: IServer[]) {
  if (servers1.length !== servers2.length) {
    return false
  }

  const names1 = servers1.map((mod) => mod.name)
  const names2 = servers2.map((mod) => mod.name)

  const ips1 = servers1.map((mod) => mod.ip)
  const ips2 = servers2.map((mod) => mod.ip)

  const acceptTextures1 = servers1.map((mod) => mod.acceptTextures)
  const acceptTextures2 = servers2.map((mod) => mod.acceptTextures)

  return (
    JSON.stringify(names1) === JSON.stringify(names2) &&
    JSON.stringify(ips1) === JSON.stringify(ips2) &&
    JSON.stringify(acceptTextures1) === JSON.stringify(acceptTextures2)
  )
}
