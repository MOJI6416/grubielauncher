import fs from 'fs-extra'
import type { IArch, IPlatform } from '@/types/OS'

const LWJGL3 = /^org\.lwjgl:lwjgl:(\d+)\.(\d+)/
const LWJGL_ANY = /^org\.lwjgl(?:\.lwjgl)?:lwjgl(?:-platform)?:/
const MACOS_ARM64_NATIVES = /:natives-macos-arm64(?:@|$)/

const FAT_MAGIC = 0xcafebabe
const FAT_MAGIC_64 = 0xcafebabf
const MH_MAGIC_64 = 0xfeedfacf
const MH_MAGIC = 0xfeedface
const CPU_TYPE_X86_64 = 0x01000007
const CPU_TYPE_ARM64 = 0x0100000c
const MAX_FAT_ARCHS = 16

export function hasArm64MacNatives(libraries: ReadonlyArray<{ name: string }>): boolean {
  let usesLwjgl = false

  for (const { name } of libraries) {
    if (MACOS_ARM64_NATIVES.test(name)) return true

    const lwjgl3 = LWJGL3.exec(name)
    if (lwjgl3) {
      const major = Number(lwjgl3[1])
      const minor = Number(lwjgl3[2])
      if (major > 3 || (major === 3 && minor >= 3)) return true
    }

    if (LWJGL_ANY.test(name)) usesLwjgl = true
  }

  return !usesLwjgl
}

export function gameJavaArch(
  platform: IPlatform | null,
  libraries: ReadonlyArray<{ name: string }> | undefined
): IArch | undefined {
  if (platform?.os !== 'osx' || platform.arch !== 'arm64') return undefined
  return hasArm64MacNatives(libraries ?? []) ? undefined : 'x64'
}

export function managedJavaArch(
  major: number,
  arch: IArch | undefined,
  platform: IPlatform | null
): IArch | undefined {
  if (arch) return arch
  if (platform?.os === 'osx' && platform.arch === 'arm64' && major <= 8) return 'x64'
  return undefined
}

export function normalizeJavaArch(value: string | null | undefined): IArch | null {
  switch ((value ?? '').toLowerCase()) {
    case 'aarch64':
    case 'arm64':
      return 'arm64'
    case 'x86_64':
    case 'amd64':
    case 'x64':
      return 'x64'
    default:
      return null
  }
}

function cpuArch(cpuType: number): IArch | null {
  if (cpuType === CPU_TYPE_X86_64) return 'x64'
  if (cpuType === CPU_TYPE_ARM64) return 'arm64'
  return null
}

export function machOArchs(header: Buffer): IArch[] {
  if (header.length < 8) return []

  const big = header.readUInt32BE(0)
  if (big === FAT_MAGIC || big === FAT_MAGIC_64) {
    const count = header.readUInt32BE(4)
    if (count === 0 || count > MAX_FAT_ARCHS) return []

    const entrySize = big === FAT_MAGIC_64 ? 32 : 20
    const archs: IArch[] = []
    for (let index = 0; index < count; index++) {
      const offset = 8 + index * entrySize
      if (offset + 4 > header.length) break
      const arch = cpuArch(header.readUInt32BE(offset))
      if (arch && !archs.includes(arch)) archs.push(arch)
    }
    return archs
  }

  const little = header.readUInt32LE(0)
  if (little === MH_MAGIC_64 || little === MH_MAGIC) {
    const arch = cpuArch(header.readUInt32LE(4))
    return arch ? [arch] : []
  }

  return []
}

export async function binaryArchs(file: string): Promise<IArch[]> {
  let handle: number | null = null
  try {
    handle = await fs.open(file, 'r')
    const header = Buffer.alloc(8 + MAX_FAT_ARCHS * 32)
    const { bytesRead } = await fs.read(handle, header, 0, header.length, 0)
    return machOArchs(header.subarray(0, bytesRead))
  } catch {
    return []
  } finally {
    if (handle !== null) await fs.close(handle).catch(() => {})
  }
}

export async function binaryRunsAs(file: string, arch: IArch | undefined): Promise<boolean> {
  if (!arch || process.platform !== 'darwin') return true
  const archs = await binaryArchs(file)
  return archs.length === 0 || archs.includes(arch)
}
