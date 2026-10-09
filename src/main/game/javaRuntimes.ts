import fs from 'fs-extra'
import path from 'path'
import { execFile } from 'child_process'
import type { IPlatform } from '@/types/OS'
import {
  JavaAddResult,
  JavaOverride,
  JavaRuntimeInfo,
  JavaRuntimeList,
  JavaRuntimeSource,
  ResolvedJava,
  isAbsoluteJavaHome,
  isValidJavaMajor,
  normalizeJavaDefaults,
  normalizeJavaOverride,
  sameJavaHome,
  shortJavaVendor
} from '@/shared/javaRuntime'
import { getDataRoot } from '../utilities/dataRoot'
import { getOS } from '../utilities/other'
import { writeJsonAtomic } from '../utilities/atomicJson'
import { systemJavaDirs } from './systemJava'
import { Java } from './Java'

const REGISTRY_FILE = 'runtimes.json'
const PROBE_TIMEOUT_MS = 10000
const PROBE_CONCURRENCY = 4
const MAX_RUNTIMES = 64

interface RegistryEntry {
  home: string
  source: Exclude<JavaRuntimeSource, 'managed'>
  major: number
  version: string | null
  vendor: string | null
  arch: string | null
}

interface Registry {
  runtimes: RegistryEntry[]
  defaults: Record<string, string>
  scannedAt: number
}

export interface JavaProbe {
  home: string
  major: number
  version: string | null
  vendor: string | null
  arch: string | null
}

let registryCache: { file: string; mtimeMs: number; registry: Registry } | null = null
let scanInFlight: Promise<Registry> | null = null

function platform(): IPlatform | null {
  return getOS()
}

export function managedJavaDir(): string {
  return path.join(getDataRoot(), 'java')
}

function registryPath(): string {
  return path.join(managedJavaDir(), REGISTRY_FILE)
}

export function javaBinaries(home: string, os: IPlatform['os'] | undefined = platform()?.os) {
  const bin = path.join(home, 'bin')
  const ext = os === 'windows' ? '.exe' : ''

  return {
    client: path.join(bin, (os === 'windows' ? 'javaw' : 'java') + ext),
    server: path.join(bin, 'java' + ext)
  }
}

function emptyRegistry(): Registry {
  return { runtimes: [], defaults: {}, scannedAt: 0 }
}

function normalizeEntry(value: unknown): RegistryEntry | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!isAbsoluteJavaHome(raw.home) || !isValidJavaMajor(raw.major)) return null
  if (raw.source !== 'system' && raw.source !== 'custom') return null

  const text = (field: unknown) =>
    typeof field === 'string' && field.length <= 256 ? field : null

  return {
    home: path.resolve(raw.home),
    source: raw.source,
    major: raw.major,
    version: text(raw.version),
    vendor: text(raw.vendor),
    arch: text(raw.arch)
  }
}

export function normalizeRegistry(value: unknown): Registry {
  if (!value || typeof value !== 'object') return emptyRegistry()
  const raw = value as Record<string, unknown>
  const runtimes: RegistryEntry[] = []

  for (const item of Array.isArray(raw.runtimes) ? raw.runtimes : []) {
    const entry = normalizeEntry(item)
    if (!entry) continue
    if (runtimes.some((known) => sameJavaHome(known.home, entry.home))) continue
    runtimes.push(entry)
    if (runtimes.length >= MAX_RUNTIMES) break
  }

  return {
    runtimes,
    defaults: normalizeJavaDefaults(raw.defaults),
    scannedAt: typeof raw.scannedAt === 'number' ? raw.scannedAt : 0
  }
}

async function readRegistry(): Promise<Registry> {
  const file = registryPath()
  const stats = await fs.stat(file).catch(() => null)
  if (!stats) {
    registryCache = null
    return emptyRegistry()
  }

  if (registryCache && registryCache.file === file && registryCache.mtimeMs === stats.mtimeMs) {
    return registryCache.registry
  }

  const registry = normalizeRegistry(await fs.readJSON(file).catch(() => null))
  registryCache = { file, mtimeMs: stats.mtimeMs, registry }

  return registry
}

async function writeRegistry(registry: Registry): Promise<void> {
  const file = registryPath()
  await fs.ensureDir(path.dirname(file))
  await writeJsonAtomic(file, registry)
  registryCache = null
}

let registryQueue: Promise<unknown> = Promise.resolve()

function updateRegistry<T>(mutate: (registry: Registry) => Promise<T> | T): Promise<T> {
  const run = registryQueue
    .catch(() => {})
    .then(async () => {
      const registry = await readRegistry()
      const next: Registry = {
        runtimes: [...registry.runtimes],
        defaults: { ...registry.defaults },
        scannedAt: registry.scannedAt
      }
      const result = await mutate(next)
      await writeRegistry(next)
      return result
    })

  registryQueue = run
  return run
}

export function parseJavaProperties(output: string): Record<string, string> {
  const properties: Record<string, string> = {}
  let lastKey: string | null = null

  for (const line of output.split(/\r?\n/)) {
    const match = /^\s{4}([\w.]+)\s=\s?(.*)$/.exec(line)
    if (match) {
      lastKey = match[1]
      properties[lastKey] = match[2].trim()
      continue
    }

    if (lastKey && /^\s{8}\S/.test(line) && !properties[lastKey]) {
      properties[lastKey] = line.trim()
    }
  }

  return properties
}

export function majorFromSpecification(value: string | undefined): number | null {
  if (!value) return null
  const parts = value.split('.')
  const major = Number(parts[0] === '1' ? parts[1] : parts[0])
  return isValidJavaMajor(major) ? major : null
}

export function probeFromProperties(
  properties: Record<string, string>,
  fallbackHome: string
): JavaProbe | null {
  const major =
    majorFromSpecification(properties['java.specification.version']) ??
    majorFromSpecification(properties['java.version'])
  if (!major) return null

  const reportedHome = properties['java.home']

  return {
    home: reportedHome && path.isAbsolute(reportedHome) ? path.resolve(reportedHome) : fallbackHome,
    major,
    version: properties['java.runtime.version'] || properties['java.version'] || null,
    vendor: shortJavaVendor(
      properties['java.vendor.version'],
      properties['java.vm.name'],
      properties['java.vendor'],
      properties['java.runtime.name']
    ),
    arch: properties['os.arch'] || null
  }
}

function runJavaProperties(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(
        binary,
        ['-XshowSettings:properties', '-version'],
        { timeout: PROBE_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error) return resolve(null)
          resolve(`${stderr}\n${stdout}`)
        }
      )
    } catch {
      resolve(null)
    }
  })
}

export async function probeJavaBinary(binary: string): Promise<JavaProbe | null> {
  if (!(await fs.pathExists(binary))) return null

  const output = await runJavaProperties(binary)
  if (!output) return null

  const probe = probeFromProperties(parseJavaProperties(output), path.dirname(path.dirname(binary)))
  if (!probe) return null

  const { server } = javaBinaries(probe.home)
  if (!(await fs.pathExists(server))) {
    probe.home = path.dirname(path.dirname(binary))
  }

  return probe
}

function homeCandidates(root: string): string[] {
  return [root, path.join(root, 'Contents', 'Home'), path.join(root, 'jre')]
}

async function locateBinary(target: string): Promise<string | null> {
  const stats = await fs.stat(target).catch(() => null)
  if (!stats) return null
  if (stats.isFile()) return target

  for (const home of homeCandidates(target)) {
    const { server } = javaBinaries(home)
    if (await fs.pathExists(server)) return server
  }

  return null
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = []
  let index = 0

  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await worker(items[current])
    }
  })

  await Promise.all(lanes)
  return results
}

async function systemCandidates(os: IPlatform): Promise<string[]> {
  const roots: string[] = []

  const javaHome = process.env.JAVA_HOME?.trim()
  if (javaHome && path.isAbsolute(javaHome)) roots.push(javaHome)

  for (const dir of systemJavaDirs(os)) {
    const entries = await fs.readdir(dir).catch(() => [] as string[])
    for (const entry of entries) roots.push(path.join(dir, entry))
  }

  return roots
}

async function probeJavaOnPath(): Promise<JavaProbe | null> {
  const output = await runJavaProperties('java')
  if (!output) return null

  const properties = parseJavaProperties(output)
  const home = properties['java.home']
  if (!home || !path.isAbsolute(home)) return null

  const probe = probeFromProperties(properties, path.resolve(home))
  if (!probe) return null

  return (await fs.pathExists(javaBinaries(probe.home).server)) ? probe : null
}

function isInsideManaged(home: string): boolean {
  const relative = path.relative(managedJavaDir(), path.resolve(home))
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

export async function scanSystemJava(): Promise<JavaProbe[]> {
  const os = platform()
  if (!os) return []

  const roots = await systemCandidates(os)
  const binaries = (await mapLimit(roots, PROBE_CONCURRENCY, locateBinary)).filter(
    (binary): binary is string => Boolean(binary)
  )

  const probes = await mapLimit(binaries, PROBE_CONCURRENCY, probeJavaBinary)
  const found: JavaProbe[] = []

  const onPath = await probeJavaOnPath()
  for (const probe of [...probes, onPath]) {
    if (!probe || isInsideManaged(probe.home)) continue
    if (found.some((known) => sameJavaHome(known.home, probe.home))) continue
    found.push(probe)
  }

  return found
}

function toEntry(probe: JavaProbe, source: RegistryEntry['source']): RegistryEntry {
  return {
    home: probe.home,
    source,
    major: probe.major,
    version: probe.version,
    vendor: probe.vendor,
    arch: probe.arch
  }
}

async function rescan(): Promise<Registry> {
  if (scanInFlight) return scanInFlight

  scanInFlight = scanSystemJava()
    .then((found) =>
      updateRegistry((registry) => {
        const custom = registry.runtimes.filter((entry) => entry.source === 'custom')
        const system = found
          .filter((probe) => !custom.some((entry) => sameJavaHome(entry.home, probe.home)))
          .map((probe) => toEntry(probe, 'system'))
        const kept = registry.runtimes.filter(
          (entry) =>
            entry.source === 'system' &&
            !system.some((probe) => sameJavaHome(probe.home, entry.home)) &&
            Object.values(registry.defaults).some((home) => sameJavaHome(home, entry.home))
        )

        registry.runtimes = [...custom, ...system, ...kept].slice(0, MAX_RUNTIMES)
        registry.scannedAt = Date.now()
        return registry
      })
    )
    .finally(() => {
      scanInFlight = null
    })

  return scanInFlight
}

function readReleaseField(release: string, field: string): string | null {
  return new RegExp(`^${field}="([^"]*)"`, 'm').exec(release)?.[1] || null
}

export function managedMajorFromDir(name: string): number | null {
  if (/^jdk8u/i.test(name)) return 8
  const match = /^jdk-(\d+)(?:[.+-]|$)/i.exec(name)
  if (!match) return null
  const major = Number(match[1])
  return isValidJavaMajor(major) ? major : null
}

function managedHome(root: string): string {
  return platform()?.os === 'osx' ? path.join(root, 'Contents', 'Home') : root
}

let managedCache: { base: string; mtimeMs: number; runtimes: JavaRuntimeInfo[] } | null = null

async function listManaged(): Promise<JavaRuntimeInfo[]> {
  const base = managedJavaDir()
  const baseStats = await fs.stat(base).catch(() => null)
  if (!baseStats) return []

  if (managedCache && managedCache.base === base && managedCache.mtimeMs === baseStats.mtimeMs) {
    const alive = await Promise.all(
      managedCache.runtimes.map((runtime) => fs.pathExists(javaBinaries(runtime.home).server))
    )
    if (alive.every(Boolean)) return managedCache.runtimes
  }

  const runtimes = await readManaged(base)
  managedCache = { base, mtimeMs: baseStats.mtimeMs, runtimes }
  return runtimes
}

async function readManaged(base: string): Promise<JavaRuntimeInfo[]> {
  const names = await fs.readdir(base).catch(() => [] as string[])
  const runtimes: JavaRuntimeInfo[] = []

  for (const name of names) {
    const major = managedMajorFromDir(name)
    if (!major) continue

    const root = path.join(base, name)
    const stats = await fs.stat(root).catch(() => null)
    if (!stats?.isDirectory()) continue

    const home = managedHome(root)
    if (!(await fs.pathExists(javaBinaries(home).server))) continue

    const release = await fs.readFile(path.join(home, 'release'), 'utf-8').catch(() => '')

    runtimes.push({
      home,
      source: 'managed',
      major,
      version: readReleaseField(release, 'JAVA_VERSION'),
      vendor:
        shortJavaVendor(
          readReleaseField(release, 'IMPLEMENTOR_VERSION'),
          readReleaseField(release, 'IMPLEMENTOR')
        ) ?? 'Temurin',
      arch: readReleaseField(release, 'OS_ARCH')
    })
  }

  return runtimes.sort((left, right) => right.major - left.major)
}

async function toRuntimeInfo(entry: RegistryEntry): Promise<JavaRuntimeInfo> {
  const exists = await fs.pathExists(javaBinaries(entry.home).server)
  return { ...entry, ...(exists ? {} : { missing: true }) }
}

export async function listJavaRuntimes(options: { rescan?: boolean } = {}): Promise<JavaRuntimeList> {
  let registry = await readRegistry()
  if (options.rescan || registry.scannedAt === 0) {
    registry = await rescan().catch((error) => {
      console.error('[java] system scan failed:', error)
      return registry
    })
  }

  const [managed, registered] = await Promise.all([
    listManaged(),
    Promise.all(registry.runtimes.map(toRuntimeInfo))
  ])

  return {
    runtimes: [...managed, ...registered.sort((left, right) => right.major - left.major)],
    defaults: registry.defaults,
    scannedAt: registry.scannedAt
  }
}

const JAVA_BINARY_NAME = /^javaw?(?:\.exe)?$/i

export async function addCustomJava(target: string): Promise<JavaAddResult> {
  const binary = await locateBinary(path.resolve(target))
  if (!binary || !JAVA_BINARY_NAME.test(path.basename(binary))) {
    return { ok: false, reason: 'not_java' }
  }
  if (isInsideManaged(binary)) return { ok: false, reason: 'managed' }

  const probe = await probeJavaBinary(binary)
  if (!probe) return { ok: false, reason: 'not_java' }
  if (isInsideManaged(probe.home)) return { ok: false, reason: 'managed' }

  await updateRegistry((registry) => {
    const custom = toEntry(probe, 'custom')
    registry.runtimes = [
      custom,
      ...registry.runtimes.filter((entry) => !sameJavaHome(entry.home, probe.home))
    ].slice(0, MAX_RUNTIMES)
  })

  const list = await listJavaRuntimes()
  const runtime = list.runtimes.find((item) => sameJavaHome(item.home, probe.home))
  if (!runtime) return { ok: false, reason: 'failed' }

  return { ok: true, runtime, list }
}

export async function removeCustomJava(home: string): Promise<JavaRuntimeList> {
  await updateRegistry((registry) => {
    registry.runtimes = registry.runtimes.filter(
      (entry) => entry.source !== 'custom' || !sameJavaHome(entry.home, home)
    )
    for (const [major, value] of Object.entries(registry.defaults)) {
      if (sameJavaHome(value, home)) delete registry.defaults[major]
    }
  })

  return listJavaRuntimes()
}

export async function setJavaDefault(
  major: number,
  home: string | null
): Promise<JavaRuntimeList | null> {
  if (!isValidJavaMajor(major)) return null

  if (home !== null) {
    const runtime = await findTrustedJava(home)
    if (!runtime || runtime.source === 'managed' || runtime.major !== major) return null
  }

  await updateRegistry((registry) => {
    if (home === null) delete registry.defaults[String(major)]
    else registry.defaults[String(major)] = path.resolve(home)
  })

  return listJavaRuntimes()
}

export async function findTrustedJava(home: string): Promise<JavaRuntimeInfo | null> {
  if (!isAbsoluteJavaHome(home)) return null
  const resolved = path.resolve(home)

  if (isInsideManaged(resolved)) {
    const managed = await listManaged()
    return managed.find((runtime) => sameJavaHome(runtime.home, resolved)) ?? null
  }

  const registry = await readRegistry()
  const entry = registry.runtimes.find((item) => sameJavaHome(item.home, resolved))
  if (!entry) return null

  return (await fs.pathExists(javaBinaries(entry.home).server)) ? entry : null
}

async function fromRuntime(
  runtime: JavaRuntimeInfo,
  requiredMajor: number,
  via: ResolvedJava['via']
): Promise<ResolvedJava> {
  const { client, server } = javaBinaries(runtime.home)

  return {
    requiredMajor,
    major: runtime.major,
    via,
    source: runtime.source,
    home: runtime.home,
    client: (await fs.pathExists(client)) ? client : server,
    server,
    vendor: runtime.vendor,
    version: runtime.version
  }
}

async function resolveManaged(
  major: number,
  requiredMajor: number,
  via: ResolvedJava['via']
): Promise<ResolvedJava> {
  const java = new Java(major)
  await java.init()
  if (!java.javaPath) await java.useSystemJava()

  if (!java.javaPath) {
    return {
      requiredMajor,
      major,
      via,
      source: 'managed',
      home: null,
      client: '',
      server: '',
      vendor: null,
      version: null,
      problem: 'not_installed'
    }
  }

  const home = path.dirname(path.dirname(java.javaServerPath || java.javaPath))
  const managed = java.usingSystemJava ? null : await findTrustedJava(home)

  return {
    requiredMajor,
    major,
    via,
    source: java.usingSystemJava ? 'system' : 'managed',
    home,
    client: java.javaPath,
    server: java.javaServerPath || java.javaPath,
    vendor: managed?.vendor ?? null,
    version: managed?.version ?? null
  }
}

export async function resolveMajorJava(
  major: number,
  requiredMajor: number,
  via: 'auto' | 'instance'
): Promise<ResolvedJava> {
  const registry = await readRegistry()
  const preferred = registry.defaults[String(major)]

  if (preferred) {
    const runtime = await findTrustedJava(preferred)
    if (runtime && runtime.major === major) {
      return await fromRuntime(runtime, requiredMajor, via === 'auto' ? 'default' : via)
    }
    console.warn(
      `[java] the chosen Java ${major} at ${preferred} is unavailable, using the launcher's own`
    )
  }

  return resolveManaged(major, requiredMajor, via)
}

export async function resolveJava(options: {
  requiredMajor: number
  override?: JavaOverride
}): Promise<ResolvedJava> {
  const { requiredMajor } = options
  const override = normalizeJavaOverride(options.override)

  if (override && 'home' in override) {
    const runtime = await findTrustedJava(override.home)
    if (runtime) return await fromRuntime(runtime, requiredMajor, 'instance')

    const exists = await fs.pathExists(javaBinaries(override.home).server)
    return {
      requiredMajor,
      major: requiredMajor,
      via: 'instance',
      source: null,
      home: override.home,
      client: '',
      server: '',
      vendor: null,
      version: null,
      problem: exists ? 'untrusted' : 'missing'
    }
  }

  if (override && 'major' in override) {
    return resolveMajorJava(override.major, requiredMajor, 'instance')
  }

  return resolveMajorJava(requiredMajor, requiredMajor, 'auto')
}

export async function collectJavaForReport(): Promise<Record<string, unknown>> {
  const registry = await readRegistry()

  return {
    defaults: registry.defaults,
    scannedAt: registry.scannedAt ? new Date(registry.scannedAt).toISOString() : null,
    registered: await Promise.all(registry.runtimes.map(toRuntimeInfo))
  }
}
