import { TSettings } from '../types/Settings'
import type { JavaOverride } from './javaRuntime'
import { GPU_PREFERENCES, type GpuPreference } from './gpuPreference'
import { GRAPHICS_BACKENDS, type GraphicsBackend } from './graphicsBackend'

export interface InstanceSettingsOverrides {
  xmx?: number
  optimizedJvm?: boolean
  highPriority?: boolean
  java?: JavaOverride
  gpuPreference?: GpuPreference
  graphicsBackend?: GraphicsBackend
  wrapperCommand?: string
  gameMode?: boolean
  mangoHud?: boolean
  launchEnv?: string
  preLaunchCommand?: string
  postExitCommand?: string
}

export const OVERRIDABLE_KEYS = [
  'xmx',
  'optimizedJvm',
  'highPriority',
  'java',
  'gpuPreference',
  'graphicsBackend',
  'wrapperCommand',
  'gameMode',
  'mangoHud',
  'launchEnv',
  'preLaunchCommand',
  'postExitCommand'
] as const

export type OverridableKey = (typeof OVERRIDABLE_KEYS)[number]

export const LAUNCH_COMMAND_KEYS = [
  'wrapperCommand',
  'launchEnv',
  'preLaunchCommand',
  'postExitCommand'
] as const satisfies readonly OverridableKey[]

export type LaunchCommandKey = (typeof LAUNCH_COMMAND_KEYS)[number]

export function isOverridden(
  overrides: InstanceSettingsOverrides | undefined,
  key: OverridableKey
): boolean {
  if (!overrides) return false
  return overrides[key] !== undefined
}

export function countOverrides(
  overrides: InstanceSettingsOverrides | undefined
): number {
  return OVERRIDABLE_KEYS.filter((key) => isOverridden(overrides, key)).length
}

export function resolveInstanceSettings(
  global: TSettings,
  overrides?: InstanceSettingsOverrides
): TSettings {
  if (!overrides) return global

  const resolved: TSettings = { ...global }

  if (typeof overrides.xmx === 'number' && Number.isFinite(overrides.xmx)) {
    resolved.xmx = Math.max(1024, Math.round(overrides.xmx))
  }

  if (typeof overrides.optimizedJvm === 'boolean') {
    resolved.optimizedJvm = overrides.optimizedJvm
  }

  if (typeof overrides.highPriority === 'boolean') {
    resolved.highPriority = overrides.highPriority
  }

  if (GPU_PREFERENCES.includes(overrides.gpuPreference as GpuPreference)) {
    resolved.gpuPreference = overrides.gpuPreference as GpuPreference
  }

  if (typeof overrides.gameMode === 'boolean') {
    resolved.gameMode = overrides.gameMode
  }

  if (typeof overrides.mangoHud === 'boolean') {
    resolved.mangoHud = overrides.mangoHud
  }

  for (const key of LAUNCH_COMMAND_KEYS) {
    if (typeof overrides[key] === 'string') resolved[key] = overrides[key]
  }

  return resolved
}

export function instanceGraphicsBackend(
  overrides: InstanceSettingsOverrides | undefined
): GraphicsBackend | null {
  const value = overrides?.graphicsBackend
  return GRAPHICS_BACKENDS.includes(value as GraphicsBackend)
    ? (value as GraphicsBackend)
    : null
}

export function setOverride<K extends OverridableKey>(
  overrides: InstanceSettingsOverrides | undefined,
  key: K,
  value: InstanceSettingsOverrides[K]
): InstanceSettingsOverrides {
  return { ...(overrides ?? {}), [key]: value }
}

export function clearOverride(
  overrides: InstanceSettingsOverrides | undefined,
  key: OverridableKey
): InstanceSettingsOverrides | undefined {
  if (!overrides) return undefined

  const next = { ...overrides }
  delete next[key]

  return countOverrides(next) > 0 ? next : undefined
}

export function withoutOverrides<
  T extends { overrides?: unknown; companionMod?: boolean }
>(conf: T): Omit<T, 'overrides' | 'companionMod'> {
  const copy = { ...conf }
  delete copy.overrides
  delete copy.companionMod
  return copy
}

export function withoutLaunchCommands<
  T extends { overrides?: InstanceSettingsOverrides }
>(conf: T): T {
  const current = conf.overrides
  if (!current || !LAUNCH_COMMAND_KEYS.some((key) => key in current)) {
    return conf
  }

  const overrides: InstanceSettingsOverrides = { ...current }
  for (const key of LAUNCH_COMMAND_KEYS) delete overrides[key]

  return {
    ...conf,
    overrides: countOverrides(overrides) > 0 ? overrides : undefined
  }
}
