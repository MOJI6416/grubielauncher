import { BACKEND_URL } from '@/shared/config'
import { getApiBaseUrl } from './apiHost'
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
  okStatus: (status: number) => boolean
}

const isSuccess = (status: number) => status === 200 || status === 206

const isReachable = (status: number) => status > 0 && status < 500

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
    url: `${BACKEND_URL}/health`,
    okStatus: isSuccess
  },
  {
    id: 'grubie_cdn',
    name: 'GrubieLauncher CDN',
    group: 'grubie',
    kind: 'http',
    url: 'https://cdn.grubielauncher.com/robots.txt',
    okStatus: isSuccess
  },
  {
    id: 'grubie_tunnel',
    name: 'GrubieLauncher Tunnel',
    group: 'grubie',
    kind: 'http',
    url: 'https://tunnel.grubielauncher.com/healthz',
    okStatus: isSuccess
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
    url: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
    okStatus: isSuccess
  },
  {
    id: 'mojang_libraries',
    name: 'Mojang Libraries',
    group: 'minecraft',
    kind: 'http',
    url: 'https://libraries.minecraft.net/com/mojang/logging/1.1.1/logging-1.1.1.jar',
    okStatus: isSuccess
  },
  {
    id: 'mojang_resources',
    name: 'Mojang Assets',
    group: 'minecraft',
    kind: 'http',
    url: 'https://resources.download.minecraft.net/9d/9dd32387135eefa7ab95996d52a5ca4cec8a3b30',
    okStatus: isSuccess
  },
  {
    id: 'mojang_services',
    name: 'Minecraft Services',
    group: 'minecraft',
    kind: 'http',
    url: 'https://api.minecraftservices.com/publickeys',
    okStatus: isSuccess
  },
  {
    id: 'mojang_session',
    name: 'Mojang Session Server',
    group: 'minecraft',
    kind: 'http',
    url: 'https://sessionserver.mojang.com/session/minecraft/profile/069a79f444e94726a5befca90e38aaf5',
    okStatus: isSuccess
  },
  {
    id: 'mirror_health',
    name: 'GrubieLauncher Mirror',
    group: 'mirror',
    kind: 'http',
    url: 'https://mirror.grubielauncher.com/healthz',
    okStatus: isSuccess
  },
  {
    id: 'mirror_manifest',
    name: 'Mirror → Mojang Meta',
    group: 'mirror',
    kind: 'http',
    url: 'https://mirror.grubielauncher.com/piston-meta/mc/game/version_manifest_v2.json',
    okStatus: isSuccess
  },
  {
    id: 'modrinth_api',
    name: 'Modrinth API',
    group: 'mods',
    kind: 'http',
    url: 'https://api.modrinth.com/v2/search?limit=1',
    okStatus: isSuccess
  },
  {
    id: 'modrinth_cdn',
    name: 'Modrinth CDN',
    group: 'mods',
    kind: 'http',
    url: 'https://cdn.modrinth.com/data/AANobbMI/versions/mc1.16.3-0.1.0/sodium-fabric-mc1.16.3-0.1.0.jar',
    okStatus: isSuccess
  },
  {
    id: 'curseforge_proxy',
    name: 'CurseForge API (proxy)',
    group: 'mods',
    kind: 'http',
    url: `${BACKEND_URL}/curseforge/categories/6`,
    okStatus: isSuccess
  },
  {
    id: 'curseforge_cdn',
    name: 'CurseForge Files CDN',
    group: 'mods',
    kind: 'http',
    url: 'https://mediafilez.forgecdn.net/',
    okStatus: isReachable
  },
  {
    id: 'fabric_meta',
    name: 'Fabric Meta',
    group: 'loaders',
    kind: 'http',
    url: 'https://meta.fabricmc.net/v2/versions/game',
    okStatus: isSuccess
  },
  {
    id: 'quilt_meta',
    name: 'Quilt Meta',
    group: 'loaders',
    kind: 'http',
    url: 'https://meta.quiltmc.org/v3/versions',
    okStatus: isSuccess
  },
  {
    id: 'forge_maven',
    name: 'Forge Maven',
    group: 'loaders',
    kind: 'http',
    url: 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml',
    okStatus: isSuccess
  },
  {
    id: 'adoptium_api',
    name: 'Adoptium API (Java)',
    group: 'java',
    kind: 'http',
    url: 'https://api.adoptium.net/v3/info/available_releases',
    okStatus: isSuccess
  },
  {
    id: 'java_cdn',
    name: 'GitHub Release CDN (Java)',
    group: 'java',
    kind: 'http',
    url: 'https://release-assets.githubusercontent.com/',
    okStatus: isReachable
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

    const ok = check.okStatus(response.status)

    return {
      id: check.id,
      name: check.name,
      group: check.group,
      target: check.url,
      ok,
      latencyMs: ok ? Date.now() - startedAt : null,
      error: ok ? undefined : `HTTP ${response.status}`
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

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${getApiBaseUrl()}/health`, {
      timeout: HTTP_TIMEOUT_MS,
      validateStatus: () => true
    })
    return response.status === 200
  } catch {
    return false
  }
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
