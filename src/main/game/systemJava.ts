import fs from 'fs-extra'
import path from 'path'
import { execFile } from 'child_process'
import { IPlatform } from '@/types/OS'

const SYSTEM_JAVA_DIRS: Record<string, string[]> = {
  windows: ['C:\\Program Files\\Java', 'C:\\Program Files\\Eclipse Adoptium'],
  linux: ['/usr/lib/jvm', '/usr/java'],
  osx: ['/Library/Java/JavaVirtualMachines']
}

const VERSION_TIMEOUT_MS = 10000

export interface ISystemJava {
  root: string
  client: string
  server: string
  major: number
}

function binaryPaths(root: string, platform: IPlatform) {
  const binDir =
    platform.os === 'osx' ? path.join(root, 'Contents', 'Home', 'bin') : path.join(root, 'bin')
  const ext = platform.os === 'windows' ? '.exe' : ''

  return {
    client: path.join(binDir, (platform.os === 'windows' ? 'javaw' : 'java') + ext),
    server: path.join(binDir, 'java' + ext)
  }
}

function parseMajor(output: string): number | null {
  const match = output.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null

  const first = Number(match[1])
  if (first === 1) return match[2] ? Number(match[2]) : null

  return Number.isFinite(first) ? first : null
}

async function probeMajor(binary: string): Promise<number | null> {
  if (binary !== 'java' && !(await fs.pathExists(binary))) return null

  return new Promise((resolve) => {
    try {
      execFile(
        binary,
        ['-version'],
        { timeout: VERSION_TIMEOUT_MS, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) return resolve(null)
          resolve(parseMajor(`${stderr}${stdout}`))
        }
      )
    } catch {
      resolve(null)
    }
  })
}

async function probeJavaHome(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        binary,
        ['-XshowSettings:properties', '-version'],
        { timeout: VERSION_TIMEOUT_MS, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) return resolve(null)

          const match = `${stderr}${stdout}`.match(/^\s*java\.home\s*=\s*(.+?)\s*$/m)
          resolve(match ? match[1] : null)
        }
      )
    } catch {
      resolve(null)
    }
  })
}

async function resolveJavaOnPath(
  major: number,
  platform: IPlatform
): Promise<ISystemJava | null> {
  const home = await probeJavaHome('java')
  if (!home) return null

  const root = path.resolve(home)
  const ext = platform.os === 'windows' ? '.exe' : ''
  const server = path.join(root, 'bin', 'java' + ext)
  const client = path.join(
    root,
    'bin',
    (platform.os === 'windows' ? 'javaw' : 'java') + ext
  )

  if (!(await fs.pathExists(server))) return null

  return {
    root,
    client: (await fs.pathExists(client)) ? client : server,
    server,
    major
  }
}

async function candidateRoots(platform: IPlatform): Promise<string[]> {
  const roots: string[] = []

  const javaHome = process.env.JAVA_HOME?.trim()
  if (javaHome) roots.push(javaHome)

  for (const dir of SYSTEM_JAVA_DIRS[platform.os] || []) {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      continue
    }

    for (const entry of entries) roots.push(path.join(dir, entry))
  }

  return roots
}

export async function findSystemJava(
  major: number,
  platform: IPlatform
): Promise<ISystemJava | null> {
  const seen = new Set<string>()

  for (const root of await candidateRoots(platform)) {
    const resolved = path.resolve(root)
    if (seen.has(resolved)) continue
    seen.add(resolved)

    const paths = binaryPaths(resolved, platform)
    const detected = await probeMajor(paths.server)
    if (detected !== major) continue

    return { root: resolved, client: paths.client, server: paths.server, major: detected }
  }

  const onPath = await probeMajor('java')
  if (onPath === major) return await resolveJavaOnPath(major, platform)

  return null
}
