export type JavaOverride = { major: number } | { home: string }

export type JavaRuntimeSource = 'managed' | 'system' | 'custom'

export type JavaChoiceVia = 'auto' | 'default' | 'instance'

export type JavaProblem = 'missing' | 'untrusted' | 'not_installed'

export type JavaFit = 'recommended' | 'newer' | 'legacy_risk' | 'too_old'

export interface JavaRuntimeInfo {
  home: string
  source: JavaRuntimeSource
  major: number
  version: string | null
  vendor: string | null
  arch: string | null
  missing?: boolean
  size?: number
}

export interface JavaRuntimeList {
  runtimes: JavaRuntimeInfo[]
  defaults: Record<string, string>
  scannedAt: number
}

export interface ResolvedJava {
  requiredMajor: number
  major: number
  via: JavaChoiceVia
  source: JavaRuntimeSource | null
  home: string | null
  client: string
  server: string
  vendor: string | null
  version: string | null
  problem?: JavaProblem
}

export type JavaAddResult =
  | { ok: true; runtime: JavaRuntimeInfo; list: JavaRuntimeList }
  | { ok: false; reason: 'cancelled' | 'not_java' | 'managed' | 'failed' }

export type JavaPrepareResult =
  | { ok: true; java: ResolvedJava }
  | { ok: false; problem: JavaProblem | 'busy' | 'download_failed'; java: ResolvedJava | null }

export const MANAGED_JAVA_MAJORS = [8, 17, 21, 25] as const

const MIN_MAJOR = 5
const MAX_MAJOR = 99
const MAX_HOME_LENGTH = 4096

export function isValidJavaMajor(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_MAJOR &&
    value <= MAX_MAJOR
  )
}

export function isAbsoluteJavaHome(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value || value.length > MAX_HOME_LENGTH) return false
  if (/[\0\r\n]/.test(value)) return false
  return /^(?:[A-Za-z]:[\\/]|\\\\[^\\]|\/)/.test(value)
}

export function normalizeJavaOverride(value: unknown): JavaOverride | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as { major?: unknown; home?: unknown }

  if (isAbsoluteJavaHome(candidate.home)) return { home: candidate.home }
  if (isValidJavaMajor(candidate.major)) return { major: candidate.major }

  return undefined
}

export function sameJavaOverride(
  left: JavaOverride | undefined,
  right: JavaOverride | undefined
): boolean {
  const a = normalizeJavaOverride(left)
  const b = normalizeJavaOverride(right)
  if (!a || !b) return !a && !b
  if ('home' in a && 'home' in b) return a.home === b.home
  if ('major' in a && 'major' in b) return a.major === b.major
  return false
}

export function normalizeJavaDefaults(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!value || typeof value !== 'object') return result

  for (const [key, home] of Object.entries(value as Record<string, unknown>)) {
    const major = Number(key)
    if (!isValidJavaMajor(major) || String(major) !== key) continue
    if (!isAbsoluteJavaHome(home)) continue
    result[key] = home
  }

  return result
}

export function javaFit(requiredMajor: number, selectedMajor: number): JavaFit {
  if (selectedMajor === requiredMajor) return 'recommended'
  if (selectedMajor < requiredMajor) return 'too_old'
  if (requiredMajor <= 8) return 'legacy_risk'
  return 'newer'
}

export function javaOverrideMajor(
  override: JavaOverride | undefined,
  runtimes: JavaRuntimeInfo[]
): number | null {
  if (!override) return null
  if ('major' in override) return override.major

  return runtimes.find((runtime) => sameJavaHome(runtime.home, override.home))?.major ?? null
}

export function sameJavaHome(left: string, right: string): boolean {
  const normalize = (value: string) => value.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const a = normalize(left)
  const b = normalize(right)
  if (/^[A-Za-z]:\//.test(a) || /^\/\//.test(a)) return a.toLowerCase() === b.toLowerCase()
  return a === b
}

const VENDOR_NAMES: [RegExp, string][] = [
  [/graalvm/i, 'GraalVM'],
  [/temurin|adoptium/i, 'Temurin'],
  [/adoptopenjdk/i, 'AdoptOpenJDK'],
  [/zulu|azul/i, 'Zulu'],
  [/corretto|amazon/i, 'Corretto'],
  [/liberica|bellsoft/i, 'Liberica'],
  [/semeru|openj9|ibm/i, 'Semeru'],
  [/jetbrains|jbr/i, 'JBR'],
  [/sapmachine|\bsap\b/i, 'SapMachine'],
  [/microsoft/i, 'Microsoft'],
  [/red ?hat/i, 'Red Hat'],
  [/oracle/i, 'Oracle']
]

export function shortJavaVendor(...hints: (string | null | undefined)[]): string | null {
  const text = hints.filter(Boolean).join(' ')
  if (!text.trim()) return null

  for (const [pattern, name] of VENDOR_NAMES) {
    if (pattern.test(text)) return name
  }

  const first = hints.find((hint) => hint && hint.trim())
  return first ? first.trim().split(/[\s,]+/)[0] || null : null
}

export function stripJavaOverride<T extends { overrides?: object }>(conf: T): T {
  const current = conf.overrides as { java?: unknown } | undefined
  if (!current || current.java === undefined) return conf

  const overrides = { ...current }
  delete overrides.java

  return {
    ...conf,
    overrides: Object.keys(overrides).length > 0 ? overrides : undefined
  }
}
