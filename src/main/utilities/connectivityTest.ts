import { BACKEND_URL } from '@/shared/config'
import { ConnectivityCheckResult, ConnectivityGroup } from '@/types/Connectivity'
import axios from 'axios'
import net from 'net'

const HTTP_TIMEOUT_MS = 8000
const TCP_TIMEOUT_MS = 8000

interface HttpCheck {
  id: string
  name: string
  group: ConnectivityGroup
  kind: 'http'
  url: string
}

interface TcpCheck {
  id: string
  name: string
  group: ConnectivityGroup
  kind: 'tcp'
  host: string
  port: number
}

type ConnectivityCheck = HttpCheck | TcpCheck

const CHECKS: ConnectivityCheck[] = [
  {
    id: 'grubie_api',
    name: 'GrubieLauncher API',
    group: 'grubie',
    kind: 'http',
    url: `${BACKEND_URL}/`
  },
  {
    id: 'grubie_cdn',
    name: 'GrubieLauncher CDN',
    group: 'grubie',
    kind: 'http',
    url: 'https://cdn.grubielauncher.com/'
  },
  {
    id: 'grubie_tunnel',
    name: 'GrubieLauncher Tunnel',
    group: 'grubie',
    kind: 'http',
    url: 'https://tunnel.grubielauncher.com/healthz'
  },
  {
    id: 'grubie_join',
    name: 'GrubieLauncher Join (25565)',
    group: 'grubie',
    kind: 'tcp',
    host: 'connectivity-test.join.grubielauncher.com',
    port: 25565
  },
  {
    id: 'mojang_piston',
    name: 'Mojang Version Meta',
    group: 'minecraft',
    kind: 'http',
    url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
  },
  {
    id: 'mojang_libraries',
    name: 'Mojang Libraries',
    group: 'minecraft',
    kind: 'http',
    url: 'https://libraries.minecraft.net/'
  },
  {
    id: 'mojang_resources',
    name: 'Mojang Assets',
    group: 'minecraft',
    kind: 'http',
    url: 'https://resources.download.minecraft.net/'
  },
  {
    id: 'mojang_services',
    name: 'Minecraft Services',
    group: 'minecraft',
    kind: 'http',
    url: 'https://api.minecraftservices.com/'
  },
  {
    id: 'mojang_session',
    name: 'Mojang Session Server',
    group: 'minecraft',
    kind: 'http',
    url: 'https://sessionserver.mojang.com/'
  },
  {
    id: 'modrinth_api',
    name: 'Modrinth API',
    group: 'mods',
    kind: 'http',
    url: 'https://api.modrinth.com/v2/'
  },
  {
    id: 'modrinth_cdn',
    name: 'Modrinth CDN',
    group: 'mods',
    kind: 'http',
    url: 'https://cdn.modrinth.com/'
  },
  {
    id: 'curseforge_proxy',
    name: 'CurseForge API (proxy)',
    group: 'mods',
    kind: 'http',
    url: `${BACKEND_URL}/curseforge/categories/6`
  },
  {
    id: 'curseforge_cdn',
    name: 'CurseForge CDN',
    group: 'mods',
    kind: 'http',
    url: 'https://cdn.curseforge.com/'
  },
  {
    id: 'fabric_meta',
    name: 'Fabric Meta',
    group: 'loaders',
    kind: 'http',
    url: 'https://meta.fabricmc.net/v2/versions/game'
  },
  {
    id: 'quilt_meta',
    name: 'Quilt Meta',
    group: 'loaders',
    kind: 'http',
    url: 'https://meta.quiltmc.org/v3/versions'
  },
  {
    id: 'forge_maven',
    name: 'Forge Maven',
    group: 'loaders',
    kind: 'http',
    url: 'https://maven.minecraftforge.net/'
  },
  {
    id: 'adoptium_api',
    name: 'Adoptium (Java)',
    group: 'java',
    kind: 'http',
    url: 'https://api.adoptium.net/'
  }
]

async function runHttpCheck(check: HttpCheck): Promise<ConnectivityCheckResult> {
  const startedAt = Date.now()

  try {
    const response = await axios.get(check.url, {
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true,
      maxRedirects: 0,
      responseType: 'stream',
      headers: { Range: 'bytes=0-0' }
    })

    try {
      response.data?.destroy?.()
    } catch {}

    return {
      id: check.id,
      name: check.name,
      group: check.group,
      target: check.url,
      ok: true,
      latencyMs: Date.now() - startedAt
    }
  } catch (error) {
    return {
      id: check.id,
      name: check.name,
      group: check.group,
      target: check.url,
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function runTcpCheck(check: TcpCheck): Promise<ConnectivityCheckResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const socket = net.createConnection({ host: check.host, port: check.port })

    const finish = (ok: boolean, error?: string) => {
      try {
        socket.destroy()
      } catch {}

      resolve({
        id: check.id,
        name: check.name,
        group: check.group,
        target: `${check.host}:${check.port}`,
        ok,
        latencyMs: ok ? Date.now() - startedAt : null,
        error
      })
    }

    socket.setTimeout(TCP_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false, 'timeout'))
    socket.once('error', (error) => finish(false, error.message))
  })
}

export function getConnectivityCheckCount(): number {
  return CHECKS.length
}

export async function runConnectivityTests(
  onResult?: (result: ConnectivityCheckResult) => void
): Promise<ConnectivityCheckResult[]> {
  return Promise.all(
    CHECKS.map(async (check) => {
      const result =
        check.kind === 'http'
          ? await runHttpCheck(check)
          : await runTcpCheck(check)
      onResult?.(result)
      return result
    })
  )
}
