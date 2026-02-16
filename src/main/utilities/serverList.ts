import { IServer } from '@/types/ServersList'

export function compareServers(servers1: IServer[], servers2: IServer[]) {
  if (servers1.length !== servers2.length) {
    return false
  }

  const norm = (s: IServer) => ({
    name: s.name,
    ip: s.ip,
    acceptTextures: s.acceptTextures ?? null
  })

  const a = servers1.map(norm)
  const b = servers2.map(norm)

  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false
    if (a[i].ip !== b[i].ip) return false
    if (a[i].acceptTextures !== b[i].acceptTextures) return false
  }

  return true
}
